// hooks/usePresence.ts
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface PresenceUser {
  userId: string;
  username: string;
  joinedAt: number;
  lastSeen: number;
}

interface UsePresenceOptions {
  userId?: string;
  username?: string;
  enabled?: boolean;
  roomKey?: string; // Allow different rooms
}

interface UsePresenceReturn {
  presence: PresenceUser[];
  otherUsers: PresenceUser[];
  isConnected: boolean;
  totalUsers: number;
  currentUserId: string | null;
  currentUsername: string | null;
}

// Generate a stable session ID that persists across refreshes but not across tabs in incognito
function generateSessionId(): string {
  // Only run in browser environment
  if (typeof window === 'undefined') {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  // Try to get existing session ID from sessionStorage first
  try {
    const existing = sessionStorage.getItem('presence_session_id');
    if (existing) {
      console.log('🔄 Reusing existing session ID:', existing);
      return existing;
    }
  } catch (e) {
    // sessionStorage not available or blocked
    console.log('⚠️ sessionStorage not available, using memory-only ID');
  }

  // Generate new session ID
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  
  // Try to store it for this session
  try {
    sessionStorage.setItem('presence_session_id', sessionId);
    console.log('💾 Stored new session ID:', sessionId);
  } catch (e) {
    // Can't store, but that's okay - will work for this page load
    console.log('⚠️ Could not store session ID, using memory-only');
  }
  
  return sessionId;
}

// Generate a tab-specific ID that's unique per tab but consistent across refreshes
function generateTabId(): string {
  // Only run in browser environment
  if (typeof window === 'undefined') {
    return `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // For incognito mode compatibility, we use a combination approach:
  // 1. Try sessionStorage (works in normal mode, per-tab)
  // 2. Fall back to a combination of session + page load time
  
  let tabId: string;
  
  try {
    const existing = sessionStorage.getItem('presence_tab_id');
    if (existing) {
      return existing;
    }
    
    tabId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('presence_tab_id', tabId);
  } catch (e) {
    // Fallback for when sessionStorage is not available
    tabId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  
  return tabId;
}

// Generate or retrieve a persistent username for anonymous users
function getOrGenerateUsername(sessionId: string): string {
  // Only run in browser environment
  if (typeof window === 'undefined') {
    return `user-${Math.random().toString(36).substring(2, 9)}`;
  }

  const storageKey = `presence_username_${sessionId}`;
  
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) {
      console.log('♻️ Reusing existing username:', existing);
      return existing;
    }
  } catch (e) {
    // sessionStorage not available
  }

  // Generate new username (you can replace this with your existing logic)
  const adjectives = ['happy', 'clever', 'bright', 'swift', 'calm', 'bold', 'wise', 'kind'];
  const animals = ['cat', 'dog', 'fox', 'owl', 'bear', 'wolf', 'deer', 'lion'];
  
  const username = `${adjectives[Math.floor(Math.random() * adjectives.length)]}-${animals[Math.floor(Math.random() * animals.length)]}`;
  
  try {
    sessionStorage.setItem(storageKey, username);
    console.log('💾 Stored new username:', username);
  } catch (e) {
    // Can't store, but that's okay
  }
  
  return username;
}

export function usePresence({
  userId: providedUserId,
  username: providedUsername,
  enabled = true,
  roomKey = '/default'
}: UsePresenceOptions = {}): UsePresenceReturn {
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);
  
  // Generate stable IDs only after mount (client-side only)
  const [sessionId, setSessionId] = useState<string>('');
  const [tabId, setTabId] = useState<string>('');
  const [effectiveUserId, setEffectiveUserId] = useState<string>('');
  const [effectiveUsername, setEffectiveUsername] = useState<string>('');

  // Initialize client-side IDs after mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const newSessionId = generateSessionId();
      const newTabId = generateTabId();
      const newEffectiveUserId = providedUserId || `anon_${newSessionId}_${newTabId}`;
      const newEffectiveUsername = providedUsername || getOrGenerateUsername(newSessionId);
      
      setSessionId(newSessionId);
      setTabId(newTabId);
      setEffectiveUserId(newEffectiveUserId);
      setEffectiveUsername(newEffectiveUsername);
      setIsMounted(true);
      
      console.log('🆔 Presence IDs initialized:', {
        sessionId: newSessionId,
        tabId: newTabId,
        effectiveUserId: newEffectiveUserId,
        effectiveUsername: newEffectiveUsername,
        providedUserId,
        providedUsername
      });
    }
  }, [providedUserId, providedUsername]);

  const cleanup = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
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

  const joinPresence = useCallback(async () => {
    if (!enabled || !effectiveUserId) return;

    try {
      const response = await fetch('/__realtime/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          username: effectiveUsername,
          action: 'join',
          pathname: roomKey
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to join presence: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Joined presence:', result);
    } catch (error) {
      console.error('❌ Failed to join presence:', error);
      throw error;
    }
  }, [enabled, effectiveUserId, effectiveUsername, roomKey]);

  const leavePresence = useCallback(async () => {
    if (!effectiveUserId) return;

    try {
      await fetch('/__realtime/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: effectiveUserId,
          action: 'leave',
          pathname: roomKey
        })
      });
      console.log('👋 Left presence');
    } catch (error) {
      console.error('❌ Failed to leave presence:', error);
    }
  }, [effectiveUserId, roomKey]);

  const connectWebSocket = useCallback(async () => {
    if (!enabled || !isMounted || !effectiveUserId || wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      // First join presence
      await joinPresence();

      // Then connect WebSocket
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/__realtime?key=${encodeURIComponent(roomKey)}`;
      
      console.log('🔌 Connecting WebSocket:', wsUrl);
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('✅ WebSocket connected');
        setIsConnected(true);
        
        // Start heartbeat
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN && effectiveUserId) {
            ws.send(JSON.stringify({
              type: 'presence_heartbeat',
              userId: effectiveUserId,
              timestamp: Date.now()
            }));
            console.log('💓 Sent heartbeat for:', effectiveUserId);
          }
        }, 20000); // Send heartbeat every 20 seconds
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'presence_update') {
            setPresence(data.data || []);
            console.log('📡 Received presence update:', data.data);
          }
        } catch (error) {
          console.error('❌ Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        setIsConnected(false);
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        
        // Attempt to reconnect after a delay if still mounted
        if (mountedRef.current && enabled) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('🔄 Attempting to reconnect...');
            connectWebSocket();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setIsConnected(false);
      };

    } catch (error) {
      console.error('❌ Failed to connect:', error);
      // Retry connection after delay
      if (mountedRef.current && enabled) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      }
    }
  }, [enabled, joinPresence, effectiveUserId, roomKey, isMounted]);

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

  // Leave presence on unmount
  useEffect(() => {
    return () => {
      leavePresence();
    };
  }, [leavePresence]);

  // Handle page visibility changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log('📱 Page hidden, maintaining connection');
        // Keep connection alive but reduce heartbeat frequency could be added here
      } else {
        console.log('📱 Page visible, ensuring connection');
        if (!isConnected && enabled && isMounted && effectiveUserId) {
          connectWebSocket();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isConnected, enabled, connectWebSocket, isMounted, effectiveUserId]);

  // Filter out current user from presence list
  const otherUsers = presence.filter(user => user.userId !== effectiveUserId);
  
  return {
    presence,
    otherUsers,
    isConnected: isConnected && isMounted,
    totalUsers: presence.length,
    currentUserId: isMounted ? effectiveUserId : null,
    currentUsername: isMounted ? effectiveUsername : null
  };
}