# 🎰 WildCard Bingo

Real-time multiplayer bingo game built with Next.js, Socket.IO, and Prisma.

## 🚀 Live Demo

**Production URL:** https://agentic-dc867fae.vercel.app

## 🎮 Features

- **Real-time Multiplayer:** Live game updates via Socket.IO
- **Lobby System:** Multiple lobbies with different entry fees ($5, $10, $25)
- **4 Sequential Games:** Each lobby contains 4 games
- **15 Seats per Game:** Players can claim up to 2 seats per game
- **Auto-Start:** Game starts automatically when all 15 seats are filled (60s countdown)
- **Deterministic Cards:** Master card (15x5 grid) generated with seeded LCG
- **Prize Pool:** Entry fee × participants
- **Auto Number Calling:** Numbers called every 5 seconds (adjustable 1-5s)
- **Winner Detection:** First player to complete their row wins
- **Auto-Reset:** Game resets 10 seconds after completion

## 🏗️ Architecture

### Game Engine (`server/gameEngine.ts`)
- State management for all active games
- Master card generation using Linear Congruential Generator
- Number calling system with configurable intervals
- Winner detection and prize distribution
- Automatic game lifecycle (countdown → active → finished → reset)

### Socket.IO Events
- `join-lobby`: Join a lobby and receive state updates
- `join-game`: Select a seat in a game
- `mark-cell`: Mark numbers on bingo card
- `number-called`: Broadcast called numbers to all players
- `game-started`: Notify when game begins
- `game-ended`: Announce winner and prizes
- `game-reset`: Reset game for next round

### Database (SQLite + Prisma)
- **User:** username, balance
- **Lobby:** entry fee, games collection
- **Game:** status, master card, called numbers, prize pool
- **Seat:** player assignments to game seats

## 🛠️ Tech Stack

- **Framework:** Next.js 14
- **Real-time:** Socket.IO
- **Database:** SQLite + Prisma ORM
- **State:** Zustand
- **Styling:** CSS Modules
- **Deployment:** Vercel

## 📦 Installation

```bash
npm install
npx prisma migrate dev
npm run dev
```

## 🎯 Game Flow

1. **Login:** Enter username (starts with $100 balance)
2. **Select Lobby:** Choose entry fee tier
3. **Join Game:** Select seat(s) - max 2 per player
4. **Countdown:** 60 second countdown when 15/15 seats filled
5. **Play:** Mark numbers as they're called
6. **Win:** First to complete row wins prize pool
7. **Reset:** Game resets after 10 seconds

## 🎲 Card Generation

Master card uses Linear Congruential Generator (LCG) with seed for deterministic generation:
- 15 rows × 5 columns
- Column 1 (B): 1-15
- Column 2 (I): 16-30
- Column 3 (N): 31-45
- Column 4 (G): 46-60
- Column 5 (O): 61-75

Each player gets one row based on their seat number.

## 🔧 Admin Controls

- Manual game start
- Adjust calling interval (1-5 seconds)
- View real-time game state

## 📝 API Routes

- `POST /api/users` - Create/login user
- `GET /api/users?id={id}` - Get user data
- `GET /api/lobbies` - List all lobbies
- `POST /api/lobbies` - Create new lobby
- `/api/socket` - Socket.IO connection

## 🌐 Deployment

Deployed on Vercel with automatic builds from main branch.

```bash
vercel deploy --prod
```

## 📄 License

MIT
