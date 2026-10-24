// Settings → Integrations: connect an outside service from a form. The credentials are handed to the server in one call
// (integration.stage_secrets), cleared from this form at once, and never read back; connecting then only names the staged
// credentials, so the approval a person gives never contains them.
import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useApp, useData } from '../store.tsx';
import { run } from '../api.ts';
import { Async, Btn, Card, CardHead, Chip, Empty, Sheet, TextArea, TextField } from '../ui.tsx';
import { Link } from '../router.tsx';

/** What reads a kind's stored credentials today. Most kinds are stored and not used yet; the page says so plainly. */
const CONFIG_HINT: Record<string, string> = { instance_url: 'An https address on salesforce.com or force.com. Leave empty to sign in through login.salesforce.com.' };
const SET_UP: Record<string, [string, string]> = { slack: ['/settings/notifications', 'Notifications'], custom_http: ['/settings/webhooks', 'Webhooks'], hubspot: ['/contacts/import?from=hubspot', 'Import'], zoho_crm: ['/contacts/import?from=zoho_crm', 'Import'], salesforce: ['/contacts/import?from=salesforce', 'Import'], whatsapp_cloud: ['/settings/channels', 'Channels'] };
const InUse = ({ k }: { k: Kind | undefined }) => k?.usedBy ? <Chip tone="leaf">In use</Chip> : <Chip tone="marigold">Stored, not used yet</Chip>;

interface Kind { id: string; label: string; secrets: string[]; config: string[]; usedBy: string | null }
interface Connected { id: string; kind: string; name: string; status: string }

const FIELD_WORDS: Record<string, string> = {
  access_token: 'Access token', client_id: 'Client ID', client_secret: 'Client secret', refresh_token: 'Refresh token', service_account_json: 'Service account key (the whole file)',
  api_key: 'API key', api_token: 'API token', webhook_url: 'Webhook address', bearer_token: 'Bearer token',
  portal_id: 'Portal ID', datacenter: 'Data centre', instance_url: 'Instance address', calendar_id: 'Calendar ID', sheet_id: 'Sheet ID', phone_number_id: 'Phone number ID', app_secret: 'App secret (signs webhooks)', waba_id: 'WhatsApp Business Account ID', display_number: 'Display number',
  account_sid: 'Account SID', subdomain: 'Subdomain', base_url: 'Base address',
};
const word = (k: string) => FIELD_WORDS[k] ?? k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());

export default function Integrations() {
  const { act } = useApp();
  const q = useData('integrations', async () => ({
    list: (await run<{ integrations: Connected[] }>('integration.list', {})).integrations.filter(i => i.status === 'connected'),
    kinds: (await run<{ kinds: Kind[] }>('integration.kinds', {})).kinds,
  }));
  const [open, setOpen] = useState<Kind | null>(null);
  return <Async q={q} what="Integrations" tool="integration.list">{d => <div className="stack">
    <Card><CardHead title="Connected" />{d.list.length === 0
      ? <Empty title="Nothing connected" body="Connect Slack to get alerts in a channel, or your own HTTP service so webhooks can sign in to it. CRM, calendar and other connections can be stored, but nothing uses them yet." />
      : <ul className="billing">{d.list.map(i => <li key={i.id}><div><strong>{i.name}</strong> <Chip>{d.kinds.find(k => k.id === i.kind)?.label ?? 'Integration'}</Chip> <InUse k={d.kinds.find(k => k.id === i.kind)} /></div>
        <Btn size="sm" kind="danger" onClick={async () => { const r = await act('integration.disconnect', { id: i.id }, { describe: 'Disconnected. The stored credentials were erased.' }); if (r.ok) q.reload(); }}>Disconnect…</Btn></li>)}</ul>}</Card>
    <Card><CardHead title="What can be connected" sub="Credentials are encrypted, never shown again and cleared from this form as soon as they are sent. Connecting is a policy change, so it asks for approval. Those marked “In use” are read today: HubSpot, Zoho and Salesforce import contacts, Slack gets alerts, WhatsApp sends follow-ups and answers messages, and your own HTTP service signs webhooks in. The others are stored, and nothing reads them yet." />
      <ul className="billing">{d.kinds.map(k => <li key={k.id}><div><strong>{k.label}</strong> <InUse k={k} /><br /><span className="small muted">{k.usedBy ? <>{k.usedBy}.{SET_UP[k.id] && <> Set it up under <Link to={SET_UP[k.id][0]}>{SET_UP[k.id][1]}</Link>.</>}</> : <>Needs: {k.secrets.map(word).join(', ')}</>}</span></div>
        <Btn size="sm" aria-label={`Connect ${k.label}`} icon={<KeyRound size={14} aria-hidden />} onClick={() => setOpen(k)}>Connect</Btn></li>)}</ul></Card>
    {open && <ConnectForm kind={open} taken={d.list.map(i => i.name)} onClose={() => setOpen(null)} onDone={() => { setOpen(null); q.reload(); }} />}
  </div>}</Async>;
}

function ConnectForm({ kind, taken, onClose, onDone }: { kind: Kind; taken: string[]; onClose: () => void; onDone: () => void }) {
  const { act } = useApp();
  const [name, setName] = useState(kind.label);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const reason = !name.trim() ? 'Give the connection a name.' : taken.includes(name.trim()) ? 'A connection with this name already exists. Choose another name.' : kind.secrets.some(s => !(secrets[s] ?? '').trim()) ? 'Fill in every credential.' : '';
  const submit = async () => {
    setBusy(true);
    const staged = await act<{ stashId: string }>('integration.stage_secrets', { kind: kind.id, secrets: Object.fromEntries(kind.secrets.map(s => [s, secrets[s].trim()])) }, { quiet: true });
    setSecrets({});                                   // the values leave this form the moment they are sent, whatever happens next
    if (!staged.ok || !staged.result) { setBusy(false); return; }
    const cfg = Object.fromEntries(Object.entries(config).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
    const r = await act('integration.connect', { kind: kind.id, name: name.trim(), stashId: staged.result.stashId, ...(Object.keys(cfg).length ? { config: cfg } : {}) }, { describe: `${kind.label} is connected.` });
    setBusy(false);
    if (r.ok) onDone();
  };
  return (
    <Sheet title={`Connect ${kind.label}`} onClose={onClose} wide>
      <p className="muted">The credentials are sent to the server once and cleared from this form. They are not shown again, not even to you, and they are not part of the approval.</p>
      <div className="formgrid">
        <TextField label="Connection name" value={name} onChange={e => setName(e.target.value)} hint="How this connection is listed." data-autofocus />
        {kind.secrets.map(s => s === 'service_account_json'
          ? <TextArea key={s} className="span2" label={word(s)} value={secrets[s] ?? ''} onChange={e => setSecrets({ ...secrets, [s]: e.target.value })} autoComplete="off" spellCheck={false} rows={4} />
          : <TextField key={s} label={word(s)} type="password" autoComplete="off" value={secrets[s] ?? ''} onChange={e => setSecrets({ ...secrets, [s]: e.target.value })} />)}
        {kind.config.map(c => <TextField key={c} label={`${word(c)} (optional)`} value={config[c] ?? ''} onChange={e => setConfig({ ...config, [c]: e.target.value })} hint={CONFIG_HINT[c]} />)}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16 }}><Btn kind="ghost" onClick={onClose}>Cancel</Btn>
        {reason ? <Btn disabled fix={null} reason={reason}>Connect</Btn> : <Btn kind="primary" busy={busy} onClick={() => void submit()}>Connect</Btn>}</div>
    </Sheet>
  );
}
