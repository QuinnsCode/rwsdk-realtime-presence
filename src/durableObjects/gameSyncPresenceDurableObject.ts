// src/durableObjects/gameSyncPresenceDurableObject.ts
import { RealtimeDurableObject } from "rwsdk/realtime/durableObject";
import { uniqueNamesGenerator, adjectives, animals } from 'unique-names-generator';

// Game sync configuration constants
const GAME_SYNC_CONFIG = {
  // Mouse position update rates
  MOUSE_UPDATE_RATE_MS: 16, // ~60fps for smooth cursor movement
  MOUSE_THROTTLE_DISTANCE: 5, // Minimum pixel distance to trigger update
  
  // Presence settings
  PRESENCE_HEARTBEAT_INTERVAL: 10000, // 10 seconds
  PRESENCE_CLEANUP_INTERVAL: 30000, // 30 seconds
  PRESENCE_STALE_THRESHOLD: 20000, // 20 seconds
  
  // Connection limits
  MAX_CONNECTIONS_PER_ROOM: 50,
  
  // Broadcast throttling
  MIN_BROADCAST_INTERVAL: 8, // 8ms minimum between broadcasts (~120fps max)
  BATCH_UPDATE_DELAY: 4, // 4ms delay to batch multiple updates
  
  // Cursor settings
  CURSOR_TRAIL_LENGTH: 5, // Number of trail points
  CURSOR_SMOOTHING: 0.8, // Interpolation factor for smooth movement
  CURSOR_TIMEOUT: 3000, // Hide cursor after 3s of inactivity
  
  // Username generation
  USERNAME_CONFIG: {
    dictionaries: [adjectives, animals] as string[][],
    separator: '-',
    length: 2,
    style: 'lowerCase' as const
  },
  
  // Data compression
  POSITION_PRECISION: 1, // Decimal places for coordinates
  ENABLE_DELTA_COMPRESSION: true, // Only send position changes
  
  // Room management
  ROOM_IDLE_TIMEOUT: 300000, // 5 minutes of no activity before room cleanup
  MAX_CHAT_HISTORY: 100, // Maximum chat messages to keep
} as const;

interface MousePosition {
  x: number;
  y: number;
  timestamp: number;
}

interface UserGameState {
  userId: string;
  username: string;
  joinedAt: number;
  lastSeen: number;
  isActive: boolean;
  
  // Mouse/cursor data
  mousePosition: MousePosition | null;
  lastMouseUpdate: number;
  cursorColor: string;
  
  // Optional game-specific data
  score?: number;
  level?: number;
  gameData?: Record<string, any>;
  
  // Connection info
  sessionId?: string;
  connectionId: string;
}

interface GameSyncMessage {
  type: 'mouse_move' | 'game_action' | 'heartbeat' | 'request_state';
  userId: string;
  timestamp: number;
  data?: any;
}

interface MouseMoveData {
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
}

