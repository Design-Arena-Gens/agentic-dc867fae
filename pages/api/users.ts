import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    const { username } = req.body;

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return res.json(existing);
    }

    const user = await prisma.user.create({
      data: { username, balance: 100.0 }
    });

    return res.json(user);
  }

  if (req.method === 'GET') {
    const { id } = req.query;
    const user = await prisma.user.findUnique({
      where: { id: id as string }
    });
    return res.json(user);
  }

  res.status(405).json({ error: 'Method not allowed' });
}
