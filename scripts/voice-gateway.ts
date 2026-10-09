import { createVoiceGateway } from '../lib/public-agent/gateway';

const port = Number(process.env.PUBLIC_VOICE_GATEWAY_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid public voice gateway port.');
const gateway = createVoiceGateway();
gateway.server.listen(port, process.env.PUBLIC_VOICE_GATEWAY_HOST || '0.0.0.0', () => {
  process.stdout.write(`Voice gateway listening on port ${port}; public voice and private speech require application authorization before provider startup.\n`);
});
process.once('SIGINT', gateway.shutdown);
process.once('SIGTERM', gateway.shutdown);
