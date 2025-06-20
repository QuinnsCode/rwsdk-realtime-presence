// src/app/gamesync/routes.ts
import { route } from "rwsdk/router";
import { env } from "cloudflare:workers";

/**
 * Helper function to extract room key from request
 */
async function extractRoomKey(request: Request): Promise<string> {
  let key = '/default';
  
  if (request.method === 'POST') {
    try {
      const clonedRequest = request.clone();
      const body = await clonedRequest.json() as { roomKey?: string };
      key = body?.roomKey || '/default';
    } catch (e) {
      // Use default key if parsing fails
      console.log('⚠️ Failed to parse request body, using default key');
    }
  } else if (request.method === 'GET') {
    const url = new URL(request.url);
    key = url.searchParams.get('key') || '/default';
  }
  
  return key;
}

/**
 * Helper function to get GameSync Durable Object instance
 */
function getGameSyncDurableObject(key: string) {
  const durableObjectId = (env.GAME_SYNC_DURABLE_OBJECT as any).idFromName(key);
  return (env.GAME_SYNC_DURABLE_OBJECT as any).get(durableObjectId);
}

/**
 * GameSync API Routes
 * Handles all game synchronization endpoints under /__gamesync
 */
export const gameSyncRoutes = [
  // Join a game room
  route("/join", async ({ request }) => {
    const key = await extractRoomKey(request);
    console.log('🎮 GameSync join - using key:', key);
    
    const durableObject = getGameSyncDurableObject(key);
    return durableObject.fetch(request);
  }),

  // Leave a game room
  route("/leave", async ({ request }) => {
    const key = await extractRoomKey(request);
    console.log('🎮 GameSync leave - using key:', key);
    
    const durableObject = getGameSyncDurableObject(key);
    return durableObject.fetch(request);
  }),

  // Get current game state
  route("/state", async ({ request }) => {
    const key = await extractRoomKey(request);
    console.log('🎮 GameSync state - using key:', key);
    
    const durableObject = getGameSyncDurableObject(key);
    return durableObject.fetch(request);
  }),

  // WebSocket connection endpoint
  route("/ws", async ({ request }) => {
    // Handle WebSocket upgrades for GameSync
    if (request.headers.get("Upgrade") === "websocket") {
      const url = new URL(request.url);
      const key = url.searchParams.get('key') || '/default';
      
      console.log('🎮 GameSync WebSocket connecting with key:', key);
      
      const durableObject = getGameSyncDurableObject(key);
      return durableObject.fetch(request);
    }
    
    return new Response("WebSocket upgrade required", { status: 400 });
  }),

  // Health check endpoint
  route("/health", async ({ request }) => {
    return new Response(JSON.stringify({
      status: 'healthy',
      service: 'GameSync',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }),

  // Game room info endpoint
  route("/rooms", async ({ request }) => {
    // This could be expanded to list active rooms, room stats, etc.
    const url = new URL(request.url);
    const key = url.searchParams.get('key') || '/default';
    
    console.log('🎮 GameSync room info - using key:', key);
    
    const durableObject = getGameSyncDurableObject(key);
    
    // Forward the request to get room state
    const modifiedRequest = new Request(request.url.replace('/rooms', '/state'), {
      method: 'GET',
      headers: request.headers
    });
    
    return durableObject.fetch(modifiedRequest);
  })
];