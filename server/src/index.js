import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager.js';
import { registerHandlers } from './socket/handlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true },
});

// production:直接供應前端 build
const clientDist = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDist));
app.get('/health', (_req, res) => res.json({ ok: true }));

const rooms = new RoomManager();
registerHandlers(io, rooms);

httpServer.listen(PORT, () => {
  console.log(`Rummy server listening on http://localhost:${PORT}`);
});
