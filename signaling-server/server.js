import http from 'node:http';
import { WebSocketServer } from 'ws';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const rooms = new Map();

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(room, sender, message) {
  for (const peer of room.peers) {
    if (peer !== sender) send(peer.socket, message);
  }
}

function removePeer(peer) {
  const room = rooms.get(peer.room);
  if (!room) return;
  room.peers.delete(peer);
  if (room.peers.size === 0) rooms.delete(peer.room);
}

const server = http.createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    response.end(JSON.stringify({ ok: true, service: 'tortello-games-signaling' }));
    return;
  }
  response.writeHead(404);
  response.end('Not found');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket, request) => {
  const url = new URL(request.url || '/', 'http://localhost');
  const roomCode = (url.searchParams.get('room') || '').trim().toUpperCase();
  const role = url.searchParams.get('role') || '';

  if (!/^[A-Z0-9]{6}$/.test(roomCode) || !['host', 'guest'].includes(role)) {
    send(socket, { v: 1, type: 'error', payload: { code: 'invalid_room_or_role' }, timestamp: Date.now() });
    socket.close(1008, 'Invalid room or role');
    return;
  }

  let room = rooms.get(roomCode);
  if (!room) {
    room = { peers: new Set() };
    rooms.set(roomCode, room);
  }

  const sameRole = [...room.peers].some((peer) => peer.role === role);
  if (sameRole || room.peers.size >= 2) {
    send(socket, { v: 1, type: 'error', payload: { code: 'room_full' }, timestamp: Date.now() });
    socket.close(1008, 'Room full');
    return;
  }

  const peer = { id: randomUUID(), socket, room: roomCode, role };
  room.peers.add(peer);

  send(socket, {
    v: 1, type: 'hello',
    payload: { peerId: peer.id, room: roomCode, role },
    timestamp: Date.now()
  });

  if (room.peers.size === 2) {
    broadcast(room, peer, {
      v: 1, type: 'peer_ready', payload: { role }, timestamp: Date.now()
    });
  }

  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      if (!message || message.v !== 1 || typeof message.type !== 'string') return;
      if (['hello', 'offer', 'answer', 'ice', 'ping', 'pong'].includes(message.type)) {
        broadcast(room, peer, message);
      }
    } catch {
      send(socket, { v: 1, type: 'error', payload: { code: 'invalid_message' }, timestamp: Date.now() });
    }
  });

  socket.on('close', () => removePeer(peer));
  socket.on('error', () => removePeer(peer));
});

server.listen(PORT, () => {
  console.log('Tortello Games signaling server listening on :' + PORT);
});
