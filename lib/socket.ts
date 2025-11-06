import { io, Socket } from 'socket.io-client';

let socket: Socket;

export const initSocket = () => {
  if (!socket) {
    fetch('/api/socket');
    socket = io({
      path: '/api/socket',
    });
  }
  return socket;
};

export const getSocket = () => socket;
