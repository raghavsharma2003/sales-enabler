// The hook half of voice-stack.ts (kept apart so the resolver stays pure and testable without React).
import * as api from './api.ts';
import { useData } from './store.tsx';
import { resolveVoiceStack, type StackCatalog, type StackLite, type VoiceRef } from './voice-stack.ts';

/** `ready` is false until stack.list has answered, so "no stack" is never shown while it loads. */
export function useVoiceStack(v: VoiceRef): { stack: StackLite | undefined; ready: boolean } {
  const q = useData<StackCatalog>('stack-list', () => api.run<StackCatalog>('stack.list', {}));
  return { stack: q.data ? resolveVoiceStack(q.data, v) : undefined, ready: !!q.data || q.state === 'error' };
}
