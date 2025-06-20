// Updated Room.tsx
import PresenceClientSSR from "../components/Presence/PresenceClientSSR";
import GameSyncClient from "../components/GameSync/GameSyncClient";
import { Login } from "./user/Login";
import { User } from "@/db";

interface RoomProps {
  currentUser: User | null;
}

export default function Room({ currentUser }: RoomProps) {
  return (
    <GameSyncClient
      currentUser={currentUser}
      roomKey="/room"
      enableCursors={true}
      enableTrail={true}
      showStatus={true}
      cursorSmoothing={0.8}
      trailLength={5}
    >
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              🎮 The Presence Room
            </h1>
            <p className="text-lg text-gray-600">
              Move your mouse to see your cursor. Others in the room will see your movements in real-time!
            </p>
          </div>

          {/* User Info Card */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Your Profile</h2>
            {currentUser ? (
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                  {currentUser.username.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-lg font-medium text-gray-900">{currentUser.username}</p>
                  <p className="text-sm text-gray-500">Authenticated User</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-gray-600 mb-4">You're browsing anonymously. Sign in for a personalized experience!</p>
                <Login />
              </div>
            )}
          </div>

          {/* Original Presence System */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Basic Presence</h2>
            <PresenceClientSSR currentUser={currentUser} />
          </div>

          {/* Interactive Game Area */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Interactive Area</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Game Stats */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-100 rounded-lg p-4">
                <h3 className="font-semibold text-emerald-800 mb-2">Game Stats</h3>
                <p className="text-emerald-600 text-sm">
                  Mouse movements are tracked and synchronized across all connected users.
                </p>
              </div>

              {/* Real-time Features */}
              <div className="bg-gradient-to-r from-blue-50 to-cyan-100 rounded-lg p-4">
                <h3 className="font-semibold text-cyan-800 mb-2">Real-time Features</h3>
                <ul className="text-cyan-600 text-sm space-y-1">
                  <li>• Live cursor tracking</li>
                  <li>• Smooth animations</li>
                  <li>• Color-coded users</li>
                  <li>• Trail effects</li>
                </ul>
              </div>

              {/* Performance */}
              <div className="bg-gradient-to-r from-purple-50 to-violet-100 rounded-lg p-4">
                <h3 className="font-semibold text-violet-800 mb-2">Performance</h3>
                <ul className="text-violet-600 text-sm space-y-1">
                  <li>• ~60fps updates</li>
                  <li>• Smart throttling</li>
                  <li>• Efficient batching</li>
                  <li>• Auto-reconnection</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Interactive Playground */}
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Interactive Playground</h2>
            <div className="bg-gray-50 rounded-lg min-h-[400px] relative border-2 border-dashed border-gray-300">
              <div className="absolute inset-4 bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 rounded-lg">
                <div className="p-6 h-full flex flex-col justify-center items-center text-center">
                  <div className="mb-4">
                    <div className="w-16 h-16 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.122 2.122" />
                      </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-2">Move Your Mouse!</h3>
                    <p className="text-gray-600 max-w-md">
                      This area tracks your mouse movements and shows them to other users in real-time. 
                      Each user gets a unique colored cursor with their username.
                    </p>
                  </div>
                  
                  {/* Interactive Elements */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-md">
                    <div className="h-20 bg-red-200 rounded-lg hover:bg-red-300 transition-colors cursor-pointer flex items-center justify-center">
                      <span className="text-red-800 font-semibold">Red</span>
                    </div>
                    <div className="h-20 bg-blue-200 rounded-lg hover:bg-blue-300 transition-colors cursor-pointer flex items-center justify-center">
                      <span className="text-blue-800 font-semibold">Blue</span>
                    </div>
                    <div className="h-20 bg-green-200 rounded-lg hover:bg-green-300 transition-colors cursor-pointer flex items-center justify-center">
                      <span className="text-green-800 font-semibold">Green</span>
                    </div>
                    <div className="h-20 bg-yellow-200 rounded-lg hover:bg-yellow-300 transition-colors cursor-pointer flex items-center justify-center">
                      <span className="text-yellow-800 font-semibold">Yellow</span>
                    </div>
                  </div>
                  
                  <div className="mt-6 text-sm text-gray-500">
                    🎯 Hover over the colored squares • Move around to see the magic
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Technical Info */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">How It Works</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Client-Side Features:</h3>
                <ul className="space-y-1 text-gray-600">
                  <li>• Mouse position tracking with throttling</li>
                  <li>• Smooth cursor interpolation</li>
                  <li>• WebSocket connection management</li>
                  <li>• Automatic reconnection with backoff</li>
                  <li>• Session persistence across refreshes</li>
                  <li>• Anonymous user support</li>
                </ul>
              </div>
              
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Server-Side Features:</h3>
                <ul className="space-y-1 text-gray-600">
                  <li>• Durable Object state management</li>
                  <li>• Efficient message batching</li>
                  <li>• User cleanup and timeout handling</li>
                  <li>• Color assignment and username generation</li>
                  <li>• Room-based isolation</li>
                  <li>• Configurable performance settings</li>
                </ul>
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold text-gray-700 mb-2">Configuration:</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="font-medium text-gray-600">Update Rate:</span>
                  <div className="text-gray-500">~60fps (16ms)</div>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Throttle Distance:</span>
                  <div className="text-gray-500">5 pixels</div>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Smoothing:</span>
                  <div className="text-gray-500">0.8 factor</div>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Trail Length:</span>
                  <div className="text-gray-500">5 points</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </GameSyncClient>
  );
}