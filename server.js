const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Mineblown relay server');
});

// ── WebSocket relay ───────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

const rooms = new Map();   // code → { host: ws }
let waitingSocket = null;

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 },
      () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function matchPair(p1, p2) {
  const seed = Math.floor(Math.random() * 2 ** 31);
  p1.partner = p2;
  p2.partner = p1;
  p1.send(JSON.stringify({ type: 'matched', playerNum: 1, seed }));
  p2.send(JSON.stringify({ type: 'matched', playerNum: 2, seed }));
  p1.on('message', msg => relay(p1, msg));
  p2.on('message', msg => relay(p2, msg));
  p1.on('close', () => notifyLeft(p2));
  p2.on('close', () => notifyLeft(p1));
}

function relay(sender, raw) {
  if (sender.partner?.readyState === 1) sender.partner.send(raw.toString());
}

function notifyLeft(other) {
  if (other?.readyState === 1) other.send(JSON.stringify({ type: 'opponent_left' }));
  if (other) other.partner = null;
}

wss.on('connection', ws => {
  ws.partner = null;
  ws.roomCode = null;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'quickmatch') {
      if (waitingSocket && waitingSocket !== ws && waitingSocket.readyState === 1) {
        const opp = waitingSocket;
        waitingSocket = null;
        matchPair(opp, ws);
      } else {
        waitingSocket = ws;
        ws.send(JSON.stringify({ type: 'waiting' }));
      }
    } else if (msg.type === 'create_room') {
      const code = generateCode();
      rooms.set(code, { host: ws });
      ws.roomCode = code;
      ws.send(JSON.stringify({ type: 'room_created', code }));
    } else if (msg.type === 'join_room') {
      const room = rooms.get(msg.code?.toUpperCase());
      if (!room) {
        ws.send(JSON.stringify({ type: 'room_not_found' }));
      } else {
        rooms.delete(msg.code.toUpperCase());
        matchPair(room.host, ws);
      }
    }
  });

  ws.on('close', () => {
    if (waitingSocket === ws) waitingSocket = null;
    if (ws.roomCode) rooms.delete(ws.roomCode);
    notifyLeft(ws.partner);
  });
});

server.listen(PORT, '::', () => console.log(`Server running on http://localhost:${PORT}`));
