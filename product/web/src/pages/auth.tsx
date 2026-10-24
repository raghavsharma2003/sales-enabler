// Sign up and sign in. One screen, two modes. Errors say what to do next; the password rule is stated before the user trips on it.
import { useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import * as api from '../api.ts';
import { ApiError } from '../api.ts';
import { useApp } from '../store.tsx';
import { Link, useNav, useQuery } from '../router.tsx';
import { Btn, TextField } from '../ui.tsx';
import { Mark } from '../shell.tsx';

/** What the server's /signin?sso_error=<code> redirect means for a person. Codes never reach the screen. */
const SSO_VERIFY = "Your identity provider's response could not be verified. Ask your administrator to check the single sign-on settings.";
const SSO_ERROR: Record<string, string> = {
  state_mismatch: 'The sign-in took too long or was started in another browser. Try again.',
  expired: 'The sign-in took too long or was started in another browser. Try again.',
  domain_mismatch: 'Your email domain is not allowed to sign in to this workspace with single sign-on. Ask your administrator to add it.',
  email_unverified: 'Your identity provider says your email address is not verified. Verify it with your provider, then try again.',
  deactivated: 'Your account in this workspace has been deactivated. Ask your administrator.',
  email_elsewhere: 'This email address already belongs to another Vyakti workspace. Ask your administrator to use a different address.',
  subject_mismatch: 'This email address is already linked to a different account at your identity provider. Ask your administrator to review it.',
  not_configured: 'Single sign-on is not switched on for this workspace. Sign in with your password, or ask your administrator.',
  idp_unreachable: 'Vyakti could not reach your identity provider. Try again in a few minutes.',
  idp_error: 'Your identity provider declined the sign-in or reported a problem. Try again, or ask your administrator.',
  config_changed: 'The single sign-on settings changed while you were signing in. Start again.',
  no_email: 'Your identity provider did not share an email address. Ask your administrator to allow the email scope for Vyakti.',
  link_unverified: 'Your identity provider did not confirm this email address, so it cannot be linked to your existing account.',
  link_required: 'Owners link single sign-on from Settings, then Security, while signed in.',
  unknown_workspace: 'That sign-in link is not valid. Enter your work email and choose Sign in with SSO again.',
  wrong_iss: SSO_VERIFY, wrong_aud: SSO_VERIFY, wrong_nonce: SSO_VERIFY, bad_alg: SSO_VERIFY, unknown_kid: SSO_VERIFY, bad_signature: SSO_VERIFY, token_exchange_failed: SSO_VERIFY,
  malformed: SSO_VERIFY, bad_iat: SSO_VERIFY, bad_nbf: SSO_VERIFY, bad_key: SSO_VERIFY, no_code: SSO_VERIFY,
};
export const ssoErrorText = (code: string) => SSO_ERROR[code] ?? 'Single sign-on did not finish. Try again, or ask your administrator.';

export default function Auth({ mode }: { mode: 'login' | 'signup' }) {
  const { refreshMe, toast } = useApp();
  const go = useNav();
  const [f, setF] = useState({ workspace: '', name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ path?: string; message: string } | null>(null);
  const [query] = useQuery();
  const ssoCode = mode === 'login' ? query.get('sso_error') : null;
  // The password sign-in said this workspace uses single sign-on: offer that button first.
  const [ssoOnly, setSsoOnly] = useState(false);
  const [ssoBusy, setSsoBusy] = useState(false);
  const [ssoNote, setSsoNote] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const bad = (k: string) => (err && (err.path === k) ? err.message : null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(null);
    if (mode === 'signup' && f.password.length < 10) { setErr({ path: 'password', message: 'Use at least 10 characters. A few words together is easiest to remember.' }); return; }
    setBusy(true);
    try {
      if (mode === 'signup') await api.signup(f); else await api.login({ email: f.email, password: f.password });
      await refreshMe(); go('/', true);
      if (mode === 'signup') toast('Your workspace is ready. Start by hearing an agent, or tell the assistant the job.', 'ok');
    } catch (x) {
      const a = x as ApiError;
      if (a instanceof ApiError && a.code === 'sso_required') { setSsoOnly(true); setErr({ message: 'This workspace signs in with single sign-on.' }); return; }
      setErr({ path: a.path, message: a instanceof ApiError ? (a.status === 429 ? 'Too many tries. Wait a few minutes and try again.' : a.message) : 'Something went wrong.' });
    } finally { setBusy(false); }
  };

  /** Ask the server which way this email signs in; go to the identity provider when it has single sign-on, else say so. */
  const sso = async () => {
    setSsoNote(null); setErr(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) { setSsoNote('Enter your work email above first.'); return; }
    setSsoBusy(true);
    try {
      const d = await api.ssoDiscover(f.email.trim());
      if (d.sso) { await api.ssoStart(d.workspaceId); return; }
      setSsoNote(`Single sign-on is not set up for ${f.email.trim().split('@')[1]}. Sign in with your password, or ask your administrator.`);
    } catch (x) {
      setSsoNote(x instanceof ApiError ? (x.status === 429 ? 'Too many tries. Wait a few minutes and try again.' : x.message) : 'Something went wrong.');
    } finally { setSsoBusy(false); }
  };

  return (
    <div className="auth">
      <div className="auth-side">
        <div className="row" style={{ color: 'var(--nav-ink)' }}><Mark size={40} /><div><b className="serif" style={{ fontSize: '1.375rem' }}>Vyakti</b></div></div>
        <div className="stack">
          <h1 className="serif">Voice agents for your customer calls.</h1>
          <ul className="auth-points">
            {['Set up by describing the job in plain words to the assistant.', 'You pick the voice by ear, with measured speed and price on every choice.', 'Nothing reaches a customer, and no money is spent, without your approval.'].map(t => <li key={t}><Check size={16} aria-hidden style={{ flex: 'none', marginTop: 4 }} /> {t}</li>)}
          </ul>
        </div>
        <p className="hide-m small">Every Vyakti agent says, once and lightly, that it is an AI. That cannot be switched off.</p>
      </div>
      <form className="auth-form" onSubmit={submit} noValidate>
        <h2 className="serif">{mode === 'signup' ? 'Create your workspace' : 'Welcome back'}</h2>
        {ssoCode && <div className="notice notice-bad" role="alert"><AlertTriangle size={20} aria-hidden /><div><strong>Single sign-on did not finish</strong><p className="small">{ssoErrorText(ssoCode)}</p></div></div>}
        {mode === 'signup' && <>
          <TextField label="Business name" value={f.workspace} onChange={set('workspace')} required autoComplete="organization" error={bad('workspace')} placeholder="e.g. Saanjh Services" />
          <TextField label="Your name" value={f.name} onChange={set('name')} required autoComplete="name" error={bad('name')} />
        </>}
        <TextField label="Work email" type="email" value={f.email} onChange={set('email')} required autoComplete="email" inputMode="email" error={bad('email')} />
        <TextField label="Password" type="password" value={f.password} onChange={set('password')} required autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          hint={mode === 'signup' ? 'At least 10 characters.' : undefined} error={bad('password')} />
        {err && !['workspace', 'name', 'email', 'password'].includes(err.path ?? '') && <p className="hint hint-bad" role="alert">{err.message}</p>}
        <Btn kind={ssoOnly ? 'secondary' : 'primary'} type="submit" busy={busy}>{mode === 'signup' ? 'Create workspace' : 'Sign in'}</Btn>
        {mode === 'login' && <div className="auth-sso">
          <p className="auth-or" aria-hidden>or</p>
          <Btn kind={ssoOnly ? 'primary' : 'secondary'} busy={ssoBusy} onClick={() => void sso()}>Sign in with SSO</Btn>
          <p className={ssoNote ? 'hint hint-bad' : 'hint'} role={ssoNote ? 'alert' : undefined}>{ssoNote ?? 'Use your company\'s identity provider. Enter your work email first.'}</p>
        </div>}
        <p className="small muted">{mode === 'signup' ? <>Already have a workspace? <Link to="/login">Sign in</Link></> : <>New here? <Link to="/signup">Create a workspace</Link></>}</p>
      </form>
    </div>
  );
}
