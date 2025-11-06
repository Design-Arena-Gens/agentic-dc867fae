import { NextApiRequest, NextApiResponse } from 'next';
import { Server as ServerIO } from 'socket.io';
import { Server as NetServer } from 'http';
import { initSocketServer } from '../../server';

export const config = {
  api: {
    bodyParser: false,
  },
};

const SocketHandler = (req: NextApiRequest, res: any) => {
  if (!res.socket.server.io) {
    console.log('Initializing Socket.IO server...');
    const httpServer: NetServer = res.socket.server as any;
    const io = initSocketServer(httpServer);
    res.socket.server.io = io;
  }
  res.end();
};

export default SocketHandler;
