# Real-time Presence System

A comprehensive real-time presence system built with RedwoodJS's new Cloudflare-based SDK, utilizing the SDK's included Realtime functionality and Cloudflare Durable Objects.

This system provides:
- Live tracking of users currently viewing pages in your application
- Real-time updates with user avatars and connection status
- Graceful handling of user disconnections
- Integration with Cloudflare D1 database

## Quick Start Guide

### 1. Clone and Install

```bash
git clone https://github.com/QuinnsCode/rwsdk-realtime-presence
cd rwsdk-realtime-presence
pnpm install
```

### 2. Environment Setup

Create a `.dev.vars` file in the root directory:

```bash
WEBAUTHN_RP_ID=localhost
AUTH_SECRET_KEY=your-development-secret-key
# Production mode required for Workers and Durable Objects interaction
NODE_ENV="production"
```

### 3. Database Setup

#### Create D1 Database via Cloudflare Dashboard

1. Navigate to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to **Storage** → **D1**
3. Click **Create database**  
4. Give your database a name (e.g., `my-presence-app-db`)
5. Copy the database ID from the created database

#### Configure wrangler.jsonc

Update your `wrangler.jsonc` file with your app details:

```jsonc
{
  "name": "your-app-name", // Change from __change_me__
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "your-database-name", // Name from Cloudflare Dashboard
      "database_id": "your-database-id" // ID from Cloudflare Dashboard
    }
  ]
  // Update any other __change_me__ placeholders with your app name
}
```

#### Run Database Migrations

```bash
# Run Prisma migrations to set up tables
pnpm run migrate:dev or pnpm run migrate:prd
# Generate Prisma client
pnpm generate
```

### 4. Deploy Durable Objects

Deploy the presence system's Durable Objects to Cloudflare:

```bash
pnpm run release
```

> **Important:** Durable Objects must be deployed to Cloudflare Workers before they can be used, even during local development.

### 5. Start Development Server

```bash
pnpm run dev
```

### 6. Test the Presence System

1. Navigate to `http://localhost:5173` in your browser
2. When logged in, you should see **"1 user viewing this order"**
3. Open the same URL in another browser or incognito tab
4. Observe real-time updates as users join and leave the page

## System Features

- **Live User Tracking** - See who's currently viewing each page
- **Real-time Updates** - Instant notifications when users join or leave
- **User Avatars** - Visual representation of active users  
- **Connection Status** - Monitor user connection health
- **Graceful Disconnections** - Proper cleanup when users leave
- **Handling Refresh Abuse** - Proper cleanup as bots or users mass refresh the page

## Technology Stack

- **RedwoodJS SDK** - Cloudflare-based framework
- - **Prisma** - Database ORM
- - - **React** - Front end
- **Cloudflare D1** - Serverless SQL database
- **Durable Objects** - Stateful serverless computing
- **WebSockets** - Real-time bidirectional communication

That's it! Your real-time presence system should now be fully operational with live user tracking across your application.
