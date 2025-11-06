import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface BingoCard {
  rows: number[][];
}

export interface GameState {
  id: string;
  status: 'waiting' | 'countdown' | 'active' | 'finished';
  masterCard: BingoCard | null;
  calledNumbers: number[];
  participants: number;
  prizePool: number;
  winnerId: string | null;
  countdownStart: number | null;
  interval: number;
}

class GameEngine {
  private games: Map<string, GameState> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  // Linear Congruential Generator for deterministic card generation
  private lcg(seed: number): () => number {
    let state = seed;
    return () => {
      state = (1103515245 * state + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  // Generate master card with seeded LCG
  generateMasterCard(seed: number): BingoCard {
    const rng = this.lcg(seed);
    const rows: number[][] = [];

    // Generate 15 rows × 5 columns
    for (let row = 0; row < 15; row++) {
      const rowNumbers: number[] = [];
      const usedInRow = new Set<number>();

      for (let col = 0; col < 5; col++) {
        const min = col * 15 + 1;
        const max = col * 15 + 15;

        let num: number;
        do {
          num = Math.floor(rng() * (max - min + 1)) + min;
        } while (usedInRow.has(num));

        usedInRow.add(num);
        rowNumbers.push(num);
      }

      rows.push(rowNumbers);
    }

    return { rows };
  }

  // Get player's row from master card
  getPlayerRow(masterCard: BingoCard, seatNumber: number): number[] {
    return masterCard.rows[seatNumber - 1];
  }

  // Check if player has won (full row marked)
  checkWinner(playerRow: number[], calledNumbers: Set<number>): boolean {
    return playerRow.every(num => calledNumbers.has(num));
  }

  // Initialize game state
  async initGame(gameId: string) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { seats: true }
    });

    if (!game) return;

    const state: GameState = {
      id: gameId,
      status: game.status as any,
      masterCard: game.masterCard ? JSON.parse(game.masterCard) : null,
      calledNumbers: game.calledNumbers ? game.calledNumbers.split(',').map(Number).filter(n => n) : [],
      participants: game.seats.length,
      prizePool: game.prizePool,
      winnerId: game.winnerId,
      countdownStart: null,
      interval: game.interval
    };

    this.games.set(gameId, state);
  }

  // Start countdown when seats are full
  async startCountdown(gameId: string, io: any) {
    const state = this.games.get(gameId);
    if (!state || state.status !== 'waiting') return;

    state.status = 'countdown';
    state.countdownStart = Date.now();

    await prisma.game.update({
      where: { id: gameId },
      data: { status: 'countdown' }
    });

    io.to(`game-${gameId}`).emit('countdown-start', { timeLeft: 60 });

    const timer = setTimeout(() => {
      this.startGame(gameId, io);
    }, 60000);

    this.timers.set(`countdown-${gameId}`, timer);
  }

