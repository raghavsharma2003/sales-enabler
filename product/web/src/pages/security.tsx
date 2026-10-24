// Settings > Security: single sign-on (OpenID Connect), provisioning tokens (SCIM-lite) and the signed activity-log export.
// Owners see and change everything. Compliance leads test the connection, read the token list, and export. Everyone else sees a read-only
// single sign-on summary. Every control a role cannot use says why. Every change is one tool; the A2 ones open the approval sheet.
import { useState } from 'react';
import { AlertTriangle, Check, Download, ShieldCheck, X } from 'lucide-react';
import { ApiError, run, ssoStart } from '../api.ts';
import { useApp, useData } from '../store.tsx';
import { Async, Btn, Card, CardHead, Chip, Empty, Locked, SelectField, Sheet, Table, TextField, Toggle, type Col } from '../ui.tsx';
import { CopyBtn, RevealSheet } from '../reveal.tsx';
import { memberList } from '../data.ts';
import { ago, count, date } from '../format.ts';
import type { Member } from '../types.ts';

// ---------- shared ----------
const IST = 'Asia/Kolkata';
const istDay = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: IST });
const longDate = (iso: string | Date) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST });
const ROLE_NAME: Record<string, string> = { owner: 'Owner', builder: 'Builder', operator: 'Operator', compliance: 'Compliance', viewer: 'Viewer' };
const NEW_PERSON_ROLES: [string, string][] = [['viewer', 'Sees everything with phone numbers hidden'], ['operator', 'Runs campaigns and watches calls'], ['builder', 'Builds agents and campaigns'], ['compliance', 'Policy, suppression and data requests']];
const who = (m: Member) => `${m.name || m.email} (${m.email})`;

export default function Security() {
  const members = useData<Member[]>('security-members', memberList);
  return (
    <div className="stack">
      <Sso members={members.data ?? []} />
      <Provisioning />
      <ActivityExport members={members.data ?? []} />
    </div>
  );
}

function LockedCard({ title, sub, reason }: { title: string; sub: string; reason: string }) {
  return <Card className="locked-card"><CardHead title={title} sub={sub} actions={<Locked role="owner">{reason}</Locked>} /></Card>;
}

// ---------- single sign-on ----------
interface SsoOff { configured: false }
interface SsoOn { configured: true; issuer: string; clientId: string; hasClientSecret: boolean; allowedDomains: string[]; defaultRole: string; emailVerified: 'required' | 'not_required'; enabled: boolean;
  ssoRequired: boolean; breakGlassMemberId: string | null; version: number; updatedAt: string; discoveryUrl: string; redirectUri: string | null }
type SsoCfg = SsoOff | SsoOn;
interface SsoTest { issuer: string; ok: boolean; checks: { name: string; ok: boolean; detail: string }[]; endpoints?: { authorization: string; token: string; jwks: string } }

