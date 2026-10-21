// Sign up and sign in. One screen, two modes. Errors say what to do next; the password rule is stated before the user trips on it.
import { useState } from 'react';
import { Check } from 'lucide-react';
import * as api from '../api.ts';
import { ApiError } from '../api.ts';
import { useApp } from '../store.tsx';
import { Link, useNav } from '../router.tsx';
import { Btn, TextField } from '../ui.tsx';
import { Mark } from '../shell.tsx';

export default function Auth({ mode }: { mode: 'login' | 'signup' }) {
  const { refreshMe, toast } = useApp();
  const go = useNav();
  const [f, setF] = useState({ workspace: '', name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ path?: string; message: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const bad = (k: string) => (err && (err.path === k) ? err.message : null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (mode === 'signup' && f.password.length < 10) { setErr({ path: 'password', message: 'Use at least 10 characters. A few words together is easiest to remember.' }); return; }
    setBusy(true);
    try {
      if (mode === 'signup') await api.signup(f); else await api.login({ email: f.email, password: f.password });
      await refreshMe(); go('/', true);
      if (mode === 'signup') toast('Your workspace is ready. Start by hearing an agent, or tell Saarthi the job.', 'ok');
    } catch (x) {
      const a = x as ApiError;
      setErr({ path: a.path, message: a instanceof ApiError ? (a.status === 429 ? 'Too many tries. Wait a few minutes and try again.' : a.message) : 'Something went wrong.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="auth-side">
        <div className="row" style={{ color: 'var(--nav-ink)' }}><Mark size={40} /><div><b className="serif" style={{ fontSize: '1.375rem' }}>Vyakti</b> <span className="deva-big" lang="hi">व्यक्ति</span></div></div>
        <div className="stack">
          <h1 className="serif">Calls that sound like a person who listens.</h1>
          <p lang="hi">आपके ग्राहकों से बात करने वाला एजेंट, जो हिंदी, अंग्रेज़ी और हिंग्लिश में सहज है। आप बस बोलिए, बाकी Saarthi संभालता है।</p>
          <ul className="auth-points">
            {['Setup by talking: tell Saarthi the job in Hinglish or English.', 'You pick the voice by ear, with measured speed and price on every choice.', 'Nothing reaches a customer, and no money is spent, without your tap.'].map(t => <li key={t}><Check size={16} aria-hidden style={{ flex: 'none', marginTop: 4 }} /> {t}</li>)}
          </ul>
        </div>
        <p className="hide-m small">Every Vyakti agent says, once and lightly, that it is an AI. That cannot be switched off.</p>
      </div>
      <form className="auth-form" onSubmit={submit} noValidate>
        <h2 className="serif">{mode === 'signup' ? 'Create your workspace' : 'Welcome back'}</h2>
        {mode === 'signup' && <>
          <TextField label="Business name" value={f.workspace} onChange={set('workspace')} required autoComplete="organization" error={bad('workspace')} placeholder="e.g. Saanjh Services" />
          <TextField label="Your name" value={f.name} onChange={set('name')} required autoComplete="name" error={bad('name')} />
        </>}
        <TextField label="Work email" type="email" value={f.email} onChange={set('email')} required autoComplete="email" inputMode="email" error={bad('email')} />
        <TextField label="Password" type="password" value={f.password} onChange={set('password')} required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          hint={mode === 'signup' ? 'At least 10 characters.' : undefined} error={bad('password')} />
        {err && !['workspace', 'name', 'email', 'password'].includes(err.path ?? '') && <p className="hint hint-bad" role="alert">{err.message}</p>}
        <Btn kind="primary" type="submit" busy={busy}>{mode === 'signup' ? 'Create workspace' : 'Sign in'}</Btn>
        <p className="small muted">{mode === 'signup' ? <>Already have a workspace? <Link to="/login">Sign in</Link></> : <>New here? <Link to="/signup">Create a workspace</Link></>}</p>
      </form>
    </div>
  );
}
