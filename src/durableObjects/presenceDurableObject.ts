// src/durableObjects/presenceDurableObject.ts
import { RealtimeDurableObject } from "rwsdk/realtime/durableObject";
import { uniqueNamesGenerator, adjectives, animals } from 'unique-names-generator';

// Server-side presence configuration
const PRESENCE_SERVER_SETTINGS = {
  // How often to cleanup stale connections (in milliseconds)
  CLEANUP_INTERVAL: 30000, // 30 seconds
  
  // How long before a user is considered stale/inactive (in milliseconds)
  STALE_THRESHOLD: 45000, // 45 seconds (increased to be more forgiving)
  
  // Username generation settings
  USERNAME_CONFIG: {
    dictionaries: [adjectives, animals] as string[][],
    separator: '-',
    length: 2,
    style: 'lowerCase' as const
  },
  
  // Connection limits
  MAX_CONNECTIONS_PER_ROOM: 100,
  
  // Heartbeat tolerance - how long to wait for heartbeats before cleanup
  HEARTBEAT_TIMEOUT: 60000, // 60 seconds (more forgiving)
  
  // Broadcast throttling - minimum time between broadcasts
  MIN_BROADCAST_INTERVAL: 100, // 100ms to prevent spam
  
  // Grace period for reconnections (to handle quick refreshes)
  RECONNECT_GRACE_PERIOD: 10000, // 10 seconds
} as const;

interface UserPresence {
  userId: string;
  username: string;
  joinedAt: number;
  lastSeen: number;
  sessionId?: string; // Track session for better duplicate handling
  isReconnecting?: boolean; // Flag for users in grace period
}

interface PendingReconnect {
  userId: string;
  username: string;
  expiresAt: number;
}

