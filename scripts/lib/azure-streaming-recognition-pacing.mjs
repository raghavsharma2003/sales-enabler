/** Push PCM at a declared real-time cadence. This deliberately does not wait
 * for a recognizer start callback: some SDKs do not resolve start until their
 * input stream supplies data. */
export async function pushPcmInRealTime({
  pcm,
  bytesPerChunk,
  chunkMs,
  write,
  close,
  isCancelled = () => false,
  now = () => performance.now(),
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  onStart = () => {},
  onChunk = () => {},
  onComplete = () => {},
}) {
  if (!(pcm instanceof Uint8Array) || !Number.isSafeInteger(bytesPerChunk) || bytesPerChunk < 1 ||
      !Number.isSafeInteger(chunkMs) || chunkMs < 1 || chunkMs > 100 || typeof write !== 'function' || typeof close !== 'function') {
    throw new Error('invalid-paced-input');
  }
  onStart(now());
  let chunks = 0;
  let bytes = 0;
  for (let offset = 0; offset < pcm.length; offset += bytesPerChunk) {
    if (isCancelled()) return { completed: false, chunks, bytes };
    const chunk = pcm.subarray(offset, Math.min(pcm.length, offset + bytesPerChunk));
    write(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength));
    chunks++;
    bytes += chunk.byteLength;
    onChunk({ chunks, bytes, at: now() });
    await wait(chunkMs);
  }
  if (isCancelled()) return { completed: false, chunks, bytes };
  const completedAt = now();
  onComplete(completedAt);
  close();
  return { completed: true, chunks, bytes, completedAt };
}
