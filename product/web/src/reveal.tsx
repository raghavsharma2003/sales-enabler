// Copy buttons and the "shown once" sheet. One component for every secret the server reveals a single time
// (API keys, provisioning tokens), so the wording and the behaviour cannot drift apart.
import type { ReactNode } from 'react';
import { Copy } from 'lucide-react';
import { useApp } from './store.tsx';
import { Btn, Sheet } from './ui.tsx';

/** Copy `text` to the clipboard and say so. Never throws; when the browser refuses it says what to do instead. */
export function useCopy() {
  const { toast } = useApp();
  return async (text: string, done = 'Copied.') => {
    try { await navigator.clipboard.writeText(text); toast(done, 'ok'); } catch { toast('Could not copy. Select the text and copy it yourself.', 'bad'); }
  };
}

export function CopyBtn({ text, what, size = 'md', label = 'Copy' }: { text: string; what: string; size?: 'md' | 'sm'; label?: string }) {
  const copy = useCopy();
  return <Btn size={size} icon={<Copy size={16} aria-hidden />} aria-label={`${label} ${what}`} onClick={() => void copy(text, `${what[0].toUpperCase()}${what.slice(1)} copied.`)}>{label}</Btn>;
}

export function RevealSheet({ title, secret, onClose, extra }: { title: string; secret: string; onClose: () => void; extra?: ReactNode }) {
  const copy = useCopy();
  return (
    <Sheet title={title} onClose={onClose}>
      <p className="muted">This is the only time it is shown. Store it in your secrets manager, not in a chat or a spreadsheet.</p>
      <code className="secret">{secret}</code>
      {extra}
      <div className="row"><Btn icon={<Copy size={16} aria-hidden />} onClick={() => void copy(secret)}>Copy</Btn><Btn kind="primary" onClick={onClose}>I have saved it</Btn></div>
    </Sheet>
  );
}
