// VP staging: the control plane's main.ts calls server.listen(port); bind it to 127.0.0.1 only (Caddy fronts it).
import net from 'node:net';
const orig = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  const p = args[0];
  if ((typeof p === 'number' || (typeof p === 'string' && /^\d+$/.test(p))) && (args.length === 1 || typeof args[1] === 'function')) args.splice(1, 0, '127.0.0.1');
  return orig.apply(this, args);
};
