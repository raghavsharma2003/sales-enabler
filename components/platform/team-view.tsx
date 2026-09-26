'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, UserPlus } from 'lucide-react';
import type { TeamRole, TeamSnapshot } from '../../lib/team/contracts';
import '../../app/team.css';

const roles: TeamRole[] = ['viewer', 'operator', 'owner'];
export function TeamView({ user }: { user: { id: string; email: string; role?: TeamRole } }) {
  const [team, setTeam] = useState<TeamSnapshot | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(''), [role, setRole] = useState<TeamRole>('operator'), [link, setLink] = useState(''), [copied, setCopied] = useState(false), [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<{ action: 'remove' | 'revoke'; id: string; label: string } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch('/api/team', { cache: 'no-store' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Team access could not be loaded.'); setTeam(data);
  }, []);
  useEffect(() => { void load().catch(cause => setError(cause.message)); }, [load]);
  const mutate = async (body: Record<string, unknown>) => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Team access could not be updated.');
      if (data.inviteUrl) { setLink(data.inviteUrl); setEmail(''); setCopied(false); }
      if (body.action === 'revoke') setLink('');
      setConfirmation(null); setNotice(body.action === 'invite' ? 'Invitation created. Copy the link below and share it with the invited person.' : 'Team access updated.');
      if (body.userId === user.id && (body.action === 'remove' || body.role !== 'owner')) { window.location.reload(); return; }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Team access could not be updated.'); }
    finally { setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void mutate({ action: 'invite', email, role }); };
  const owner = team?.role === 'owner';
  const ownerCount = team?.members.filter(member => member.role === 'owner' && member.status === 'active').length || 0;
  return <main className="pc-page team-page"><header className="pc-pagehead"><div><h1>Team & access</h1><p className="pc-muted">Give each person the access they need to work in this company.</p></div><span className="pc-badge">Your role: {team?.role || user.role || 'Loading…'}</span></header>
    {error && <p role="alert" className="pc-error-text">{error} {!team && <button className="pc-button quiet" onClick={() => void load().catch(cause => setError(cause.message))}>Try again</button>}</p>}
    {notice && <p role="status" className="team-notice">{notice}</p>}
    <section className="team-roles" aria-label="Role permissions"><p><strong>Owner</strong> manages the company, integrations and team access.</p><p><strong>Operator</strong> works with company data, campaigns, calls and follow-ups.</p><p><strong>Viewer</strong> reads workspace data without making changes or running AI.</p></section>
    {owner && <section className="pc-panel team-invite"><h2>Invite a teammate</h2><p className="pc-muted">Links expire after 72 hours and work once, for the exact invited email. Share the link yourself; no email is sent automatically.</p><form onSubmit={submit} className="team-invite-form"><label>Email address<input className="pc-input" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="teammate@company.com"/></label><label>Role<select className="pc-input" value={role} onChange={event => setRole(event.target.value as TeamRole)}>{roles.map(value => <option key={value} value={value}>{value[0].toUpperCase() + value.slice(1)}</option>)}</select></label><button className="pc-button" disabled={busy}><UserPlus size={15}/>{busy ? 'Saving…' : 'Create invitation'}</button></form>
      {link && <div className="team-link"><label>Invitation link — available only in this view<input className="pc-input" readOnly value={link} onFocus={event => event.target.select()}/></label><button className="pc-button quiet" type="button" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setError('Copy was blocked. Select the link and copy it manually.'); } }}><Copy size={15}/>{copied ? 'Copied' : 'Copy link'}</button><button className="pc-button quiet" type="button" onClick={() => setLink('')}>Dismiss link</button></div>}
    </section>}
    {!team ? <p role="status">Loading team access…</p> : <><section className="team-section"><h2>Members</h2><div className="team-list">{team.members.map(member => { const lastOwner = member.role === 'owner' && member.status === 'active' && ownerCount === 1; return <div className="team-row" key={member.userId}><div className="team-person"><strong>{member.email}{member.userId === user.id ? ' (you)' : ''}</strong><span className="pc-muted">{member.status === 'active' ? 'Active member' : 'Access removed'}{lastOwner ? ' · Last owner' : ''}</span></div><span className="pc-badge">{member.role}</span>{owner && member.status === 'active' && <div className="team-actions"><label className="team-role-label"><span className="team-sr">Role for {member.email}</span><select className="pc-input" aria-label={`Role for ${member.email}`} disabled={busy || lastOwner} value={member.role} onChange={event => void mutate({ action: 'role', userId: member.userId, role: event.target.value })}>{roles.map(value => <option key={value} value={value}>{value}</option>)}</select></label><button className="pc-button quiet" disabled={busy || lastOwner} onClick={() => setConfirmation({ action: 'remove', id: member.userId, label: member.email })}>Remove</button></div>}</div>; })}</div></section>
    {owner && <section className="team-section"><h2>Invitations</h2>{!team.invitations.length ? <p className="pc-muted">No invitations yet. Create one above to bring someone into this workspace.</p> : <div className="team-list">{team.invitations.map(invite => <div className="team-row" key={invite.id}><div className="team-person"><strong>{invite.email}</strong><span className="pc-muted">{invite.role} · {invite.status === 'pending' ? `Expires ${new Date(invite.expiresAt).toLocaleString()}` : invite.status}</span></div><span className="pc-badge">{invite.status}</span>{invite.status === 'pending' && <button className="pc-button quiet" disabled={busy} onClick={() => setConfirmation({ action: 'revoke', id: invite.id, label: invite.email })}>Revoke</button>}</div>)}</div>}</section>}</>}
    {confirmation && <section className="team-confirm" role="alert" aria-label="Confirm access change"><strong>{confirmation.action === 'remove' ? 'Remove access' : 'Revoke invitation'} for {confirmation.label}?</strong><p>{confirmation.action === 'remove' ? 'Their sessions will end immediately. An owner can invite them again later.' : 'This invitation link will stop working immediately.'}</p><div className="team-actions"><button className="pc-button" disabled={busy} onClick={() => void mutate({ action: confirmation.action, ...(confirmation.action === 'remove' ? { userId: confirmation.id } : { id: confirmation.id }) })}>{confirmation.action === 'remove' ? 'Remove access' : 'Revoke invitation'}</button><button className="pc-button quiet" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</button></div></section>}
  </main>;
}