const ISSUER = /^https:\/\/[^\s/]+[^\s]*$/;
const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const parseDomains = (s: string) => [...new Set(s.split(/[\s,;]+/).map(x => x.trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];

function Sso({ members }: { members: Member[] }) {
  const { can } = useApp();
  const owner = can(['owner']), reviewer = can(['owner', 'compliance']);
  const q = useData<SsoCfg>('sso', () => run<SsoCfg>('sso.config.get', {}));
  const chips = (c: SsoCfg) => !c.configured ? <Chip>Not set up</Chip> : <span className="row" style={{ gap: 6 }}><Chip tone={c.enabled ? 'leaf' : 'marigold'}>{c.enabled ? 'On' : 'Switched off'}</Chip>{c.ssoRequired && <Chip tone="peacock" icon={<ShieldCheck size={13} aria-hidden />}>Required for everyone</Chip>}</span>;
  return (
    <>
      <Card><CardHead title="Single sign-on" sub="Sign in with your company's identity provider (OpenID Connect): Entra ID, Okta or Google Workspace." actions={q.data ? chips(q.data) : undefined} />
        <Async q={q} what="Single sign-on" tool="sso.config.get">{c => owner ? <SsoForm key={c.configured ? c.version : 'new'} cfg={c} onSaved={q.reload} /> : <SsoSummary cfg={c} members={members} reviewer={reviewer} />}</Async>
      </Card>
      {owner && q.data?.configured && <RequireCard cfg={q.data} members={members} onChanged={q.reload} />}
    </>
  );
}

function RedirectUri({ cfg }: { cfg: SsoCfg }) {
  const { me } = useApp();
  const server = cfg.configured ? cfg.redirectUri : null;
  const uri = server ?? `${location.origin}/v1/sso/callback/${me?.workspace.id ?? ''}`;
  return (
    <div className="callout">
      <div className="grow"><p className="callout-l">Redirect URI</p><code className="uri">{uri}</code>
        <p className="hint">Register exactly this address in your identity provider when you create the application for Vyakti, and allow the openid, email and profile scopes.{!server && (cfg.configured ? ' The server does not know its public address, so this is taken from the address of this page. Check that it is the address people use.' : ' It is shown from the address of this page and is confirmed once you save.')}</p></div>
      <CopyBtn text={uri} what="redirect URI" />
    </div>
  );
}

/** Owners (and anyone who signed in another way) link their own account to the identity provider while signed in. */
function LinkAccount() {
  const { me } = useApp();
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true); setErr(null);
    try { await ssoStart(me!.workspace.id); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
  };
  return (
    <div className="stack-s">
      <div className="row"><Btn busy={busy} onClick={go}>Link my account to single sign-on</Btn>
        <span className="small muted">Takes you to your identity provider and back. Owners can link only this way.</span></div>
      {err && <p className="hint hint-bad" role="alert">{err}</p>}
    </div>
  );
}

function TestResult({ t }: { t: SsoTest }) {
  let host = t.issuer; try { host = new URL(t.issuer).host; } catch { /* keep the text */ }
  return (
    <div className="stack-s">
      <div className={`notice ${t.ok ? 'notice-ok' : 'notice-bad'}`}>
        {t.ok ? <Check size={20} aria-hidden /> : <AlertTriangle size={20} aria-hidden />}
        <div><strong>{t.ok ? 'The connection works.' : 'The connection test found a problem.'}</strong>
          <p className="small">{t.ok ? `Vyakti read the settings and signing keys published by ${host}. No one was signed in.` : `Vyakti tried ${host}. Fix what failed below, then test again. No one was signed in.`}</p></div>
      </div>
      <ul className="conn-checks" aria-label="Connection checks">{t.checks.map(c => (
        <li key={c.name}><Chip tone={c.ok ? 'leaf' : 'brick'} icon={c.ok ? <Check size={13} aria-hidden /> : <X size={13} aria-hidden />}>{c.ok ? 'Passed' : 'Failed'}</Chip>
          <div><strong>{c.name}</strong><p className="small muted">{c.detail}</p></div></li>))}</ul>
      {t.endpoints && <dl className="kv small"><div><dt>Sign-in page</dt><dd><code>{t.endpoints.authorization}</code></dd></div><div><dt>Token exchange</dt><dd><code>{t.endpoints.token}</code></dd></div><div><dt>Signing keys</dt><dd><code>{t.endpoints.jwks}</code></dd></div></dl>}
    </div>
  );
}

/** Test connection: one tool, owner or compliance. With nothing typed it tests the saved issuer. */
function TestConnection({ issuer, canTest, hasSaved }: { issuer?: string; canTest: boolean; hasSaved: boolean }) {
  const { act } = useApp();
  const [busy, setBusy] = useState(false); const [res, setRes] = useState<SsoTest | null>(null);
  const typed = issuer && ISSUER.test(issuer.trim()) ? issuer.trim() : null;
  const test = async () => { setBusy(true); setRes(null); const r = await act<SsoTest>('sso.test', typed ? { issuer: typed } : {}, { quiet: true }); setBusy(false); if (r.ok) setRes(r.result); };
  return (
    <div className="stack-s">
      <div className="row">{!canTest ? <Btn disabled fix={null} reason="Only an owner or compliance lead can test the connection.">Test connection</Btn>
        : !typed && !hasSaved ? <Btn disabled fix={null} reason="Enter the issuer address first.">Test connection</Btn>
        : <Btn busy={busy} onClick={test}>Test connection</Btn>}
        <span className="small muted">Reads your provider's settings and signing keys. It does not sign anyone in.</span></div>
      <div aria-live="polite">{res && <TestResult t={res} />}</div>
    </div>
  );
}

function SsoForm({ cfg, onSaved }: { cfg: SsoCfg; onSaved: () => void }) {
  const { act } = useApp();
  const saved = cfg.configured ? cfg : null;
  const init = { issuer: saved?.issuer ?? '', clientId: saved?.clientId ?? '', domains: (saved?.allowedDomains ?? []).join(', '), role: saved?.defaultRole ?? 'viewer', emailVerified: saved?.emailVerified ?? 'required', enabled: saved?.enabled ?? true };
  const [v, setV] = useState(init); const [secret, setSecret] = useState(''); const [busy, setBusy] = useState(false);
  const domains = parseDomains(v.domains), badDomains = domains.filter(d => !DOMAIN.test(d));
  const issuerBad = v.issuer.trim() !== '' && !ISSUER.test(v.issuer.trim());
  const dirty = JSON.stringify(v) !== JSON.stringify(init) || secret !== '';
  const problem = !v.issuer.trim() ? 'Enter the issuer address.' : issuerBad ? 'The issuer address must start with https://.' : !v.clientId.trim() ? 'Enter the client ID.'
    : !saved?.hasClientSecret && !secret ? 'Enter the client secret. The first save needs it.' : domains.length === 0 ? 'Enter at least one email domain.' : badDomains.length ? `Check these domains: ${badDomains.join(', ')}.` : null;
  const set = <K extends keyof typeof init>(k: K, x: (typeof init)[K]) => setV(p => ({ ...p, [k]: x }));
  const save = async () => {
    setBusy(true);
    try {
      let stashId: string | undefined;
      if (secret) { const s = await act<{ stashId: string }>('sso.secret.stage', { clientSecret: secret }, { quiet: true }); if (!s.ok) return; stashId = s.result.stashId; }
      const r = await act('sso.config.set', { issuer: v.issuer.trim(), clientId: v.clientId.trim(), ...(stashId ? { stashId } : {}), allowedDomains: domains, defaultRole: v.role, emailVerified: v.emailVerified, enabled: v.enabled }, { describe: 'Single sign-on settings saved.' });
      if (r.ok) { setSecret(''); onSaved(); }
    } finally { setBusy(false); }
  };
  return (
    <div className="stack">
      <RedirectUri cfg={cfg} />
      <hr className="rule" style={{ margin: 0 }} />
      <div className="formgrid">
        <TextField className="span2" label="Issuer address" value={v.issuer} onChange={e => { set('issuer', e.target.value); }} inputMode="url" autoComplete="off" spellCheck={false}
          placeholder="For example: https://login.example-idp.test" error={issuerBad ? 'The issuer address must start with https://.' : null}
          hint="Copy it exactly as your provider publishes it. Anything different, even a trailing slash, makes sign-in fail." />
        <dl className="kv small span2 issuers" aria-label="Provider formats">
          <div><dt>Microsoft Entra ID</dt><dd><code>https://login.microsoftonline.com/&lt;tenant-id&gt;/v2.0</code></dd></div>
          <div><dt>Okta</dt><dd><code>https://&lt;org&gt;.okta.com</code> (or the address of an authorization server)</dd></div>
          <div><dt>Google Workspace</dt><dd><code>https://accounts.google.com</code></dd></div>
        </dl>
        <TextField label="Client ID" value={v.clientId} onChange={e => set('clientId', e.target.value)} autoComplete="off" spellCheck={false} />
        <TextField label="Client secret" type="password" value={secret} onChange={e => setSecret(e.target.value)} autoComplete="new-password" spellCheck={false}
          placeholder={saved?.hasClientSecret ? 'Saved. Leave empty to keep it.' : ''} hint="Stored encrypted and never shown again. Enter a new one only to replace it." />
        <TextField className="span2" label="Allowed email domains" value={v.domains} onChange={e => set('domains', e.target.value)} autoComplete="off" spellCheck={false} placeholder="For example: saanjh.example"
          error={badDomains.length ? `Check these domains: ${badDomains.join(', ')}.` : null} hint="Separate several with commas. Only people with an address at one of these domains can sign in, and each domain can belong to one workspace." />
        <SelectField label="Role for new people" value={v.role} onChange={e => set('role', e.target.value)} hint={`Given the first time someone signs in and is not in Team yet. Never Owner. ${NEW_PERSON_ROLES.find(r => r[0] === v.role)?.[1] ?? ''}.`}>
          {NEW_PERSON_ROLES.map(([id]) => <option key={id} value={id}>{ROLE_NAME[id]}</option>)}</SelectField>
        <SelectField label="Email verification" value={v.emailVerified} onChange={e => set('emailVerified', e.target.value as 'required' | 'not_required')}
          hint={v.emailVerified === 'required' ? 'Recommended. The provider must confirm the email address before Vyakti links a sign-in to a person.' : 'Only for providers, such as some Entra ID setups, that never send an email-verified claim. Use it only when you control every account at the provider.'}>
          <option value="required">Required</option><option value="not_required">Not required</option></SelectField>
      </div>
      {saved?.ssoRequired ? <p className="small muted">Single sign-on is required, so it cannot be switched off. Allow passwords again below first.</p>
        : <Toggle checked={v.enabled} onChange={on => set('enabled', on)} label="Allow sign-in with single sign-on" hint="Turn this off to keep the settings but stop single sign-on sign-ins. It applies when you save." />}
      <div className="row">
        {problem ? <Btn kind="primary" disabled fix={null} reason={problem}>Ask to save</Btn> : !dirty ? <Btn kind="primary" disabled fix={null} reason="No unsaved changes.">Ask to save</Btn> : <Btn kind="primary" busy={busy} onClick={save}>Ask to save</Btn>}
        {dirty && <Chip tone="marigold">Unsaved</Chip>}
        <span className="small muted">Saving is a policy change and asks for approval.</span>
      </div>
      <hr className="rule" style={{ margin: 0 }} />
      <TestConnection key={v.issuer} issuer={v.issuer} canTest hasSaved={!!saved} />
      {saved?.enabled && <><hr className="rule" style={{ margin: 0 }} /><LinkAccount /></>}
    </div>
  );
}

function SsoSummary({ cfg, members, reviewer }: { cfg: SsoCfg; members: Member[]; reviewer: boolean }) {
  if (!cfg.configured) return <div className="stack"><Empty title="Single sign-on is not set up" body="People sign in with a password. An owner can connect your identity provider here." /></div>;
  const bg = members.find(m => m.id === cfg.breakGlassMemberId);
  return (
    <div className="stack">
      <dl className="kv">
        <div><dt>Status</dt><dd><Chip tone={cfg.enabled ? 'leaf' : 'marigold'}>{cfg.enabled ? 'On' : 'Switched off'}</Chip></dd></div>
        <div><dt>Required for everyone</dt><dd>{cfg.ssoRequired ? 'Yes. Passwords work only for the break-glass owner.' : 'No. Passwords still work.'}</dd></div>
        <div><dt>Issuer address</dt><dd><code>{cfg.issuer}</code></dd></div>
        <div><dt>Client ID</dt><dd><code>{cfg.clientId}</code></dd></div>
        <div><dt>Client secret</dt><dd>{cfg.hasClientSecret ? 'Saved (hidden)' : 'Not set'}</dd></div>
        <div><dt>Allowed email domains</dt><dd>{cfg.allowedDomains.join(', ')}</dd></div>
        <div><dt>Role for new people</dt><dd>{ROLE_NAME[cfg.defaultRole] ?? cfg.defaultRole}</dd></div>
        <div><dt>Email verification</dt><dd>{cfg.emailVerified === 'required' ? 'Required' : 'Not required'}</dd></div>
        {cfg.ssoRequired && <div><dt>Break-glass owner</dt><dd>{bg ? who(bg) : 'Not shown'}</dd></div>}
        <div><dt>Last changed</dt><dd>{date(cfg.updatedAt, true)}</dd></div>
      </dl>
      {reviewer && <RedirectUri cfg={cfg} />}
      <TestConnection canTest={reviewer} hasSaved />
      {cfg.enabled && <LinkAccount />}
      <Locked role="owner">Only an owner can change these settings.</Locked>
    </div>
  );
}

function RequireCard({ cfg, members, onChanged }: { cfg: SsoOn; members: Member[]; onChanged: () => void }) {
  const { act } = useApp();
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const bg = members.find(m => m.id === cfg.breakGlassMemberId);
  const allow = async () => {
    setBusy(true);
    try { const r = await act('sso.required.set', { required: false }, { describe: 'Passwords work again alongside single sign-on.' }); if (r.ok) onChanged(); } finally { setBusy(false); }
  };
  return (
    <Card><CardHead title="Require single sign-on" sub="Turns password sign-in off for everyone except one break-glass owner. Do this once single sign-on works for your team." actions={<Chip tone={cfg.ssoRequired ? 'peacock' : 'neutral'}>{cfg.ssoRequired ? 'Required' : 'Not required'}</Chip>} />
      {cfg.ssoRequired ? (
        <div className="stack">
          <dl className="kv"><div><dt>Break-glass owner</dt><dd>{bg ? who(bg) : 'An owner'}</dd></div></dl>
          <p className="small muted">Every password sign-in by the break-glass owner is recorded in the activity log. Everyone else lost their password when this was turned on. Allowing passwords again does not restore them.</p>
          <div><Btn busy={busy} onClick={allow}>Allow passwords again</Btn></div>
        </div>
      ) : (
        <div className="stack">
          <p className="muted">Anyone with a password can still sign in. Test the connection and sign in once with single sign-on yourself before you require it.</p>
          <div>{!cfg.enabled ? <Btn disabled fix={null} reason="Switch single sign-on on and save first.">Require single sign-on…</Btn> : <Btn kind="primary" onClick={() => setOpen(true)}>Require single sign-on…</Btn>}</div>
        </div>
      )}
      {open && <RequireSheet members={members} onClose={() => setOpen(false)} onDone={() => { setOpen(false); onChanged(); }} />}
    </Card>
  );
}

function RequireSheet({ members, onClose, onDone }: { members: Member[]; onClose: () => void; onDone: () => void }) {
  const { act, me, toast } = useApp();
  const owners = members.filter(m => m.role === 'owner' && m.status === 'active');
  const [pick, setPick] = useState(owners.find(m => m.id === me?.member?.id)?.id ?? owners[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const itsMe = pick !== '' && pick === me?.member?.id;
  const go = async () => {
    setBusy(true);
    try {
      const r = await act<{ endedSessions: number; passwordsCleared?: number }>('sso.required.set', { required: true, breakGlassMemberId: pick }, { quiet: true });
      if (r.ok) { const n = r.result.endedSessions, c = r.result.passwordsCleared;
        toast(`Single sign-on is now required. ${typeof c === 'number' ? `${c === 1 ? '1 person lost their password' : `${count(c)} people lost their password`}. ` : ''}${n === 1 ? '1 password session' : `${count(n)} password sessions`} ended.`, 'ok'); onDone(); }
    } finally { setBusy(false); }
  };
  return (
    <Sheet title="Require single sign-on" onClose={onClose}>
      <SelectField label="Break-glass owner" value={pick} onChange={e => setPick(e.target.value)} data-autofocus
        hint="The one account that can still sign in with a password if your identity provider is down. It needs a password set. Every one of its sign-ins is recorded in the activity log.">
        {owners.length === 0 && <option value="">No active owner</option>}
        {owners.map(m => <option key={m.id} value={m.id}>{who(m)}</option>)}</SelectField>
      <div className="notice notice-warn"><AlertTriangle size={20} aria-hidden /><div><strong>What happens when you turn this on</strong>
        <ul className="plainlist small">
          <li>Everyone except the break-glass owner loses their password and must use single sign-on. Passwords are not restored if you later make single sign-on optional.</li>
          <li>Other password sessions end at once{itsMe ? '. Yours stays, because you are the break-glass owner' : ', including yours if you signed in with a password. You would sign in again with single sign-on'}.</li>
          <li>People already signed in with single sign-on are not affected.</li>
          <li>People you invite sign in with single sign-on too.</li>
        </ul></div></div>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        {pick ? <Btn kind="primary" busy={busy} onClick={go}>Ask to require</Btn> : <Btn disabled fix={null} reason="Choose an active owner as the break-glass account.">Ask to require</Btn>}
      </div>
    </Sheet>
  );
}

// ---------- provisioning tokens ----------
interface Token { id: string; name: string; prefix: string; scopes: string[]; createdAt: string; rotatedAt: string | null; lastUsedAt: string | null; revokedAt: string | null }
const SCOPE_LABEL: Record<string, string> = { 'members:read': 'List people', 'members:write': 'Add and deactivate people', 'roles:write': 'Change roles' };
const scopeLabel = (s: string) => SCOPE_LABEL[s] ?? s;
interface Revealed { token: string; baseUrl: string; title: string; note?: string }

function Provisioning() {
  const { act, can, toast } = useApp();
  const owner = can(['owner']), reviewer = can(['owner', 'compliance']);
  const q = useData<{ tokens: Token[]; scopes: string[] }>('scim', reviewer ? () => run('scim.token.list', {}) : null);
  const [name, setName] = useState(''); const [scopes, setScopes] = useState<string[]>([]); const [shown, setShown] = useState<Revealed | null>(null); const [busy, setBusy] = useState(false);
  if (!reviewer) return <LockedCard title="Provisioning tokens" sub="Let your identity provider or a script add, deactivate and re-role people." reason="Only an owner or compliance lead can see provisioning tokens." />;

  const reveal = async (revealId: string | undefined, title: string, note?: string) => {
    if (!revealId) { toast('The token was made but could not be shown. Rotate it to get a new one.', 'bad'); return; }
    try { const s = await run<{ token: string; baseUrl: string }>('secret.reveal', { revealId }); setShown({ token: s.token, baseUrl: s.baseUrl, title, note }); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not show the token.', 'bad'); }
  };
  const create = async () => {
    setBusy(true);
    try {
      const r = await act<{ revealId?: string }>('scim.token.create', { name: name.trim(), scopes }, { quiet: true });
      if (!r.ok) return;
      setName(''); setScopes([]); q.reload();
      await reveal(r.result.revealId, 'Copy your provisioning token now');
    } finally { setBusy(false); }
  };
  const rotate = async (t: Token) => {
    const r = await act<{ revealId?: string }>('scim.token.rotate', { id: t.id }, { quiet: true });
    if (!r.ok) return;
    q.reload();
    await reveal(r.result.revealId, 'Copy the new token now', `The old secret for "${t.name}" no longer works. Update whatever uses it.`);
  };
  const revoke = async (t: Token) => { const r = await act('scim.token.revoke', { id: t.id }, { describe: 'Token revoked. Anything using it has stopped.' }); if (r.ok) q.reload(); };
  const cols: Col<Token>[] = [
    { key: 'n', label: 'Name', primary: true, render: t => t.name },
    { key: 'p', label: 'Token', render: t => <code>vps_{t.prefix}…</code> },
    { key: 'c', label: 'May', render: t => <span className="small">{t.scopes.map(scopeLabel).join(', ')}</span> },
    { key: 'u', label: 'Last used', render: t => t.lastUsedAt ? ago(t.lastUsedAt) : 'Never' },
    { key: 's', label: 'State', render: t => <Chip tone={t.revokedAt ? 'brick' : 'leaf'}>{t.revokedAt ? 'Revoked' : 'Active'}</Chip> },
    { key: 'x', label: '', render: t => t.revokedAt ? null : <div className="row" style={{ gap: 8 }}>
      {owner ? <Btn size="sm" onClick={() => void rotate(t)}>Rotate…</Btn> : <Btn size="sm" disabled fix={null} reason="Only an owner can rotate a token.">Rotate</Btn>}
      <Btn size="sm" kind="danger" onClick={() => void revoke(t)}>Revoke…</Btn></div> },
  ];
  const toggle = (s: string) => setScopes(p => (p.includes(s) ? p.filter(x => x !== s) : [...p, s]));
  return (
    <>
      <Card><CardHead title="Provisioning tokens" sub="Let your identity provider or a script add, deactivate and re-role people. A token works only on the provisioning address: it cannot sign anyone in, call tools or approve anything." />
        <Async q={q} what="Provisioning tokens" tool="scim.token.list" empty={d => d.tokens.length === 0 ? <Empty title="No tokens yet" body="Create one when you connect your directory." /> : null}>{d => <Table caption="Provisioning tokens" cols={cols} rows={d.tokens} rowKey={t => t.id} />}</Async>
        <hr className="rule" />
        <h3>How to use a token</h3>
        <ul className="plainlist small" style={{ marginTop: 8 }}>
          <li>Send it with every request: <code>Authorization: Bearer &lt;token&gt;</code></li>
          <li><code>GET /v1/scim/members</code> lists people. <code>POST /v1/scim/members</code> adds one.</li>
          <li><code>PATCH /v1/scim/members/:id</code> with <code>{'{"active": false, "role": "viewer"}'}</code> deactivates or re-roles a person.</li>
          <li>A token can give the Builder, Operator or Viewer role. It cannot assign Compliance or Owner, and it cannot change owners or compliance members.</li>
          <li>Deactivating a person ends their sessions at once.</li>
        </ul></Card>
      <Card><CardHead title="New token" sub="Creating a token is a policy change. The secret is shown once." />
        {owner ? <>
          <TextField label="Name" value={name} onChange={e => setName(e.target.value)} placeholder="Entra ID provisioning" autoComplete="off" hint="So you can tell tokens apart later." />
          <fieldset className="chipset"><legend>What it may do</legend>{(q.data?.scopes ?? Object.keys(SCOPE_LABEL)).map(s => <label key={s} className={`choice${scopes.includes(s) ? ' on' : ''}`}><input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} />{scopeLabel(s)}</label>)}</fieldset>
          <div style={{ marginTop: 12 }}>{!name.trim() ? <Btn disabled fix={null} reason="Give the token a name.">Ask to create</Btn> : scopes.length === 0 ? <Btn disabled fix={null} reason="Choose at least one thing the token may do.">Ask to create</Btn> : <Btn kind="primary" busy={busy} onClick={create}>Ask to create</Btn>}</div>
        </> : <Locked role="owner">Only an owner can create or rotate tokens. You can revoke one above.</Locked>}</Card>
      {shown && <RevealSheet title={shown.title} secret={shown.token} onClose={() => setShown(null)} extra={<div className="stack-s">
        {shown.note && <p className="small">{shown.note}</p>}
        <div><span className="small muted">Provisioning address</span><code className="secret" style={{ marginTop: 4 }}>{location.origin + shown.baseUrl}</code></div>
        <div><CopyBtn text={location.origin + shown.baseUrl} what="provisioning address" label="Copy address" /></div></div>} />}
    </>
  );
}

// ---------- activity-log export ----------
interface ExportRow { id: string; format: 'csv' | 'jsonl'; filters: { from: string; to: string; actionPrefix: string | null; actorId: string | null; privilegedOnly: boolean; retainedDays: number }; rows: number; sha256: string; signature: string; createdAt: string; expiresAt: string; downloadable: boolean }
interface Made { exportId: string; format: 'csv' | 'jsonl'; rows: number; sha256: string; expiresAt: string; download: string }
interface Verdict { valid: boolean; known: boolean; signatureOk: boolean; checksumMatches: boolean }
const FORMAT_NAME = { csv: 'CSV', jsonl: 'JSONL' } as const;
const AREAS: [string, string][] = [['', 'All activity'], ['auth.', 'Sign-ins'], ['sso.', 'Single sign-on settings'], ['scim.', 'Provisioning'], ['member.', 'People and roles'], ['apikey.', 'API keys'],
  ['wallet.', 'Money'], ['policy.', 'Policies'], ['campaign.', 'Campaigns'], ['audit.', 'Exports of this log']];
const areaName = (p: string) => AREAS.find(a => a[0] === p)?.[1] ?? 'One area';
const short = (h: string) => `${h.slice(0, 12)}…${h.slice(-4)}`;

function rangeText(f: ExportRow['filters']): string {
  const end = new Date(new Date(f.to).getTime() - 1);   // `to` is the exclusive end of the last day
  const a = new Date(f.from), sameYear = a.toLocaleDateString('en-IN', { year: 'numeric', timeZone: IST }) === end.toLocaleDateString('en-IN', { year: 'numeric', timeZone: IST });
  return `${sameYear ? a.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: IST }) : longDate(a)} to ${longDate(end)}`;
}
function filterText(f: ExportRow['filters']): string {
  return [f.privilegedOnly ? 'Privileged actions only' : '', f.actionPrefix ? areaName(f.actionPrefix) : '', f.actorId ? 'One person' : ''].filter(Boolean).join(' · ');
}

function ActivityExport({ members }: { members: Member[] }) {
  const { act, can } = useApp();
  const reviewer = can(['owner', 'compliance']);
  const q = useData<{ exports: ExportRow[] }>('exports', reviewer ? () => run('audit.export.list', {}) : null);
  const [f, setF] = useState({ format: 'csv' as 'csv' | 'jsonl', from: istDay(Date.now() - 30 * 86400000), to: istDay(Date.now()), area: '', actor: '', privileged: false });
  const [busy, setBusy] = useState(false); const [made, setMade] = useState<Made | null>(null);
  if (!reviewer) return <LockedCard title="Export the activity log" sub="A signed file of who did what, for your auditors." reason="Only an owner or compliance lead can export the activity log." />;

  const days = (Date.parse(f.to) - Date.parse(f.from)) / 86400000 + 1;
  const problem = !f.from || !f.to ? 'Choose the first and last day.' : Date.parse(f.to) < Date.parse(f.from) ? 'The last day must not be before the first day.' : days > 366 ? 'Export at most 366 days at a time.' : null;
  const request = async () => {
    setBusy(true); setMade(null);
    try {
      const r = await act<Made>('audit.export', { format: f.format, from: f.from, to: f.to, ...(f.area ? { actionPrefix: f.area } : {}), ...(f.actor ? { actorId: f.actor } : {}), ...(f.privileged ? { privilegedOnly: true } : {}) }, { quiet: true });
      if (r.ok) { setMade(r.result); q.reload(); }
    } finally { setBusy(false); }
  };
  const cols: Col<ExportRow>[] = [
    { key: 'c', label: 'Made', primary: true, render: e => <span style={{ whiteSpace: 'nowrap' }}>{date(e.createdAt, true).replace(' IST', '')}</span> },
    { key: 'r', label: 'Covers', render: e => <>{rangeText(e.filters)}<br /><span className="small muted">{[FORMAT_NAME[e.format], `${count(e.rows)} ${e.rows === 1 ? 'row' : 'rows'}`, filterText(e.filters)].filter(Boolean).join(' · ')}</span></> },
    { key: 'h', label: 'SHA-256', render: e => <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><code className="hash" title={e.sha256}>{short(e.sha256)}</code><CopyBtn size="sm" text={e.sha256} what="checksum" label="Copy" /></span> },
    { key: 'd', label: 'File', render: e => e.downloadable ? <a className="btn btn-sm" href={`/v1/audit/exports/${e.id}`} download aria-label={`Download the ${FORMAT_NAME[e.format]} file made ${date(e.createdAt, true)}`}><Download size={16} aria-hidden /><span>Download</span></a>
      : <Chip title="Files are held for 24 hours. Export again for a new one.">No longer held</Chip> },
  ];
  return (
    <>
      <Card><CardHead title="Export the activity log" sub="A signed file of who did what and when, for your auditors. Asking is a policy change and needs approval." />
        <div className="formgrid">
          <SelectField label="Format" value={f.format} onChange={e => setF({ ...f, format: e.target.value as 'csv' | 'jsonl' })}><option value="csv">CSV (opens in a spreadsheet)</option><option value="jsonl">JSONL (one record per line)</option></SelectField>
          <SelectField label="Area" value={f.area} onChange={e => setF({ ...f, area: e.target.value })}>{AREAS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</SelectField>
          <TextField label="First day" type="date" value={f.from} max={f.to || undefined} onChange={e => setF({ ...f, from: e.target.value })} hint="India time." />
          <TextField label="Last day" type="date" value={f.to} min={f.from || undefined} onChange={e => setF({ ...f, to: e.target.value })} hint="Included. Up to 366 days." />
          <SelectField label="Person" value={f.actor} onChange={e => setF({ ...f, actor: e.target.value })}><option value="">Anyone</option>{members.map(m => <option key={m.id} value={m.id}>{who(m)}</option>)}</SelectField>
          <fieldset className="chipset" style={{ margin: 0, alignSelf: 'end' }}><legend className="sr">Which actions</legend>
            <label className={`choice${f.privileged ? ' on' : ''}`}><input type="checkbox" checked={f.privileged} onChange={e => setF({ ...f, privileged: e.target.checked })} />Privileged actions only</label></fieldset>
        </div>
        <p className="hint">Privileged means identity, access, keys, money, policies and approvals.</p>
        <div className="row" style={{ marginTop: 12 }}>{problem ? <Btn kind="primary" disabled fix={null} reason={problem}>Ask to export</Btn> : <Btn kind="primary" busy={busy} onClick={request}>Ask to export</Btn>}</div>
        <ul className="plainlist small muted" style={{ marginTop: 12 }}>
          <li>A file is held for 24 hours. Export again if you need it later.</li>
          <li>Each download is recorded in the activity log.</li>
          <li>Spreadsheet cells that could run as a formula are escaped, so opening a file never runs anything someone typed.</li>
        </ul>
        <div aria-live="polite">{made && (
          <div className="notice notice-ok" style={{ marginTop: 12 }}><Check size={20} aria-hidden />
            <div className="stack-s"><strong>Your export is ready.</strong>
              <p className="small">{made.rows === 0 ? 'Nothing matched, so the file is empty.' : `${count(made.rows)} ${made.rows === 1 ? 'row' : 'rows'} in ${FORMAT_NAME[made.format]}.`} Held until {date(made.expiresAt, true)}.</p>
              <p className="small">SHA-256 <code className="hash" title={made.sha256}>{short(made.sha256)}</code></p>
              <div className="row"><a className="btn btn-primary btn-sm" href={made.download} download><Download size={16} aria-hidden /><span>Download</span></a><CopyBtn size="sm" text={made.sha256} what="checksum" /></div></div></div>)}</div>
      </Card>
      <Card><CardHead title="Recent exports" sub="Each file carries a SHA-256 checksum that Vyakti signed, so you can show a file has not been changed." />
        <Async q={q} what="Exports" tool="audit.export.list" empty={d => d.exports.length === 0 ? <Empty title="No exports yet" body="Ask for one above. It appears here once it is approved." /> : null}>{d => <>
          <Table caption="Recent exports of the activity log" cols={cols} rows={d.exports} rowKey={e => e.id} />
          <hr className="rule" /><VerifyFile exports={d.exports} /></>}</Async></Card>
    </>
  );
}

/** Hash the chosen file in the browser (it is never uploaded) and ask the server whether that checksum is the one it signed. */
function VerifyFile({ exports: list }: { exports: ExportRow[] }) {
  const { act, toast } = useApp();
  const [file, setFile] = useState<{ name: string; hash: string } | null>(null); const [pick, setPick] = useState(list[0]?.id ?? ''); const [busy, setBusy] = useState(false); const [out, setOut] = useState<Verdict | null>(null);
  const choose = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files?.[0]; setOut(null); if (!fl) { setFile(null); return; }
    if (!globalThis.crypto?.subtle) { toast('This browser cannot check files. Use a current browser on a secure connection.', 'bad'); return; }
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await fl.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
    setFile({ name: fl.name, hash }); const match = list.find(x => x.sha256 === hash); if (match) setPick(match.id);
  };
  const chosen = list.find(x => x.id === pick);
  const verify = async () => { if (!file || !chosen) return; setBusy(true); const r = await act<Verdict>('audit.export.verify', { exportId: chosen.id, sha256: file.hash, signature: chosen.signature }, { quiet: true }); setBusy(false); if (r.ok) setOut(r.result); };
  return (
    <div className="stack-s">
      <h3>Check a downloaded file</h3>
      <p className="small muted">Choose the file you downloaded. Its checksum is worked out in your browser; the file is not uploaded.</p>
      <div className="formgrid">
        <div className="field"><label htmlFor="verify-file">File</label><input id="verify-file" className="input" type="file" accept=".csv,.jsonl,text/csv,application/x-ndjson" onChange={e => void choose(e)} />{file && <p className="hint">{file.name}: <code className="hash">{short(file.hash)}</code></p>}</div>
        <SelectField label="Compare with" value={pick} onChange={e => { setPick(e.target.value); setOut(null); }} hint="Picked for you when the checksum matches an export.">{list.map(x => <option key={x.id} value={x.id}>{date(x.createdAt, true)} · {FORMAT_NAME[x.format]} · {count(x.rows)} rows</option>)}</SelectField>
      </div>
      <div>{file && chosen ? <Btn busy={busy} onClick={verify}>Check this file</Btn> : <Btn disabled fix={null} reason="Choose the downloaded file first.">Check this file</Btn>}</div>
      <div aria-live="polite">{out && (out.valid
        ? <div className="notice notice-ok"><Check size={20} aria-hidden /><p>This file is exactly what Vyakti exported. Its checksum matches and the signature is genuine.</p></div>
        : <div className="notice notice-bad"><AlertTriangle size={20} aria-hidden /><p>{!out.known ? 'Vyakti has no record of that export.' : !out.checksumMatches ? 'This file is not the one Vyakti exported. Its checksum is different. It may have been edited, or opened and saved again in another program.' : 'The signature recorded for that export is not valid, so the checksum cannot be trusted.'}</p></div>)}</div>
    </div>
  );
}
