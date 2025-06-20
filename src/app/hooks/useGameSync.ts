// hooks/useGameSync.ts
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface MousePosition {
  x: number;
  y: number;
  timestamp: number;
}

interface GameUser {
  userId: string;
  username: string;
  mousePosition: MousePosition | null;
  cursorColor: string;
  score?: number;
  level?: number;
  gameData?: Record<string, any>;
}

interface UseGameSyncOptions {
  userId?: string;
  username?: string;
  enabled?: boolean;
  roomKey?: string;
  throttleDistance?: number;
  updateRate?: number;
}

interface UseGameSyncReturn {
  users: GameUser[];
  otherUsers: GameUser[];
  isConnected: boolean;
  totalUsers: number;
  currentUserId: string | null;
  currentUsername: string | null;
  sendGameAction: (action: any) => void;
  updateScore: (score: number) => void;
  updateLevel: (level: number) => void;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
}

// Client-side configuration (should match server constants)
const CLIENT_CONFIG = {
  MOUSE_UPDATE_RATE: 16, // ~60fps
  THROTTLE_DISTANCE: 5,
  HEARTBEAT_INTERVAL: 10000,
  RECONNECT_DELAY: 3000,
  MAX_RECONNECT_ATTEMPTS: 5,
};

export function useGameSync({
  userId: providedUserId,
  username: providedUsername,
  enabled = true,
  roomKey = '/game',
  throttleDistance = CLIENT_CONFIG.THROTTLE_DISTANCE,
  updateRate = CLIENT_CONFIG.MOUSE_UPDATE_RATE
}: UseGameSyncOptions = {}): UseGameSyncReturn {
  const [users, setUsers] = useState<GameUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [isMounted, setIsMounted] = useState(false);
  
  // User state
  const [effectiveUserId, setEffectiveUserId] = useState<string>('');
  const [effectiveUsername, setEffectiveUsername] = useState<string>('');
  const [cursorColor, setCursorColor] = useState<string>('#FF6B6B');
  
  // Refs for managing connections and state
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const mouseThrottleRef = useRef<NodeJS.Timeout | null>(null);
  const lastMousePositionRef = useRef<{ x: number; y: number } | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const mountedRef = useRef(true);

  // Initialize client-side only after mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      const tabId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const newUserId = providedUserId || `anon_${sessionId}_${tabId}`;
      const newUsername = providedUsername || `user-${Math.random().toString(36).substring(2, 7)}`;
      
      setEffectiveUserId(newUserId);
      setEffectiveUsername(newUsername);
      setIsMounted(true);
      
      console.log('🎮 GameSync IDs initialized:', { userId: newUserId, username: newUsername });
    }
  }, [providedUserId, providedUsername]);

  const cleanup = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (mouseThrottleRef.current) {
      clearTimeout(mouseThrottleRef.current);
      mouseThrottleRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    wsRef.current = null;
  }, []);

  const joinGame = useCallback(async () => {
    if (!enabled || !effectiveUserId) return;

    try {
      setConnectionStatus('connecting');
      
      const response = await fetch('/__gamesync/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          username: effectiveUsername,
          roomKey
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to join game: ${response.status}`);
      }

      const result = await response.json();
      setCursorColor(result.cursorColor);
      console.log('✅ Joined game room:', result);
      
      // Reset reconnect attempts on successful join
      reconnectAttemptsRef.current = 0;
      
    } catch (error) {
      console.error('❌ Failed to join game:', error);
      setConnectionStatus('error');
      throw error;
    }
  }, [enabled, effectiveUserId, effectiveUsername, roomKey]);

  const leaveGame = useCallback(async () => {
    if (!effectiveUserId) return;

    try {
      await fetch('/__gamesync/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          roomKey
        })
      });
      console.log('👋 Left game room');
    } catch (error) {
      console.error('❌ Failed to leave game:', error);
    }
  }, [effectiveUserId, roomKey]);

  const connectWebSocket = useCallback(async () => {
    if (!enabled || !isMounted || !effectiveUserId || wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      // First join the game
      await joinGame();

      // Then connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/__gamesync/ws?key=${encodeURIComponent(roomKey)}`;
      
      console.log('🎮 Connecting GameSync WebSocket:', wsUrl);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ GameSync WebSocket connected');
        setIsConnected(true);
        setConnectionStatus('connected');
        reconnectAttemptsRef.current = 0;
        
        // Request current state
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'request_state',
            userId: effectiveUserId,
            timestamp: Date.now()
          }));
        }
        
        // Start heartbeat
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: 'heartbeat',
              userId: effectiveUserId,
              timestamp: Date.now()
            }));
          }
        }, CLIENT_CONFIG.HEARTBEAT_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'game_state_update' || data.type === 'initial_state') {
            setUsers(data.users || []);
          }
        } catch (error) {
          console.error('❌ Failed to parse GameSync message:', error);
        }
      };

      ws.onclose = () => {
        console.log('🔌 GameSync WebSocket disconnected');
        setIsConnected(false);
        setConnectionStatus('disconnected');
        
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        
        // Attempt to reconnect with exponential backoff
        if (mountedRef.current && enabled && reconnectAttemptsRef.current < CLIENT_CONFIG.MAX_RECONNECT_ATTEMPTS) {
          const delay = CLIENT_CONFIG.RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current++;
          
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`🔄 Attempting to reconnect (attempt ${reconnectAttemptsRef.current})...`);
            connectWebSocket();
          }, delay);
        } else if (reconnectAttemptsRef.current >= CLIENT_CONFIG.MAX_RECONNECT_ATTEMPTS) {
          setConnectionStatus('error');
          console.error('❌ Max reconnection attempts reached');
        }
      };

      ws.onerror = (error) => {
        console.error('❌ GameSync WebSocket error:', error);
        setConnectionStatus('error');
      };

    } catch (error) {
      console.error('❌ Failed to connect GameSync:', error);
      setConnectionStatus('error');
      
      // Retry with exponential backoff
      if (mountedRef.current && enabled && reconnectAttemptsRef.current < CLIENT_CONFIG.MAX_RECONNECT_ATTEMPTS) {
        const delay = CLIENT_CONFIG.RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current);
        reconnectAttemptsRef.current++;
        
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, delay);
      }
    }
  }, [enabled, joinGame, effectiveUserId, roomKey, isMounted]);

  // Mouse tracking
  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !effectiveUserId) return;

    const currentPos = { x: event.clientX, y: event.clientY };
    
    // Throttle by distance
    if (lastMousePositionRef.current) {
      const distance = Math.sqrt(
        Math.pow(currentPos.x - lastMousePositionRef.current.x, 2) +
        Math.pow(currentPos.y - lastMousePositionRef.current.y, 2)
      );
      
      if (distance < throttleDistance) {
        return; // Skip this update
      }
    }

    // Throttle by time
    if (mouseThrottleRef.current) return;
    
    mouseThrottleRef.current = setTimeout(() => {
      mouseThrottleRef.current = null;
      
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({
            type: 'mouse_move',
            userId: effectiveUserId,
            timestamp: Date.now(),
            data: {
              x: currentPos.x,
              y: currentPos.y,
              viewportWidth: window.innerWidth,
              viewportHeight: window.innerHeight
            }
          }));
          
          lastMousePositionRef.current = currentPos;
        } catch (error) {
          console.error('❌ Failed to send mouse position:', error);
        }
      }
    }, updateRate);
  }, [effectiveUserId, throttleDistance, updateRate]);

  // Game action functions
  const sendGameAction = useCallback((action: any) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !effectiveUserId) return;

    try {
      wsRef.current.send(JSON.stringify({
        type: 'game_action',
        userId: effectiveUserId,
        timestamp: Date.now(),
        data: action
      }));
    } catch (error) {
      console.error('❌ Failed to send game action:', error);
    }
  }, [effectiveUserId]);

  const updateScore = useCallback((score: number) => {
    sendGameAction({ score });
  }, [sendGameAction]);

  const updateLevel = useCallback((level: number) => {
    sendGameAction({ level });
  }, [sendGameAction]);

  // Connect on mount and when dependencies change
  useEffect(() => {
    if (enabled && isMounted && effectiveUserId) {
      connectWebSocket();
    }
    
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [enabled, connectWebSocket, cleanup, isMounted, effectiveUserId]);

  // Set up mouse tracking
  useEffect(() => {
    if (!enabled || !isMounted) return;

    document.addEventListener('mousemove', handleMouseMove);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [enabled, handleMouseMove, isMounted]);

  // Leave game on unmount
  useEffect(() => {
    return () => {
      leaveGame();
    };
  }, [leaveGame]);

  // Handle page visibility changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('📱 Page hidden, maintaining GameSync connection');
      } else {
        console.log('📱 Page visible, ensuring GameSync connection');
        if (!isConnected && enabled && isMounted && effectiveUserId) {
          connectWebSocket();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isConnected, enabled, connectWebSocket, isMounted, effectiveUserId]);

  // Filter out current user from "other users" list
  const otherUsers = users.filter(user => {
    if (providedUserId && user.userId === providedUserId) {
      return false;
    }
    if (!providedUserId && user.userId === effectiveUserId) {
      return false;
    }
    return true;
  });

  console.log('🎮 GameSync debug:', {
    totalUsers: users.length,
    otherUsers: otherUsers.length,
    isConnected,
    connectionStatus,
    effectiveUserId,
    isMounted
  });
  
  return {
    users,
    otherUsers,
    isConnected: isConnected && isMounted,
    totalUsers: users.length,
    currentUserId: isMounted ? effectiveUserId : null,
    currentUsername: isMounted ? effectiveUsername : null,
    sendGameAction,
    updateScore,
    updateLevel,
    connectionStatus
  };
}