  // Start the game
  async startGame(gameId: string, io: any) {
    const state = this.games.get(gameId);
    if (!state) return;

    // Clear countdown timer
    const countdownTimer = this.timers.get(`countdown-${gameId}`);
    if (countdownTimer) {
      clearTimeout(countdownTimer);
      this.timers.delete(`countdown-${gameId}`);
    }

    // Generate master card
    const seed = Date.now();
    const masterCard = this.generateMasterCard(seed);

    state.status = 'active';
    state.masterCard = masterCard;
    state.calledNumbers = [];
    state.countdownStart = null;

    // Get seats count for prize pool
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { seats: true, lobby: true }
    });

    if (!game) return;

    const prizePool = game.lobby.entryFee * game.seats.length;

    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'active',
        masterCard: JSON.stringify(masterCard),
        seed,
        startTime: new Date(),
        prizePool
      }
    });

    state.prizePool = prizePool;

    io.to(`game-${gameId}`).emit('game-started', {
      masterCard,
      prizePool,
      interval: state.interval
    });

    // Start calling numbers
    this.startCallingNumbers(gameId, io);
  }

  // Call numbers automatically
  private startCallingNumbers(gameId: string, io: any) {
    const state = this.games.get(gameId);
    if (!state || state.status !== 'active') return;

    const availableNumbers = Array.from({ length: 75 }, (_, i) => i + 1)
      .filter(n => !state.calledNumbers.includes(n));

    if (availableNumbers.length === 0) {
      this.endGame(gameId, io, null);
      return;
    }

    const nextNumber = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];
    state.calledNumbers.push(nextNumber);

    prisma.game.update({
      where: { id: gameId },
      data: { calledNumbers: state.calledNumbers.join(',') }
    }).catch(console.error);

    io.to(`game-${gameId}`).emit('number-called', {
      number: nextNumber,
      calledNumbers: state.calledNumbers
    });

    // Check for winners
    this.checkForWinners(gameId, io);

    // Schedule next number
    const timer = setTimeout(() => {
      this.startCallingNumbers(gameId, io);
    }, state.interval);

    this.timers.set(`calling-${gameId}`, timer);
  }

  // Check all players for winners
  private async checkForWinners(gameId: string, io: any) {
    const state = this.games.get(gameId);
    if (!state || !state.masterCard) return;

    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { seats: true }
    });

    if (!game) return;

    const calledSet = new Set(state.calledNumbers);

    for (const seat of game.seats) {
      const playerRow = this.getPlayerRow(state.masterCard, seat.seatNumber);
      if (this.checkWinner(playerRow, calledSet)) {
        await this.endGame(gameId, io, seat.userId);
        break;
      }
    }
  }

  // End game and distribute prize
  private async endGame(gameId: string, io: any, winnerId: string | null) {
    const state = this.games.get(gameId);
    if (!state) return;

    // Clear calling timer
    const callingTimer = this.timers.get(`calling-${gameId}`);
    if (callingTimer) {
      clearTimeout(callingTimer);
      this.timers.delete(`calling-${gameId}`);
    }

    state.status = 'finished';
    state.winnerId = winnerId;

    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'finished',
        winnerId
      }
    });

    if (winnerId) {
      await prisma.user.update({
        where: { id: winnerId },
        data: {
          balance: {
            increment: state.prizePool
          }
        }
      });
    }

    io.to(`game-${gameId}`).emit('game-ended', {
      winnerId,
      prizePool: state.prizePool,
      calledNumbers: state.calledNumbers
    });

    // Auto-reset after 10 seconds
    setTimeout(() => {
      this.resetGame(gameId, io);
    }, 10000);
  }

  // Reset game for next round
  private async resetGame(gameId: string, io: any) {
    const state = this.games.get(gameId);
    if (!state) return;

    // Clear all seats
    await prisma.seat.deleteMany({
      where: { gameId }
    });

    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'waiting',
        masterCard: null,
        seed: null,
        calledNumbers: '',
        prizePool: 0,
        winnerId: null,
        startTime: null
      }
    });

    state.status = 'waiting';
    state.masterCard = null;
    state.calledNumbers = [];
    state.participants = 0;
    state.prizePool = 0;
    state.winnerId = null;
    state.countdownStart = null;

    io.to(`game-${gameId}`).emit('game-reset');
  }

  // Manual admin start
  async adminStartGame(gameId: string, io: any) {
    const state = this.games.get(gameId);
    if (!state) return;

    // Clear any countdown
    const countdownTimer = this.timers.get(`countdown-${gameId}`);
    if (countdownTimer) {
      clearTimeout(countdownTimer);
      this.timers.delete(`countdown-${gameId}`);
    }

    await this.startGame(gameId, io);
  }

  // Update interval
  async setInterval(gameId: string, interval: number, io: any) {
    const state = this.games.get(gameId);
    if (!state) return;

    state.interval = interval;

    await prisma.game.update({
      where: { id: gameId },
      data: { interval }
    });

    io.to(`game-${gameId}`).emit('interval-updated', { interval });
  }

  // Mark cell
  async markCell(gameId: string, userId: string, number: number, io: any) {
    const state = this.games.get(gameId);
    if (!state || state.status !== 'active') return;

    const seat = await prisma.seat.findFirst({
      where: { gameId, userId }
    });

    if (!seat) return;

    const markedCells = seat.markedCells ? seat.markedCells.split(',').map(Number).filter(n => n) : [];

    if (!markedCells.includes(number)) {
      markedCells.push(number);
      await prisma.seat.update({
        where: { id: seat.id },
        data: { markedCells: markedCells.join(',') }
      });
    }

    // Check if this player won
    if (state.masterCard) {
      const playerRow = this.getPlayerRow(state.masterCard, seat.seatNumber);
      const calledSet = new Set(state.calledNumbers);

      if (this.checkWinner(playerRow, calledSet)) {
        await this.endGame(gameId, io, userId);
      }
    }
  }

  getState(gameId: string): GameState | undefined {
    return this.games.get(gameId);
  }
}

export const gameEngine = new GameEngine();
