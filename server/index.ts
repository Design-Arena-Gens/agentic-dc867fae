import { Server } from 'socket.io';
import { createServer } from 'http';
import { PrismaClient } from '@prisma/client';
import { gameEngine } from './gameEngine';

const prisma = new PrismaClient();

export function initSocketServer(httpServer: any) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Join lobby
    socket.on('join-lobby', async (data: { lobbyId: string; userId: string }) => {
      socket.join(`lobby-${data.lobbyId}`);

      const lobby = await prisma.lobby.findUnique({
        where: { id: data.lobbyId },
        include: {
          games: {
            include: { seats: true },
            orderBy: { gameNumber: 'asc' }
          }
        }
      });

      socket.emit('lobby-state', lobby);
    });

    // Join game
    socket.on('join-game', async (data: { gameId: string; userId: string; seatNumber: number }) => {
      const game = await prisma.game.findUnique({
        where: { id: data.gameId },
        include: { seats: true, lobby: true }
      });

      if (!game || game.status !== 'waiting') {
        socket.emit('error', { message: 'Game not available' });
        return;
      }

      // Check if seat is taken
      const seatTaken = game.seats.some(s => s.seatNumber === data.seatNumber);
      if (seatTaken) {
        socket.emit('error', { message: 'Seat already taken' });
        return;
      }

      // Check user balance
      const user = await prisma.user.findUnique({ where: { id: data.userId } });
      if (!user || user.balance < game.lobby.entryFee) {
        socket.emit('error', { message: 'Insufficient balance' });
        return;
      }

      // Check max 2 seats per player
      const userSeats = game.seats.filter(s => s.userId === data.userId);
      if (userSeats.length >= 2) {
        socket.emit('error', { message: 'Max 2 seats per player' });
        return;
      }

      // Deduct entry fee
      await prisma.user.update({
        where: { id: data.userId },
        data: { balance: { decrement: game.lobby.entryFee } }
      });

      // Create seat
      await prisma.seat.create({
        data: {
          gameId: data.gameId,
          userId: data.userId,
          seatNumber: data.seatNumber
        }
      });

      socket.join(`game-${data.gameId}`);

      // Get updated game
      const updatedGame = await prisma.game.findUnique({
        where: { id: data.gameId },
        include: { seats: { include: { user: true } } }
      });

      io.to(`game-${data.gameId}`).emit('game-updated', updatedGame);

      // Check if game is full (15 seats)
      if (updatedGame?.seats.length === 15) {
        await gameEngine.initGame(data.gameId);
        await gameEngine.startCountdown(data.gameId, io);
      }
    });

    // Mark cell
    socket.on('mark-cell', async (data: { gameId: string; userId: string; number: number }) => {
      await gameEngine.markCell(data.gameId, data.userId, data.number, io);
    });

    // Admin start
    socket.on('admin-start', async (data: { gameId: string }) => {
      await gameEngine.initGame(data.gameId);
      await gameEngine.adminStartGame(data.gameId, io);
    });

    // Admin set interval
    socket.on('admin-set-interval', async (data: { gameId: string; interval: number }) => {
      await gameEngine.setInterval(data.gameId, data.interval, io);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
}
