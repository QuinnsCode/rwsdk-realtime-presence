import { defineApp, ErrorResponse } from "rwsdk/worker";
import { realtimeRoute, renderRealtimeClients } from "rwsdk/realtime/worker";
import { route, render, prefix } from "rwsdk/router";
import { Document } from "@/app/Document";
import { Home } from "@/app/pages/Home";
import { setCommonHeaders } from "@/app/headers";
import { userRoutes } from "@/app/pages/user/routes";
import { sessions, setupSessionStore } from "./session/store";
import { Session } from "./session/durableObject";
import { type User, db, setupDb } from "@/db";
import { env } from "cloudflare:workers";

export { SessionDurableObject } from "./session/durableObject";
// Export your custom presence-enabled Durable Object
export { PresenceDurableObject as RealtimeDurableObject } from "./durableObjects/presenceDurableObject";

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
        // Don't redirect during realtime updates
        if (request.url.includes('__realtime')) {
          console.log('⏭️ Skipping redirect for realtime request');
          ctx.session = null;
          return; // Continue without session for realtime
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

  // Handle presence API calls
  route("/__realtime/presence", async ({ request }) => {
    // Forward presence requests to the Durable Object
    // Use the same key as the realtime connection
    let key = '/default';
    
    if (request.method === 'POST') {
      try {
        // Clone the request so we can read the body without consuming it
        const clonedRequest = request.clone();
        const body = await clonedRequest.json() as { pathname?: string; userId?: string; username?: string; action?: string };
        key = body?.pathname || '/default';
      } catch (e) {
        // If JSON parsing fails, use default key
      }
    } else if (request.method === 'GET') {
      // For GET requests, get the key from query params
      const url = new URL(request.url);
      key = url.searchParams.get('key') || '/default';
    }
    
    console.log('🔑 Using presence key:', key);
    
    const durableObjectId = (env.REALTIME_DURABLE_OBJECT as any).idFromName(key);
    const durableObject = (env.REALTIME_DURABLE_OBJECT as any).get(durableObjectId);
    
    return durableObject.fetch(request);
  }),
  route("/__realtime", async ({ request }) => {
    // Handle WebSocket upgrades with key-based routing
    if (request.headers.get("Upgrade") === "websocket") {
      // Get the key from query parameters
      const url = new URL(request.url);
      const key = url.searchParams.get('key') || '/default';
      
      console.log('🔌 WebSocket connecting with key:', key);
      
      const durableObjectId = (env.REALTIME_DURABLE_OBJECT as any).idFromName(key);
      const durableObject = (env.REALTIME_DURABLE_OBJECT as any).get(durableObjectId);
      
      return durableObject.fetch(request);
    }
    
    // For non-WebSocket requests, return a 400 error or handle appropriately
    return new Response("WebSocket upgrade required", { status: 400 });
  }),
  
  realtimeRoute(() => env.REALTIME_DURABLE_OBJECT as any),
  
  render(Document, [
    // 🚫 NON-REALTIME ROUTES (auth, simple pages)
    route("/", () => new Response("Hello, World!")),
    prefix("/user", userRoutes), // 🔑 AUTH ROUTES - NO REALTIME
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
    ])
  ]),
]);