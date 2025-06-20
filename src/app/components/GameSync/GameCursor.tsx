// components/GameSync/GameCursor.tsx
'use client';

import { useState, useEffect } from 'react';

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
}

interface GameCursorProps {
  user: GameUser;
  smoothing?: number;
  showTrail?: boolean;
  trailLength?: number;
}

interface CursorPosition {
  x: number;
  y: number;
  opacity: number;
}

export function GameCursor({ 
  user, 
  smoothing = 0.8, 
  showTrail = true, 
  trailLength = 5 
}: GameCursorProps) {
  const [currentPosition, setCurrentPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [trail, setTrail] = useState<CursorPosition[]>([]);
  const [isVisible, setIsVisible] = useState(false);
  const [animationId, setAnimationId] = useState<number | null>(null);

  // Smooth cursor movement animation
  useEffect(() => {
    if (!user.mousePosition) {
      setIsVisible(false);
      return;
    }

    const targetX = user.mousePosition.x;
    const targetY = user.mousePosition.y;
    setIsVisible(true);

    // Cancel previous animation
    if (animationId) {
      cancelAnimationFrame(animationId);
    }

    const animate = () => {
      setCurrentPosition(prev => {
        const dx = targetX - prev.x;
        const dy = targetY - prev.y;
        
        // If we're close enough, snap to target
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
          return { x: targetX, y: targetY };
        }
        
        // Smooth interpolation
        return {
          x: prev.x + dx * (1 - smoothing),
          y: prev.y + dy * (1 - smoothing)
        };
      });
      
      // Continue animation if we haven't reached target
      setAnimationId(requestAnimationFrame(animate));
    };

    setAnimationId(requestAnimationFrame(animate));

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [user.mousePosition, smoothing, animationId]);

  // Update trail
  useEffect(() => {
    if (!showTrail || !isVisible) return;

    setTrail(prev => {
      const newTrail = [
        { ...currentPosition, opacity: 1 },
        ...prev.slice(0, trailLength - 1).map((point, index) => ({
          ...point,
          opacity: 1 - (index + 1) / trailLength
        }))
      ];
      return newTrail;
    });
  }, [currentPosition, showTrail, trailLength, isVisible]);

  if (!isVisible || !user.mousePosition) {
    return null;
  }

  return (
    <>
      {/* Cursor Trail */}
      {showTrail && trail.map((point, index) => (
        <div
          key={`${user.userId}-trail-${index}`}
          className="fixed pointer-events-none z-50 transition-opacity duration-100"
          style={{
            left: point.x - 2,
            top: point.y - 2,
            opacity: point.opacity * 0.6,
            transform: 'translate(-50%, -50%)'
          }}
        >
          <div
            className="w-1 h-1 rounded-full"
            style={{
              backgroundColor: user.cursorColor,
              transform: `scale(${1 - index * 0.15})`
            }}
          />
        </div>
      ))}

      {/* Main Cursor */}
      <div
        className="fixed pointer-events-none z-50 transition-opacity duration-200"
        style={{
          left: currentPosition.x,
          top: currentPosition.y,
          transform: 'translate(-2px, -2px)'
        }}
      >
        {/* Cursor Icon */}
        <div className="relative">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            className="drop-shadow-lg"
          >
            <path
              d="M8.5 2.5L21 12L13.5 14.5L11 22L8.5 2.5Z"
              fill={user.cursorColor}
              stroke="white"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          
          {/* User Label */}
          <div
            className="absolute top-6 left-2 px-2 py-1 rounded-md text-xs font-medium text-white shadow-lg whitespace-nowrap transform transition-all duration-200 hover:scale-110"
            style={{
              backgroundColor: user.cursorColor,
              maxWidth: '120px'
            }}
          >
            <div className="flex items-center gap-1">
              <span className="truncate">{user.username}</span>
              {user.score !== undefined && (
                <span className="text-xs opacity-80">({user.score})</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Multiple cursors container component
interface GameCursorsProps {
  users: GameUser[];
  currentUserId?: string | null;
  smoothing?: number;
  showTrail?: boolean;
  trailLength?: number;
}

export function GameCursors({ 
  users, 
  currentUserId, 
  smoothing = 0.8, 
  showTrail = true, 
  trailLength = 5 
}: GameCursorsProps) {
  // Filter out current user and users without mouse positions
  const otherUsers = users.filter(user => 
    user.userId !== currentUserId && 
    user.mousePosition !== null
  );

  return (
    <div className="fixed inset-0 pointer-events-none z-40">
      {otherUsers.map(user => (
        <GameCursor
          key={user.userId}
          user={user}
          smoothing={smoothing}
          showTrail={showTrail}
          trailLength={trailLength}
        />
      ))}
    </div>
  );
}

// Game sync status indicator
interface GameSyncStatusProps {
  isConnected: boolean;
  totalUsers: number;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
}

export function GameSyncStatus({ isConnected, totalUsers, connectionStatus }: GameSyncStatusProps) {
  const statusConfig = {
    connecting: { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: '🔄', text: 'Connecting...' },
    connected: { color: 'text-green-600', bg: 'bg-green-100', icon: '✅', text: 'Connected' },
    disconnected: { color: 'text-gray-600', bg: 'bg-gray-100', icon: '⭕', text: 'Disconnected' },
    error: { color: 'text-red-600', bg: 'bg-red-100', icon: '❌', text: 'Error' }
  };

  const config = statusConfig[connectionStatus];

  return (
    <div className={`fixed top-4 right-4 px-3 py-2 rounded-lg shadow-lg ${config.bg} ${config.color} z-50`}>
      <div className="flex items-center gap-2 text-sm font-medium">
        <span>{config.icon}</span>
        <span>{config.text}</span>
        {isConnected && (
          <span className="text-xs opacity-75">
            {totalUsers} user{totalUsers !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}