export class PresenceDurableObject extends RealtimeDurableObject {
  private presence: Map<string, UserPresence> = new Map();
  private wsToUser: Map<WebSocket, string> = new Map();
  private usernames: Map<string, string> = new Map();
  private pendingReconnects: Map<string, PendingReconnect> = new Map(); // Handle reconnections gracefully
  private lastBroadcast: number = 0;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(state: DurableObjectState, env: any) {
    super(state, env);
    
    console.log('⚙️ Enhanced Presence Durable Object initialized');
    
    // Clean up stale connections at configured interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleConnections();
      this.cleanupPendingReconnects();
    }, PRESENCE_SERVER_SETTINGS.CLEANUP_INTERVAL);
  }

  async alarm(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (super.alarm) {
      await super.alarm();
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle presence API calls
    if (url.pathname === '/__realtime/presence') {
      return this.handlePresenceAPI(request);
    }
    
    // Handle WebSocket upgrades
    if (request.headers.get("Upgrade") === "websocket") {
      const response = await super.fetch(request);
      
      if (response.webSocket) {
        // Check connection limits
        if (this.wsToUser.size >= PRESENCE_SERVER_SETTINGS.MAX_CONNECTIONS_PER_ROOM) {
          console.log(`⚠️ Maximum connections reached (${PRESENCE_SERVER_SETTINGS.MAX_CONNECTIONS_PER_ROOM})`);
          response.webSocket.close(1008, 'Room at capacity');
          return response;
        }

        response.webSocket.addEventListener('close', () => {
          const userId = this.wsToUser.get(response.webSocket!);
          if (userId) {
            console.log(`🔌 WebSocket closed for user: ${userId}`);
            this.handleUserDisconnect(userId);
            this.wsToUser.delete(response.webSocket!);
          }
        });

        response.webSocket.addEventListener('error', () => {
          const userId = this.wsToUser.get(response.webSocket!);
          if (userId) {
            console.log(`❌ WebSocket error for user: ${userId}`);
            this.handleUserDisconnect(userId);
            this.wsToUser.delete(response.webSocket!);
          }
        });
      }
      
      return response;
    }
    
    return super.fetch(request);
  }

  private async handlePresenceAPI(request: Request): Promise<Response> {
    if (request.method === 'POST') {
      try {
        const data = await request.json() as {
          userId?: string;
          username?: string;
          action: 'join' | 'leave';
          pathname: string;
        };
        
        if (data.action === 'join') {
          const effectiveUserId = data.userId || `anon_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
          const result = this.addUserPresence(effectiveUserId, data.username);
          
          return new Response(JSON.stringify({
            success: true,
            userId: effectiveUserId,
            username: result.username
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } else if (data.action === 'leave') {
          if (data.userId) {
            this.handleUserDisconnect(data.userId);
          }
          return new Response(JSON.stringify({ success: true }));
        }
        
        return new Response('Invalid action', { status: 400 });
      } catch (error) {
        console.error('❌ Presence API error:', error);
        return new Response('Invalid JSON', { status: 400 });
      }
    }
    
    if (request.method === 'GET') {
      const presenceList = Array.from(this.presence.values())
        .filter(p => !p.isReconnecting); // Don't include users in reconnection state
      return new Response(JSON.stringify(presenceList), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response('Method not allowed', { status: 405 });
  }

  private extractSessionInfo(userId: string): { sessionId: string; tabId: string } | null {
    // Extract session info from userId if it follows our pattern
    const match = userId.match(/^anon_session_(\d+_[a-z0-9]+)_tab_(\d+_[a-z0-9]+)$/);
    if (match) {
      return { sessionId: match[1], tabId: match[2] };
    }
    return null;
  }

  private getOrGenerateUsername(userId: string): string {
    const sessionInfo = this.extractSessionInfo(userId);
    const cacheKey = sessionInfo ? `session_${sessionInfo.sessionId}` : userId;
    
    if (!this.usernames.has(cacheKey)) {
      const name = uniqueNamesGenerator(PRESENCE_SERVER_SETTINGS.USERNAME_CONFIG);
      this.usernames.set(cacheKey, name);
      console.log(`🎭 Generated username "${name}" for ${cacheKey}`);
    }
    return this.usernames.get(cacheKey)!;
  }

  private addUserPresence(userId: string, username?: string): UserPresence {
    const now = Date.now();
    
    // Check if this user is in pending reconnect state
    const pending = this.pendingReconnects.get(userId);
    if (pending) {
      console.log(`🔄 User ${pending.username} reconnected within grace period`);
      this.pendingReconnects.delete(userId);
      
      // Restore their presence with original join time
      const existingPresence = this.presence.get(userId);
      const userPresence: UserPresence = {
        userId,
        username: pending.username, // Use original username
        joinedAt: existingPresence?.joinedAt || now,
        lastSeen: now,
        isReconnecting: false
      };
      
      this.presence.set(userId, userPresence);
      this.broadcastPresenceUpdate();
      return userPresence;
    }

    // Check for existing presence (handles same session, different tab scenarios)
    const existing = this.presence.get(userId);
    const sessionInfo = this.extractSessionInfo(userId);
    
    // If we have session info, check for duplicate sessions
    if (sessionInfo) {
      // Look for other users with same session but different tab
      for (const [existingUserId, existingPresence] of this.presence.entries()) {
        if (existingUserId !== userId) {
          const existingSessionInfo = this.extractSessionInfo(existingUserId);
          if (existingSessionInfo && existingSessionInfo.sessionId === sessionInfo.sessionId) {
            // Same session, likely a refresh - remove the old one
            console.log(`🔄 Detected refresh: removing old presence ${existingUserId}, adding new ${userId}`);
            this.presence.delete(existingUserId);
            // Don't broadcast yet, we'll do it after adding the new one
          }
        }
      }
    }
    
    // Use provided username OR generate/reuse username based on session
    const displayName = username || this.getOrGenerateUsername(userId);
    
    const userPresence: UserPresence = {
      userId,
      username: displayName,
      joinedAt: existing?.joinedAt || now,
      lastSeen: now,
      sessionId: sessionInfo?.sessionId,
      isReconnecting: false
    };
    
    this.presence.set(userId, userPresence);
    
    console.log(`👋 User ${displayName} joined presence (${userId})`);
    this.broadcastPresenceUpdate();
    
    return userPresence;
  }

  private handleUserDisconnect(userId: string) {
    const user = this.presence.get(userId);
    if (!user) return;

    // Instead of immediately removing, add to pending reconnects for grace period
    const reconnectEntry: PendingReconnect = {
      userId,
      username: user.username,
      expiresAt: Date.now() + PRESENCE_SERVER_SETTINGS.RECONNECT_GRACE_PERIOD
    };
    
    this.pendingReconnects.set(userId, reconnectEntry);
    
    // Mark user as reconnecting in presence
    user.isReconnecting = true;
    this.presence.set(userId, user);
    
    console.log(`⏳ User ${user.username} disconnected, grace period active`);
    
    // Don't broadcast immediately - give them a chance to reconnect
    setTimeout(() => {
      // If they haven't reconnected, remove them
      if (this.pendingReconnects.has(userId)) {
        this.pendingReconnects.delete(userId);
        this.presence.delete(userId);
        console.log(`👋 User ${user.username} left presence (grace period expired)`);
        this.broadcastPresenceUpdate();
      }
    }, PRESENCE_SERVER_SETTINGS.RECONNECT_GRACE_PERIOD);
  }

  private cleanupPendingReconnects() {
    const now = Date.now();
    for (const [userId, pending] of this.pendingReconnects.entries()) {
      if (now > pending.expiresAt) {
        console.log(`🧹 Cleaning up expired reconnect for ${pending.username}`);
        this.pendingReconnects.delete(userId);
        this.presence.delete(userId);
      }
    }
  }

  private broadcastPresenceUpdate() {
    const now = Date.now();
    
    // Throttle broadcasts to prevent spam
    if (now - this.lastBroadcast < PRESENCE_SERVER_SETTINGS.MIN_BROADCAST_INTERVAL) {
      return;
    }
    this.lastBroadcast = now;

    // Only include active users (not reconnecting)
    const presenceList = Array.from(this.presence.values())
      .filter(p => !p.isReconnecting);
    
    console.log(`📡 Broadcasting presence update to ${this.wsToUser.size} connections:`, 
                presenceList.map(p => p.username));
    
    // Broadcast to all connected WebSockets
    for (const [ws, userId] of this.wsToUser.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({
            type: 'presence_update',
            data: presenceList
          }));
        } catch (error) {
          console.error('Failed to send presence update:', error);
          this.wsToUser.delete(ws);
        }
      } else {
        this.wsToUser.delete(ws);
      }
    }
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    let messageString: string;
    
    if (typeof message === 'string') {
      messageString = message;
    } else if (message instanceof ArrayBuffer) {
      messageString = new TextDecoder().decode(message);
    } else {
      return await super.webSocketMessage(ws, message as ArrayBuffer);
    }
    
    try {
      const data = JSON.parse(messageString);
      
      if (data.type === 'presence_heartbeat' && data.userId) {
        console.log('💓 Received heartbeat from user:', data.userId);
        
        // Update last seen time and ensure they're not in reconnecting state
        const user = this.presence.get(data.userId);
        if (user) {
          user.lastSeen = Date.now();
          user.isReconnecting = false; // Clear reconnecting flag
          
          // Associate this WebSocket with the user
          this.wsToUser.set(ws, data.userId);
          
          // Remove from pending reconnects if present
          if (this.pendingReconnects.has(data.userId)) {
            this.pendingReconnects.delete(data.userId);
            console.log(`✅ User ${user.username} fully reconnected via heartbeat`);
            this.broadcastPresenceUpdate(); // Broadcast since they're back
          }
          
          // Send current presence to this connection
          this.sendPresenceToConnection(ws);
        }
        return;
      }
    } catch (e) {
      // Not a JSON message, pass to parent
    }
    
    return await super.webSocketMessage(ws, message as ArrayBuffer);
  }

  private sendPresenceToConnection(ws: WebSocket) {
    if (ws.readyState === WebSocket.OPEN) {
      const presenceList = Array.from(this.presence.values())
        .filter(p => !p.isReconnecting);
      try {
        ws.send(JSON.stringify({
          type: 'presence_update',
          data: presenceList
        }));
      } catch (error) {
        console.error('Failed to send presence to connection:', error);
      }
    }
  }

  private cleanupStaleConnections() {
    const now = Date.now();
    
    // Clean up truly stale connections (those that haven't sent heartbeats)
    for (const [userId, presence] of this.presence.entries()) {
      // Skip users in reconnecting state (they have their own timeout)
      if (presence.isReconnecting) continue;
      
      if (now - presence.lastSeen > PRESENCE_SERVER_SETTINGS.HEARTBEAT_TIMEOUT) {
        console.log(`💔 User ${presence.username} missed heartbeat timeout, starting grace period`);
        this.handleUserDisconnect(userId);
      }
    }
  }
}