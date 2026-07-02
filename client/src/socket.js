import { io } from 'socket.io-client';

let playerId = localStorage.getItem('rummy-playerId');
if (!playerId) {
  playerId = crypto.randomUUID();
  localStorage.setItem('rummy-playerId', playerId);
}

export const myPlayerId = playerId;

export const socket = io('/', {
  autoConnect: false,
  auth: { playerId, name: localStorage.getItem('rummy-name') || '' },
});

export function connectAs(name) {
  localStorage.setItem('rummy-name', name);
  socket.auth = { playerId, name };
  if (!socket.connected) socket.connect();
}

/** emit with Promise ack */
export function req(event, payload) {
  return new Promise((resolve) => {
    socket.timeout(8000).emit(event, payload, (err, res) => {
      if (err) resolve({ ok: false, error: '連線逾時' });
      else resolve(res ?? { ok: true });
    });
  });
}
