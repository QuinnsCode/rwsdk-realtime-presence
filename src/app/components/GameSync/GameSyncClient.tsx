// components/GameSync/GameSyncClient.tsx
'use client';

import { useState, useEffect } from 'react';
import { type User } from "@/db";
import { useGameSync } from "@/app/hooks/useGameSync";
import { GameCursors, GameSyncStatus } from './GameCursor';

interface GameSyncClientProps {
  currentUser: User | null;
  roomKey?: string;
  enableCursors?: boolean;
  enableTrail?: boolean;
  showStatus?: boolean;
  cursorSmoothing?: number;
  trailLength?: number;
  children?: React.ReactNode;
}

export default function GameSyncClient({
  currentUser,
  roomKey = '/room',
  enableCursors = true,
  enableTrail = true,
  showStatus = true,
  cursorSmoothing = 0.8,
  trailLength = 5,
  children
}: GameSyncClientProps) {
  const [isMounted, setIsMounted] = useState(false);

  // Use our game sync hook
  const {
    users,
    otherUsers,
    isConnected,
    totalUsers,
    currentUserId,
    currentUsername,
    sendGameAction,
    updateScore,
    updateLevel,
    connectionStatus
  } = useGameSync({
    userId: currentUser?.id,
    username: currentUser?.username,
    enabled: true,
    roomKey: roomKey,
    throttleDistance: 5, // pixels
    updateRate: 16 // ~60fps
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Show loading state during SSR or initial hydration
  if (!isMounted) {
    return (
      <div className="relative">
        {children}
        {showStatus && (
          <div className="fixed top-4 right-4 px-3 py-2 rounded-lg shadow-lg bg-gray-100 text-gray-600 z-50">
            <div className="flex items-center gap-2 text-sm font-medium">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
              <span>Initializing...</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Main content */}
      {children}
      
      {/* Game cursors overlay */}
      {enableCursors && (
        <GameCursors
          users={users}
          currentUserId={currentUserId}
          smoothing={cursorSmoothing}
          showTrail={enableTrail}
          trailLength={trailLength}
        />
      )}
      
      {/* Connection status */}
      {showStatus && (
        <GameSyncStatus
          isConnected={isConnected}
          totalUsers={totalUsers}
          connectionStatus={connectionStatus}
        />
      )}
      
      {/* Debug panel in development */}
      {process.env.NODE_ENV === 'development' && (
        <GameSyncDebugPanel
          users={users}
          currentUser={currentUser}
          currentUserId={currentUserId}
          currentUsername={currentUsername}
          isConnected={isConnected}
          connectionStatus={connectionStatus}
          sendGameAction={sendGameAction}
          updateScore={updateScore}
          updateLevel={updateLevel}
        />
      )}
    </div>
  );
}

// Debug panel for development
interface GameSyncDebugPanelProps {
  users: any[];
  currentUser: User | null;
  currentUserId: string | null;
  currentUsername: string | null;
  isConnected: boolean;
  connectionStatus: string;
  sendGameAction: (action: any) => void;
  updateScore: (score: number) => void;
  updateLevel: (level: number) => void;
}

function GameSyncDebugPanel({
  users,
  currentUser,
  currentUserId,
  currentUsername,
  isConnected,
  connectionStatus,
  sendGameAction,
  updateScore,
  updateLevel
}: GameSyncDebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [testScore, setTestScore] = useState(0);
  const [testLevel, setTestLevel] = useState(1);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 left-4 bg-purple-600 text-white px-3 py-1 rounded text-xs font-mono z-50 hover:bg-purple-700"
      >
        GameSync Debug
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 bg-black bg-opacity-90 text-white p-4 rounded-lg max-w-md max-h-96 overflow-auto z-50 font-mono text-xs">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-purple-400">GameSync Debug</h3>
        <button
          onClick={() => setIsOpen(false)}
          className="text-gray-400 hover:text-white"
        >
          ✕
        </button>
      </div>
      
      <div className="space-y-2">
        <div>
          <span className="text-yellow-400">Status:</span> {connectionStatus}
        </div>
        <div>
          <span className="text-yellow-400">Connected:</span> {isConnected ? 'Yes' : 'No'}
        </div>
        <div>
          <span className="text-yellow-400">Current User:</span> {currentUsername} ({currentUserId})
        </div>
        <div>
          <span className="text-yellow-400">Auth User:</span> {currentUser?.username || 'Anonymous'}
        </div>
        <div>
          <span className="text-yellow-400">Total Users:</span> {users.length}
        </div>
        
        <div className="border-t border-gray-600 pt-2 mt-2">
          <div className="text-green-400 font-bold mb-1">Active Users:</div>
          {users.map(user => (
            <div key={user.userId} className="ml-2 text-xs">
              <span style={{ color: user.cursorColor }}>●</span> {user.username}
              {user.mousePosition && (
                <span className="text-gray-400">
                  {' '}({Math.round(user.mousePosition.x)}, {Math.round(user.mousePosition.y)})
                </span>
              )}
              {user.score !== undefined && (
                <span className="text-blue-400"> Score: {user.score}</span>
              )}
            </div>
          ))}
        </div>
        
        <div className="border-t border-gray-600 pt-2 mt-2">
          <div className="text-blue-400 font-bold mb-2">Test Actions:</div>
          <div className="space-y-2">
            <div className="flex gap-2 items-center">
              <input
                type="number"
                value={testScore}
                onChange={(e) => setTestScore(Number(e.target.value))}
                className="bg-gray-800 text-white px-2 py-1 rounded w-16 text-xs"
              />
              <button
                onClick={() => updateScore(testScore)}
                className="bg-blue-600 px-2 py-1 rounded text-xs hover:bg-blue-700"
                disabled={!isConnected}
              >
                Set Score
              </button>
            </div>
            
            <div className="flex gap-2 items-center">
              <input
                type="number"
                value={testLevel}
                onChange={(e) => setTestLevel(Number(e.target.value))}
                className="bg-gray-800 text-white px-2 py-1 rounded w-16 text-xs"
              />
              <button
                onClick={() => updateLevel(testLevel)}
                className="bg-green-600 px-2 py-1 rounded text-xs hover:bg-green-700"
                disabled={!isConnected}
              >
                Set Level
              </button>
            </div>
            
            <button
              onClick={() => sendGameAction({ type: 'test', data: 'Hello from debug!' })}
              className="bg-purple-600 px-2 py-1 rounded text-xs hover:bg-purple-700 w-full"
              disabled={!isConnected}
            >
              Send Test Action
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}