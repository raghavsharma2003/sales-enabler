'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type CSSProperties, type FormEvent } from 'react';
import { BookOpen, Building2, Check, CircleAlert, ExternalLink, ImagePlus, LoaderCircle, Palette, ShieldCheck, Trash2 } from 'lucide-react';
import type { PlatformViewProps } from '../../lib/platform/contracts';
import { accentForeground, type CompanyProfileValues, type CompanySettingsSnapshot } from '../../lib/company/contracts';
import '../../app/company.css';

type Draft = CompanyProfileValues & { revision: number };
const MAX_LOGO_BYTES = 256 * 1024;

async function response<T>(request: Promise<Response>): Promise<T> {
  const result = await request, body = await result.json() as T & { error?: string };
  if (!result.ok) throw new Error(body.error || 'Company settings could not be updated.');
  return body;
}

function draftFor(snapshot: CompanySettingsSnapshot): Draft {
  const { id: _id, status: _status, createdAt: _createdAt, updatedAt: _updatedAt, ...profile } = snapshot.profile;
  return profile;
}
function languagesFrom(value: string): string[] { return value.split(',').map(item => item.trim()).filter(Boolean); }

export function CompanyView({ navigate, act }: PlatformViewProps) {
  const [snapshot, setSnapshot] = useState<CompanySettingsSnapshot | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [languagesInput, setLanguagesInput] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<'save' | 'brain' | ''>('');

  const load = useCallback(async () => {
    const data = await response<CompanySettingsSnapshot>(fetch('/api/company', { cache: 'no-store' }));
    setSnapshot(data); setDraft(draftFor(data)); setLanguagesInput(data.profile.languages.join(', '));
  }, []);
  useEffect(() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : 'Company settings could not be loaded.')); }, [load]);

  const changed = useMemo(() => Boolean(snapshot && draft && (JSON.stringify(draft) !== JSON.stringify(draftFor(snapshot)) || JSON.stringify(languagesFrom(languagesInput)) !== JSON.stringify(snapshot.profile.languages))), [draft, languagesInput, snapshot]);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft(current => current ? { ...current, [key]: value } : current);
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!draft) return;
    const languages = languagesFrom(languagesInput);
    if (languages.length < 1 || languages.length > 8) { setError('Choose between 1 and 8 company languages.'); return; }
    if (new Set(languages.map(value => value.toLocaleLowerCase())).size !== languages.length) { setError('Company languages must be unique.'); return; }
    setBusy('save'); setError(''); setNotice('');
    try {
      const saved = await response<CompanySettingsSnapshot>(fetch('/api/company', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, languages }) }));
      setSnapshot(saved); setDraft(draftFor(saved)); setLanguagesInput(saved.profile.languages.join(', ')); setNotice('Company settings saved.'); void act('workspace.refresh').catch(() => {});
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Company settings could not be saved.'); }
    finally { setBusy(''); }
  };
  const logo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_LOGO_BYTES) { setError('Choose a PNG, JPEG, or WebP logo up to 256 KB.'); return; }
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === 'string') { set('logoDataUri', reader.result); setError(''); } };
    reader.onerror = () => setError('The logo file could not be read.'); reader.readAsDataURL(file);
  };
  const addToBrain = async () => {
    if (!draft || !snapshot) return;
    setBusy('brain'); setError(''); setNotice('');
    try {
      const result = await response<{ sourceId: string; created: boolean; status: 'draft' | 'approved' | 'revoked' }>(fetch('/api/company', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_description_to_brain', revision: snapshot.profile.revision }) }));
      setNotice(result.created ? 'Description added as an unreviewed Company brain draft.' : `This profile revision already has a ${result.status} Company brain source.`);
      navigate('Company brain', result.sourceId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The Company brain draft could not be created.'); }
    finally { setBusy(''); }
  };

  if (!snapshot || !draft) return <main className="pc-page company-page"><header className="pc-pagehead"><div><h1>Company</h1><p className="pc-muted">Workspace identity, operating preferences, and public brand copy.</p></div></header>{error ? <div className="company-message error" role="alert"><CircleAlert size={16}/><span>{error}</span><button className="pc-button quiet" type="button" onClick={() => { setError(''); void load().catch(cause => setError(cause instanceof Error ? cause.message : 'Company settings could not be loaded.')); }}>Try again</button></div> : <div className="company-loading" role="status"><LoaderCircle className="spin" size={18}/> Loading company settings…</div>}</main>;
  const editable = snapshot.editable, onAccent = accentForeground(draft.brandAccent);
  return <main className="pc-page company-page">
    <header className="pc-pagehead company-heading"><div><h1>Company</h1><p className="pc-muted">Keep the workspace identity, operating preferences, and public brand copy in one owner-controlled record.</p></div><span className="pc-badge">{editable ? 'Owner settings' : `${snapshot.role} · read only`}</span></header>
    {!editable && <div className="company-permission" role="status"><ShieldCheck size={18}/><span><strong>Company settings are owner-controlled.</strong><small>You can review the current profile and readiness records. Ask a workspace owner to make changes.</small></span></div>}
    {error && <p className="company-message error" role="alert"><CircleAlert size={16}/>{error}</p>}
    {notice && <p className="company-message success" role="status"><Check size={16}/>{notice}</p>}

    <form className="company-layout" onSubmit={save}>
      <div className="company-settings-column">
        <section className="pc-panel company-section" aria-labelledby="company-identity-heading">
          <div className="company-section-head"><span className="company-section-icon"><Building2 size={17}/></span><div><h2 id="company-identity-heading">Company identity</h2><p>Name the workspace and record the founder-written description. This text is not treated as verified Company brain knowledge automatically.</p></div></div>
          <div className="company-fields two-column">
            <label className="pc-field">Workspace name<input className="pc-input" required maxLength={120} disabled={!editable} value={draft.name} onChange={event => set('name', event.target.value)}/><small>Used in private navigation and team workspace labels.</small></label>
            <label className="pc-field">Public display name<input className="pc-input" required maxLength={120} disabled={!editable} value={draft.publicDisplayName} onChange={event => set('publicDisplayName', event.target.value)}/><small>Available for an owner to copy into a public deployment.</small></label>
            <label className="pc-field">Website<input className="pc-input" type="url" inputMode="url" placeholder="https://company.example" maxLength={2048} disabled={!editable} value={draft.website} onChange={event => set('website', event.target.value)}/><small>HTTPS only. Relay stores the address and does not fetch it.</small></label>
            <label className="pc-field">Industry<input className="pc-input" placeholder="Education services" maxLength={120} disabled={!editable} value={draft.industry} onChange={event => set('industry', event.target.value)}/></label>
            <label className="pc-field company-wide">Company description<textarea className="pc-textarea" rows={6} maxLength={5000} disabled={!editable} value={draft.description} onChange={event => set('description', event.target.value)} placeholder="Describe what the company does, who it serves, and the value it provides."/><small>{draft.description.length}/5,000 · Founder-authored, unreviewed profile text.</small></label>
          </div>
          <div className="company-brain-action"><div><strong>Use this description in Company brain</strong><p>Create a separate draft with source attribution. A person must review and approve it before agents can use it.</p></div><button className="pc-button quiet" type="button" disabled={!editable || changed || !draft.description.trim() || busy !== ''} onClick={() => void addToBrain()}><BookOpen size={15}/>{busy === 'brain' ? 'Creating draft…' : 'Add to Company brain'}</button></div>
        </section>

        <section className="pc-panel company-section" aria-labelledby="company-preferences-heading">
          <div className="company-section-head"><span className="company-section-icon"><ShieldCheck size={17}/></span><div><h2 id="company-preferences-heading">Operating preferences</h2><p>These defaults guide dates and language choices. India, Asia/Kolkata, English, and Hindi are first-creation defaults and remain editable.</p></div></div>
          <div className="company-fields three-column">
            <label className="pc-field">Country<input className="pc-input" required maxLength={100} disabled={!editable} value={draft.country} onChange={event => set('country', event.target.value)}/></label>
            <label className="pc-field">Timezone<input className="pc-input" required maxLength={100} disabled={!editable} value={draft.timezone} onChange={event => set('timezone', event.target.value)} placeholder="Asia/Kolkata"/><small>IANA timezone</small></label>
            <label className="pc-field">Languages<input className="pc-input" required disabled={!editable} value={languagesInput} onChange={event => setLanguagesInput(event.target.value)} onBlur={() => { const parsed = languagesFrom(languagesInput); if (parsed.length >= 1 && parsed.length <= 8 && new Set(parsed.map(value => value.toLocaleLowerCase())).size === parsed.length) setLanguagesInput(parsed.join(', ')); }}/><small>Comma separated · up to 8</small></label>
          </div>
        </section>

        <section className="pc-panel company-section" aria-labelledby="company-brand-heading">
          <div className="company-section-head"><span className="company-section-icon"><Palette size={17}/></span><div><h2 id="company-brand-heading">Brand preview</h2><p>Preview the copy an owner may explicitly publish with a deployment. Saving a profile does not verify a brand or publish anything.</p></div></div>
          <div className="company-brand-grid">
            <div className="company-brand-controls"><label className="pc-field">Accent color<div className="company-color-field"><input type="color" aria-label="Choose brand accent" disabled={!editable} value={/^#[0-9a-f]{6}$/i.test(draft.brandAccent) ? draft.brandAccent : '#5148ce'} onChange={event => set('brandAccent', event.target.value)}/><input className="pc-input" required pattern="#[0-9A-Fa-f]{6}" maxLength={7} disabled={!editable} value={draft.brandAccent} onChange={event => set('brandAccent', event.target.value)}/></div><small>Preview text color is selected for readable contrast.</small></label>
              <div className="company-logo-control"><span>Company logo <small>Optional · PNG, JPEG, or WebP · 256 KB · 16–2,048 px</small></span><div>{editable && <label className="pc-button quiet company-file"><ImagePlus size={15}/>Choose image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={logo}/></label>}{editable && draft.logoDataUri && <button className="pc-button quiet" type="button" onClick={() => set('logoDataUri', undefined)}><Trash2 size={15}/>Remove</button>}</div></div>
            </div>
            <div className="company-brand-preview" style={{ '--company-accent': /^#[0-9a-f]{6}$/i.test(draft.brandAccent) ? draft.brandAccent : '#5148ce', '--company-on-accent': onAccent } as CSSProperties}>
              <span className="company-preview-label">Unverified workspace profile</span>
              <div className="company-preview-mark">{draft.logoDataUri ? <img src={draft.logoDataUri} alt="Company logo preview"/> : <span>{(draft.publicDisplayName || draft.name).slice(0, 2).toUpperCase()}</span>}</div>
              <div><h3>{draft.publicDisplayName || 'Public company name'}</h3><p>{draft.website || 'No public website recorded'}</p></div>
              <button type="button" tabIndex={-1}>Start a conversation</button>
              <small>Preview only · a deployment must copy public brand fields explicitly.</small>
            </div>
          </div>
        </section>
        {editable && <div className="company-savebar"><span>{changed ? 'Unsaved company changes' : `Saved revision ${snapshot.profile.revision}`}</span><button className="pc-button primary" type="submit" disabled={!changed || busy !== ''}>{busy === 'save' ? <><LoaderCircle className="spin" size={15}/>Saving…</> : 'Save company settings'}</button></div>}
      </div>

      <aside className="pc-panel company-readiness" aria-labelledby="company-readiness-heading"><div className="company-readiness-head"><h2 id="company-readiness-heading">What the records show</h2><span className="company-readiness-score">{snapshot.readiness.filter(item => item.state === 'ready').length}/{snapshot.readiness.length}</span></div><p className="pc-muted">This checklist reads saved workspace records. It does not inspect secret values, provider balances, or prove a production launch.</p><div className="company-checklist">{snapshot.readiness.map(item => <article key={item.id} data-state={item.state}><span className="company-check-icon">{item.state === 'ready' ? <Check size={14}/> : <CircleAlert size={14}/>}</span><div><strong>{item.label}</strong><p>{item.detail}</p><button type="button" onClick={() => navigate(item.target)}>{item.actionLabel}<ExternalLink size={12}/></button></div></article>)}</div></aside>
    </form>
  </main>;
}
