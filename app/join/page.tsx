'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import '../platform.css';
import '../team.css';
type Invitation = { email: string; role: string; expiresAt: string; organizationName: string };
export default function JoinPage() {
  const initialized = useRef(false);
  const [token, setToken] = useState(''), [invite, setInvite] = useState<Invitation | null>(null), [password, setPassword] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [currentEmail, setCurrentEmail] = useState('');
  useEffect(() => {
    if (initialized.current) return; initialized.current = true;
    const value = window.location.hash.slice(1); setToken(value);
    // Keep the token in memory only after opening the link.
    window.history.replaceState(null, '', '/join');
    if (!value) { setError('Open the complete invitation link shared by your workspace owner.'); return; }
    void fetch('/api/team/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'inspect', token: value }) }).then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setInvite(data); }).catch(cause => setError(cause.message));
    void fetch('/api/auth').then(async response => { if (response.ok) { const data = await response.json(); setCurrentEmail(data.user.email); } }).catch(() => {});
  }, []);
  const join = async (event: FormEvent) => {
    event.preventDefault(); if (!invite) return; setBusy(true); setError('');
    try {
      const response = await fetch('/api/team/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accept', token, email: invite.email, password }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error); window.location.assign('/');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Joining failed. Try again.'); setBusy(false); }
  };
  const mismatch = currentEmail && invite && currentEmail !== invite.email;
  return <main className="pc-app team-join-shell"><section className="team-join"><h1>{invite ? `Join ${invite.organizationName}` : 'Join your workspace'}</h1>{error && <p role="alert" className="pc-error-text">{error}</p>}{!invite && !error && <p role="status">Checking your invitation…</p>}{invite && <><p>You’re invited with <strong>{invite.role}</strong> access. This link works once and expires {new Date(invite.expiresAt).toLocaleString()}.</p>{mismatch ? <><p>You’re signed in as {currentEmail}. This invitation is for {invite.email}.</p><button className="pc-button" disabled={busy} onClick={async () => { setBusy(true); try { const response = await fetch('/api/auth', { method: 'DELETE' }); if (!response.ok) throw new Error('Sign-out failed. Try again.'); setCurrentEmail(''); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign-out failed.'); } finally { setBusy(false); } }}>Sign out to continue</button></> : <form onSubmit={join}><label>Invited email<input className="pc-input" value={invite.email} readOnly autoComplete="email"/></label>{!currentEmail && <label>Password<input className="pc-input" type="password" autoComplete="current-password" required minLength={8} maxLength={128} value={password} onChange={event => setPassword(event.target.value)}/><span className="pc-muted">New here? Choose a password. Returning? Use your existing password.</span></label>}<button className="pc-button" disabled={busy}>{busy ? 'Joining…' : 'Accept invitation & join'}</button></form>}</>}<p><a href="/">Back to workspace</a></p></section></main>;
}

