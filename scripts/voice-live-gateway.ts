import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createVoiceLiveHost } from '../lib/voice/voice-live-host';
import { VOICE_LIVE_MAX_CONTROL_BYTES } from '../lib/voice/voice-live-protocol';

const port = Number(process.env.VOICE_LIVE_GATEWAY_PORT || 3002);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid private Voice Live gateway port.');
const host = createVoiceLiveHost();
const sockets = new WebSocketServer({ noServer: true, maxPayload: VOICE_LIVE_MAX_CONTROL_BYTES, perMessageDeflate: false });
const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ status: 'ok', service: 'private-voice-live-gateway' }));
  } else { response.writeHead(404); response.end(); }
});
server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/private-voice-live' || !request.headers.origin || sockets.clients.size >= 20) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
  }
  sockets.handleUpgrade(request, socket, head, client => host.attach(client, request));
});
server.listen(port, process.env.VOICE_LIVE_GATEWAY_HOST || '127.0.0.1', () => {
  process.stdout.write(`Private Voice Live gateway listening on port ${port}; every session requires application authorization.\n`);
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  host.shutdown();
  for (const client of sockets.clients) client.close(1001);
  sockets.close(); server.close();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
