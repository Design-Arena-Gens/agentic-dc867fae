import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const lobbies = await prisma.lobby.findMany({
      include: {
        games: {
          include: { seats: true },
          orderBy: { gameNumber: 'asc' }
        }
      }
    });
    return res.json(lobbies);
  }

  if (req.method === 'POST') {
    const { entryFee } = req.body;

    const lobby = await prisma.lobby.create({
      data: {
        entryFee: parseFloat(entryFee),
        games: {
          create: [
            { gameNumber: 1 },
            { gameNumber: 2 },
            { gameNumber: 3 },
            { gameNumber: 4 }
          ]
        }
      },
      include: { games: true }
    });

    return res.json(lobby);
  }

  res.status(405).json({ error: 'Method not allowed' });
}
