export interface VoiceStartAttempt {
  signal: AbortSignal;
  isCurrent(): boolean;
  /** Discard a result that arrives after End, unmount, or a newer start. */
  currentResult<T>(pending: Promise<T>): Promise<T | undefined>;
}

export function createVoiceStartGate() {
  let generation = 0;
  let controller: AbortController | undefined;

  function cancel() {
    generation += 1;
    controller?.abort();
    controller = undefined;
  }

  return {
    cancel,
    begin(): VoiceStartAttempt {
      cancel();
      controller = new AbortController();
      const startedAt = generation;
      const signal = controller.signal;
      const isCurrent = () => !signal.aborted && generation === startedAt;
      return {
        signal,
        isCurrent,
        async currentResult<T>(pending: Promise<T>) {
          const value = await pending;
          return isCurrent() ? value : undefined;
        },
      };
    },
  };
}
