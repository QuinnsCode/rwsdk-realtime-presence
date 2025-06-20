import { defineApp, ErrorResponse } from "rwsdk/worker";
import { realtimeRoute, renderRealtimeClients } from "rwsdk/realtime/worker";
import { route, render, prefix } from "rwsdk/router";
import { Document } from "@/app/Document";
import { Home } from "@/app/pages/Home";
import { setCommonHeaders } from "@/app/headers";
import { userRoutes } from "@/app/pages/user/routes";
import { gameSyncRoutes } from "@/app/gamesync/routes";
import { sessions, setupSessionStore } from "./session/store";
import { Session } from "./session/durableObject";
import { type User, db, setupDb } from "@/db";
import { env } from "cloudflare:workers";
import Room from "@/app/pages/Room";

// Export Durable Objects
export { SessionDurableObject } from "./session/durableObject";
export { PresenceDurableObject as RealtimeDurableObject } from "./durableObjects/presenceDurableObject";
export { GameSyncPresenceDurableObject } from "./durableObjects/gameSyncPresenceDurableObject";

export type AppContext = {
  session: Session | null;
  user: User | null;
};

export default defineApp([
  setCommonHeaders(),
  
  // 🔧 SHARED MIDDLEWARE - runs for all routes
  async ({ ctx, request, headers }) => {
    await setupDb(env);
    setupSessionStore(env);

    console.log('🔍 Session middleware - URL:', request.url);
    
    try {
      ctx.session = await sessions.load(request);
      console.log('✅ Session loaded:', ctx.session?.userId ? 'User logged in' : 'No session');
    } catch (error) {
      console.log('❌ Session error:', error);
      
      if (error instanceof ErrorResponse && error.code === 401) {
        // Don't redirect during realtime or gamesync requests
        if (request.url.includes('__realtime') || request.url.includes('__gamesync')) {
          console.log('⏭️ Skipping redirect for realtime/gamesync request');
          ctx.session = null;
          return; // Continue without session
        }
        
        await sessions.remove(request, headers);
        headers.set("Location", "/user/login");
        return new Response(null, { status: 302, headers });
      }
      throw error;
    }

    if (ctx.session?.userId) {
      ctx.user = await db.user.findUnique({
        where: { id: ctx.session.userId },
      });
      console.log('👤 User found:', ctx.user?.username || 'Not found');
    }
  },

  // 🎮 GAMESYNC API ROUTES - Clean prefix for all game sync functionality
  prefix("/__gamesync", gameSyncRoutes),

  // Handle legacy GameSync WebSocket endpoint (redirect to new endpoint)
  route("/__gamesync", async ({ request }) => {
    if (request.headers.get("Upgrade") === "websocket") {
      // Redirect WebSocket connections to the new /ws endpoint
      const url = new URL(request.url);
      const key = url.searchParams.get('key') || '/default';
      
      console.log('🔄 Redirecting legacy GameSync WebSocket to /ws endpoint');
      
      // Create new request with /ws path
      const newUrl = new URL(request.url);
      newUrl.pathname = '/__gamesync/ws';
      
      const newRequest = new Request(newUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body
      });
      
      return fetch(newRequest);
    }
    
    return new Response("WebSocket upgrade required. Use /__gamesync/ws", { status: 400 });
  }),

  // 📡 PRESENCE API ROUTES - Original presence system
  route("/__realtime/presence", async ({ request }) => {
    let key = '/default';
    
    if (request.method === 'POST') {
      try {
        const clonedRequest = request.clone();
        const body = await clonedRequest.json() as { 
          pathname?: string; 
          userId?: string; 
          username?: string; 
          action?: string;
        };
        key = body?.pathname || '/default';
      } catch (e) {
        // If JSON parsing fails, use default key
      }
    } else if (request.method === 'GET') {
      const url = new URL(request.url);
      key = url.searchParams.get('key') || '/default';
    }
    
    console.log('🔑 Using presence key:', key);
    
    const durableObjectId = (env.REALTIME_DURABLE_OBJECT as any).idFromName(key);
    const durableObject = (env.REALTIME_DURABLE_OBJECT as any).get(durableObjectId);
    
    return durableObject.fetch(request);
  }),

  // 📡 PRESENCE WEBSOCKET ROUTES
  route("/__realtime", async ({ request }) => {
    if (request.headers.get("Upgrade") === "websocket") {
      const url = new URL(request.url);
      const key = url.searchParams.get('key') || '/default';
      
      console.log('🔌 Presence WebSocket connecting with key:', key);
      
      const durableObjectId = (env.REALTIME_DURABLE_OBJECT as any).idFromName(key);
      const durableObject = (env.REALTIME_DURABLE_OBJECT as any).get(durableObjectId);
      
      return durableObject.fetch(request);
    }
    
    return new Response("WebSocket upgrade required", { status: 400 });
  }),
  
  // 📡 REALTIME ROUTE (for framework integration)
  realtimeRoute(() => env.REALTIME_DURABLE_OBJECT as any),
  
  // 🎨 APPLICATION ROUTES
  render(Document, [
    // 🏠 HOME & ROOM ROUTES
    route("/", ({ ctx }) => {
      return <Room currentUser={ctx.user} />;
    }),
    route("/room", ({ ctx }) => {
      return <Room currentUser={ctx.user} />;
    }),

    // 🔑 USER AUTHENTICATION ROUTES
    prefix("/user", userRoutes),

    // 🔒 PROTECTED ROUTES
    route("/protected", [
      ({ ctx }) => {
        if (!ctx.user) {
          return new Response(null, {
            status: 302,
            headers: { Location: "/user/login" },
          });
        }
      },
      Home,
    ]),

    // 📊 ADMIN/DEBUG ROUTES (optional)
    route("/admin/gamesync", [
      ({ ctx }) => {
        // Optional: Add admin check here
        if (!ctx.user) {
          return new Response(null, {
            status: 302,
            headers: { Location: "/user/login" },
          });
        }
      },
      async ({ ctx }) => {
        // Simple admin page showing GameSync status
        return new Response(`
          <html>
            <head><title>GameSync Admin</title></head>
            <body>
              <h1>GameSync Administration</h1>
              <p>User: ${ctx.user?.username}</p>
              <ul>
                <li><a href="/__gamesync/health">Health Check</a></li>
                <li><a href="/__gamesync/state">Current State</a></li>
                <li><a href="/__gamesync/rooms">Room Info</a></li>
              </ul>
              <p><a href="/">← Back to Room</a></p>
            </body>
          </html>
        `, {
          headers: { 'Content-Type': 'text/html' }
        });
      }
    ])
  ]),
]);