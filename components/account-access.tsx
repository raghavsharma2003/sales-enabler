'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import '@/app/account-access.css';

type Mode = 'forgot' | 'reset' | 'verify';
type Status = { email: string; emailVerified: boolean; verificationRequired: boolean; delivery: 'setup-required' | 'local-outbox' | 'azure-configured' };
async function post(path: string, body: unknown) {
  const response = await fetch(`/api/account/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed. Try again.');
  return data;
}
export function AccountAccess({ mode }: { mode: Mode }) {
  const [token, setToken] = useState(''), [ready, setReady] = useState(mode === 'forgot');
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const prefix = useId();
  const fragmentRead = useRef(false);
  useEffect(() => {
    if (mode === 'forgot' || fragmentRead.current) return;
    fragmentRead.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    // Fragment never reaches the server or referrer. Scrub browser history before any fetch.
    window.history.replaceState(null, '', window.location.pathname);
    setToken(value); setReady(true);
  }, [mode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    const values = new FormData(event.currentTarget), password = String(values.get('password') || '');
    if (mode === 'reset' && password !== values.get('confirm')) { setError('Passwords do not match.'); setBusy(false); return; }
    try {
      const data = await post(mode === 'verify' && !token ? 'resend' : mode, { email: values.get('email'), password, token });
      setMessage(data.message || (mode === 'reset' ? 'Your password has changed and all previous sessions are signed out. Sign in with your new password.' : 'Your email is verified. You can return to your workspace.'));
      setDone(true); setToken('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  const title = mode === 'forgot' ? 'Reset your password' : mode === 'reset' ? 'Choose a new password' : 'Verify your email';
  return <main className="account-page"><section className="account-panel" aria-labelledby={`${prefix}-title`}>
    <Link className="account-home" href="/">Company workspace</Link>
    <h1 id={`${prefix}-title`}>{title}</h1>
    <p className="account-intro">{mode === 'forgot' ? 'Enter your account email to request a single-use recovery link.' : mode === 'reset' ? 'Use 8–128 characters. Changing your password signs out every device.' : token ? 'Confirm this email belongs to you to finish setting up your account.' : 'Request a verification link for your account email. Existing workspace access is shown in account security.'}</p>
    {!ready ? <p role="status">Preparing your link…</p> : done ? <div className="account-message" role="status">{message}</div> : mode === 'reset' && !token ? <p role="alert">This page needs the complete recovery link from your email. <Link href="/account/forgot">Request a new link</Link>.</p> : <form onSubmit={submit}>
      {(mode === 'forgot' || mode === 'verify' && !token) && <label htmlFor={`${prefix}-email`}>Account email<input id={`${prefix}-email`} type="email" name="email" autoComplete="email" maxLength={254} required /></label>}
      {mode === 'reset' && <><label htmlFor={`${prefix}-password`}>New password<input id={`${prefix}-password`} type="password" name="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label><label htmlFor={`${prefix}-confirm`}>Confirm new password<input id={`${prefix}-confirm`} type="password" name="confirm" autoComplete="new-password" minLength={8} maxLength={128} required /></label></>}
      <button type="submit" disabled={busy}>{busy ? 'Working…' : mode === 'forgot' ? 'Send recovery link' : mode === 'reset' ? 'Change password' : token ? 'Verify email' : 'Send verification link'}</button>
    </form>}
    {error && <p className="account-error" role="alert">{error}</p>}
    <nav className="account-links" aria-label="Account access"><Link href="/">Return to sign in</Link>{mode !== 'forgot' && <Link href="/account/forgot">Request recovery link</Link>}</nav>
  </section></main>;
}
export function AccountSecurity() {
  const [status, setStatus] = useState<Status | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [changed, setChanged] = useState(false);
  const prefix = useId();
  useEffect(() => { let active = true; fetch('/api/account/status').then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Sign in to view account security.'); if (active) setStatus(value); }).catch(failure => { if (active) setError(failure.message); }); return () => { active = false; }; }, []);
  async function resend() {
    setBusy(true); setError(''); setMessage('');
    try { const value = await post('resend', { email: status?.email }); setMessage(value.message); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  async function change(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget, values = new FormData(form); setError(''); setMessage('');
    if (values.get('password') !== values.get('confirm')) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try { await post('password', { currentPassword: values.get('current'), password: values.get('password') }); form.reset(); setChanged(true); setMessage('Password changed. All devices are signed out. Sign in again to continue.'); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className="account-security" aria-labelledby={`${prefix}-title`}><h1 id={`${prefix}-title`}>Account security</h1>
    {!status && !error && <p role="status">Loading account security…</p>}
    {status && <><p className="account-email">{status.email}</p><p>{status.emailVerified ? 'Email verified' : status.verificationRequired ? 'Email verification required before using the workspace.' : 'Email not yet verified. Your existing workspace access remains available.'}</p>
      {status.delivery === 'setup-required' && !status.emailVerified && <p>Account email delivery needs administrator setup. Recovery and verification emails cannot be sent yet.</p>}
      {status.delivery === 'local-outbox' && <p>Development email outbox is enabled. Messages are written locally; no email is sent.</p>}
      {!status.emailVerified && !changed && <button type="button" disabled={busy || status.delivery === 'setup-required'} onClick={resend}>Send verification link</button>}
      {!changed && <form onSubmit={change}><h3>Change password</h3><p>This signs out every device, including this one.</p><label htmlFor={`${prefix}-current`}>Current password<input id={`${prefix}-current`} type="password" name="current" autoComplete="current-password" required maxLength={128} /></label><label htmlFor={`${prefix}-password`}>New password<input id={`${prefix}-password`} type="password" name="password" autoComplete="new-password" minLength={8} maxLength={128} required /></label><label htmlFor={`${prefix}-confirm`}>Confirm new password<input id={`${prefix}-confirm`} type="password" name="confirm" autoComplete="new-password" minLength={8} maxLength={128} required /></label><button disabled={busy} type="submit">{busy ? 'Working…' : 'Change password and sign out'}</button></form>}</>}
    {message && <p role="status" className="account-message">{message}</p>}{error && <p role="alert" className="account-error">{error}</p>}{changed && <Link href="/">Sign in again</Link>}
  </section>;
}
