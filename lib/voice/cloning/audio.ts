import { HttpError } from '../../server/http';

export const MAX_FILE = 10 * 1024 * 1024;
export const MAX_REQUEST = 21 * 1024 * 1024;

export function validateWav(file: File, bytes: Buffer, role: 'consent' | 'sample'): { durationSeconds: number } {
  if (!['audio/wav', 'audio/wave', 'audio/x-wav'].includes(file.type.toLowerCase()) || file.size !== bytes.length || bytes.length < 44 || bytes.length > MAX_FILE)
    throw new HttpError(400, `${role} must be a WAV file of at most 10 MiB.`);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE' || bytes.readUInt32LE(4) + 8 !== bytes.length)
    throw new HttpError(400, `${role} has an invalid WAV container.`);
  let offset = 12, format = false, dataBytes = 0, sampleRate = 0;
  while (offset + 8 <= bytes.length) {
    const name = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4), start = offset + 8;
    if (length > bytes.length - start) throw new HttpError(400, `${role} has a truncated WAV chunk.`);
    if (name === 'fmt ') {
      if (format || length < 16 || bytes.readUInt16LE(start) !== 1 || bytes.readUInt16LE(start + 2) !== 1 || bytes.readUInt32LE(start + 4) !== 24000 || bytes.readUInt16LE(start + 14) !== 16 || bytes.readUInt16LE(start + 12) !== 2 || bytes.readUInt32LE(start + 8) !== 48000)
        throw new HttpError(400, `${role} must be 24 kHz, 16-bit, mono PCM WAV.`);
      format = true; sampleRate = 24000;
    }
    if (name === 'data') {
      if (dataBytes || length % 2) throw new HttpError(400, `${role} has invalid WAV audio data.`);
      dataBytes = length;
      let signal = false;
      for (let at = start; at < start + length; at += 2) if (Math.abs(bytes.readInt16LE(at)) > 100) { signal = true; break; }
      if (!signal) throw new HttpError(400, `${role} audio is silent.`);
    }
    offset = start + length + (length % 2);
  }
  if (!format || !dataBytes || offset !== bytes.length) throw new HttpError(400, `${role} has an invalid WAV structure.`);
  const durationSeconds = dataBytes / (sampleRate * 2);
  if (durationSeconds < 5 || durationSeconds > 90 || (role === 'sample' && durationSeconds < 30))
    throw new HttpError(400, `${role} must contain ${role === 'sample' ? '30–90' : '5–90'} seconds of speech.`);
  return { durationSeconds };
}