export class GameSyncPresenceDurableObject extends RealtimeDurableObject {
  private gameState: Map<string, UserGameState> = new Map();
  private wsToUser: Map<WebSocket, string> = new Map();
  private usernames: Map<string, string> = new Map();
  private cursorColors: string[] = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57',
    '#FF9FF3', '#54A0FF', '#5F27CD', '#00D2D3', '#FF9F43',
    '#FF3838', '#3742FA', '#2F3542', '#FF6348', '#1DD1A1'
  ];
  private colorIndex = 0;
  
  // Throttling and batching
  private lastBroadcast: number = 0;
  private pendingUpdates: Set<string> = new Set();
  private batchTimeout: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(state: DurableObjectState, env: any) {
    super(state, env);
    
    console.log('🎮 GameSyncPresenceDurableObject initialized with config:', {
      mouseUpdateRate: GAME_SYNC_CONFIG.MOUSE_UPDATE_RATE_MS,
      maxConnections: GAME_SYNC_CONFIG.MAX_CONNECTIONS_PER_ROOM,
      minBroadcastInterval: GAME_SYNC_CONFIG.MIN_BROADCAST_INTERVAL
    });
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveUsers();
    }, GAME_SYNC_CONFIG.PRESENCE_CLEANUP_INTERVAL);
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
    
    // Handle game sync API calls
    if (url.pathname === '/__gamesync/join') {
      return this.handleJoinGame(request);
    }
    
    if (url.pathname === '/__gamesync/leave') {
      return this.handleLeaveGame(request);
    }
    
    if (url.pathname === '/__gamesync/state') {
      return this.handleGetState(request);
    }
    
    // Handle WebSocket upgrades
    if (request.headers.get("Upgrade") === "websocket") {
      if (this.wsToUser.size >= GAME_SYNC_CONFIG.MAX_CONNECTIONS_PER_ROOM) {
        console.log(`⚠️ GameSync room at capacity (${GAME_SYNC_CONFIG.MAX_CONNECTIONS_PER_ROOM})`);
        return new Response('Room at capacity', { status: 503 });
      }

      const response = await super.fetch(request);
      
      if (response.webSocket) {
        this.setupWebSocketHandlers(response.webSocket);
      }
      
      return response;
    }
    
    return super.fetch(request);
  }

  private setupWebSocketHandlers(ws: WebSocket) {
    ws.addEventListener('open', () => {
      console.log('🎮 GameSync WebSocket opened');
      this.sendCurrentStateToConnection(ws);
    });

    ws.addEventListener('close', () => {
      const userId = this.wsToUser.get(ws);
      if (userId) {
        console.log(`🎮 GameSync WebSocket closed for user: ${userId}`);
        this.handleUserDisconnect(userId);
        this.wsToUser.delete(ws);
      }
    });

    ws.addEventListener('error', () => {
      const userId = this.wsToUser.get(ws);
      if (userId) {
        console.log(`❌ GameSync WebSocket error for user: ${userId}`);
        this.handleUserDisconnect(userId);
        this.wsToUser.delete(ws);
      }
    });
  }

  private async handleJoinGame(request: Request): Promise<Response> {
    try {
      const data = await request.json() as {
        userId?: string;
        username?: string;
        roomKey: string;
      };
      
      const userId = data.userId || this.generateAnonymousUserId();
      const username = data.username || this.getOrGenerateUsername(userId);
      const connectionId = this.generateConnectionId();
      
      const userState: UserGameState = {
        userId,
        username,
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        isActive: true,
        mousePosition: null,
        lastMouseUpdate: 0,
        cursorColor: this.getNextCursorColor(),
        connectionId,
        sessionId: this.extractSessionId(userId)
      };
      
      this.gameState.set(userId, userState);
      
      console.log(`🎮 User ${username} joined game room (${userId})`);
      this.broadcastGameState();
      
      return new Response(JSON.stringify({
        success: true,
        userId,
        username,
        cursorColor: userState.cursorColor,
        config: {
          mouseUpdateRate: GAME_SYNC_CONFIG.MOUSE_UPDATE_RATE_MS,
          throttleDistance: GAME_SYNC_CONFIG.MOUSE_THROTTLE_DISTANCE
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error('❌ GameSync join error:', error);
      return new Response('Invalid request', { status: 400 });
    }
  }

  private async handleLeaveGame(request: Request): Promise<Response> {
    try {
      const data = await request.json() as { userId: string };
      
      if (data.userId) {
        this.handleUserDisconnect(data.userId);
      }
      
      return new Response(JSON.stringify({ success: true }));
    } catch (error) {
      return new Response('Invalid request', { status: 400 });
    }
  }

  private async handleGetState(request: Request): Promise<Response> {
    const activeUsers = Array.from(this.gameState.values())
      .filter(user => user.isActive)
      .map(user => ({
        userId: user.userId,
        username: user.username,
        mousePosition: user.mousePosition,
        cursorColor: user.cursorColor,
        joinedAt: user.joinedAt,
        score: user.score,
        level: user.level
      }));
    
    return new Response(JSON.stringify({
      users: activeUsers,
      totalUsers: activeUsers.length,
      roomConfig: {
        maxUsers: GAME_SYNC_CONFIG.MAX_CONNECTIONS_PER_ROOM,
        mouseUpdateRate: GAME_SYNC_CONFIG.MOUSE_UPDATE_RATE_MS
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
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
      const data = JSON.parse(messageString) as GameSyncMessage;
      
      switch (data.type) {
        case 'mouse_move':
          await this.handleMouseMove(ws, data);
          break;
          
        case 'heartbeat':
          await this.handleHeartbeat(ws, data);
          break;
          
        case 'game_action':
          await this.handleGameAction(ws, data);
          break;
          
        case 'request_state':
          this.sendCurrentStateToConnection(ws);
          break;
          
        default:
          console.log('🎮 Unknown message type:', data.type);
      }
      
    } catch (e) {
      // Not a game sync message, pass to parent
      return await super.webSocketMessage(ws, message as ArrayBuffer);
    }
  }

  private async handleMouseMove(ws: WebSocket, data: GameSyncMessage) {
    const mouseData = data.data as MouseMoveData;
    const userId = data.userId;
    const user = this.gameState.get(userId);
    
    if (!user) return;
    
    // Throttle updates by distance if enabled
    if (GAME_SYNC_CONFIG.ENABLE_DELTA_COMPRESSION && user.mousePosition) {
      const distance = Math.sqrt(
        Math.pow(mouseData.x - user.mousePosition.x, 2) +
        Math.pow(mouseData.y - user.mousePosition.y, 2)
      );
      
      if (distance < GAME_SYNC_CONFIG.MOUSE_THROTTLE_DISTANCE) {
        return; // Skip this update
      }
    }
    
    // Update user's mouse position
    user.mousePosition = {
      x: Math.round(mouseData.x * Math.pow(10, GAME_SYNC_CONFIG.POSITION_PRECISION)) / Math.pow(10, GAME_SYNC_CONFIG.POSITION_PRECISION),
      y: Math.round(mouseData.y * Math.pow(10, GAME_SYNC_CONFIG.POSITION_PRECISION)) / Math.pow(10, GAME_SYNC_CONFIG.POSITION_PRECISION),
      timestamp: data.timestamp
    };
    user.lastMouseUpdate = Date.now();
    user.lastSeen = Date.now();
    
    // Associate WebSocket with user
    this.wsToUser.set(ws, userId);
    
    // Add to pending updates for batching
    this.pendingUpdates.add(userId);
    this.scheduleBatchBroadcast();
  }

  private async handleHeartbeat(ws: WebSocket, data: GameSyncMessage) {
    const user = this.gameState.get(data.userId);
    if (user) {
      user.lastSeen = Date.now();
      user.isActive = true;
      this.wsToUser.set(ws, data.userId);
    }
  }

  private async handleGameAction(ws: WebSocket, data: GameSyncMessage) {
    const user = this.gameState.get(data.userId);
    if (!user) return;
    
    // Handle game-specific actions (score updates, level changes, etc.)
    if (data.data) {
      if (data.data.score !== undefined) {
        user.score = data.data.score;
      }
      if (data.data.level !== undefined) {
        user.level = data.data.level;
      }
      if (data.data.gameData) {
        user.gameData = { ...user.gameData, ...data.data.gameData };
      }
    }
    
    user.lastSeen = Date.now();
    this.pendingUpdates.add(data.userId);
    this.scheduleBatchBroadcast();
  }

  private scheduleBatchBroadcast() {
    if (this.batchTimeout) return;
    
    this.batchTimeout = setTimeout(() => {
      this.broadcastGameState();
      this.pendingUpdates.clear();
      this.batchTimeout = null;
    }, GAME_SYNC_CONFIG.BATCH_UPDATE_DELAY);
  }

  private broadcastGameState() {
    const now = Date.now();
    
    // Throttle broadcasts
    if (now - this.lastBroadcast < GAME_SYNC_CONFIG.MIN_BROADCAST_INTERVAL) {
      return;
    }
    this.lastBroadcast = now;

    // Prepare state data (only active users with recent mouse activity)
    const activeUsers = Array.from(this.gameState.values())
      .filter(user => {
        if (!user.isActive) return false;
        
        // Hide cursor if inactive for too long
        if (user.mousePosition && 
            now - user.lastMouseUpdate > GAME_SYNC_CONFIG.CURSOR_TIMEOUT) {
          user.mousePosition = null;
        }
        
        return true;
      })
      .map(user => ({
        userId: user.userId,
        username: user.username,
        mousePosition: user.mousePosition,
        cursorColor: user.cursorColor,
        score: user.score,
        level: user.level,
        gameData: user.gameData
      }));

    const stateUpdate = {
      type: 'game_state_update',
      timestamp: now,
      users: activeUsers,
      totalUsers: activeUsers.length
    };
    
    // Broadcast to all connected WebSockets
    for (const [ws, userId] of this.wsToUser.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify(stateUpdate));
        } catch (error) {
          console.error('Failed to send game state:', error);
          this.wsToUser.delete(ws);
        }
      } else {
        this.wsToUser.delete(ws);
      }
    }
  }

  private sendCurrentStateToConnection(ws: WebSocket) {
    if (ws.readyState === WebSocket.OPEN) {
      const activeUsers = Array.from(this.gameState.values())
        .filter(user => user.isActive)
        .map(user => ({
          userId: user.userId,
          username: user.username,
          mousePosition: user.mousePosition,
          cursorColor: user.cursorColor,
          score: user.score,
          level: user.level
        }));
      
      try {
        ws.send(JSON.stringify({
          type: 'initial_state',
          users: activeUsers,
          totalUsers: activeUsers.length
        }));
      } catch (error) {
        console.error('Failed to send initial state:', error);
      }
    }
  }

  private handleUserDisconnect(userId: string) {
    const user = this.gameState.get(userId);
    if (user) {
      console.log(`🎮 User ${user.username} disconnected from game`);
      this.gameState.delete(userId);
      this.broadcastGameState();
    }
  }

  private cleanupInactiveUsers() {
    const now = Date.now();
    let cleanedUp = 0;
    
    for (const [userId, user] of this.gameState.entries()) {
      if (now - user.lastSeen > GAME_SYNC_CONFIG.PRESENCE_STALE_THRESHOLD) {
        this.gameState.delete(userId);
        cleanedUp++;
      }
    }
    
    if (cleanedUp > 0) {
      console.log(`🧹 Cleaned up ${cleanedUp} inactive users`);
      this.broadcastGameState();
    }
  }

  private generateAnonymousUserId(): string {
    return `anon_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private extractSessionId(userId: string): string | undefined {
    const match = userId.match(/session_(\d+_[a-z0-9]+)/);
    return match ? match[1] : undefined;
  }

  private getOrGenerateUsername(userId: string): string {
    const sessionId = this.extractSessionId(userId);
    const cacheKey = sessionId ? `session_${sessionId}` : userId;
    
    if (!this.usernames.has(cacheKey)) {
      const name = uniqueNamesGenerator(GAME_SYNC_CONFIG.USERNAME_CONFIG);
      this.usernames.set(cacheKey, name);
    }
    return this.usernames.get(cacheKey)!;
  }

  private getNextCursorColor(): string {
    const color = this.cursorColors[this.colorIndex % this.cursorColors.length];
    this.colorIndex++;
    return color;
  }
}