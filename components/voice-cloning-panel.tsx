"use client";
import { useEffect, useState } from 'react';

type Clone = { id: string; label: string; locale: string; status: string; providerStatus: string | null; createdAt: string };
type Listing = { setup: { configured: boolean; reason: string; companyName: string }; previewSetup: { configured: boolean; reason: string }; clones: Clone[] };

export function VoiceCloningPanel() {
  const [listing, setListing] = useState<Listing | null>(null);
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [locale, setLocale] = useState('en-US');
  const [consent, setConsent] = useState<File | null>(null);
  const [sample, setSample] = useState<File | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [azureConsent, setAzureConsent] = useState(false);
  const [charges, setCharges] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewText, setPreviewText] = useState('Hello, this is an AI-generated voice preview.');
  const [previewUrl, setPreviewUrl] = useState('');
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  async function load() {
    const response = await fetch('/api/voice/clones', { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load enrollments.');
    setListing(data);
    setCompanyName(current => current || data.setup?.companyName || '');
  }
  useEffect(() => { void load().catch(cause => setError(cause instanceof Error ? cause.message : 'Could not load enrollments.')); }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!consent || !sample || busy) return;
    setBusy('upload'); setError(''); setNotice('');
    const body = new FormData();
    body.set('label', name); body.set('companyName', companyName); body.set('locale', locale); body.set('consent', consent); body.set('sample', sample);
    body.set('speakerAuthorized', String(authorized)); body.set('azureConsent', String(azureConsent)); body.set('trainingCostAcknowledged', String(charges));
    try {
      const response = await fetch('/api/voice/clones', { method: 'POST', body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Enrollment could not be submitted. Refresh to check for a pending record before trying again.');
      setNotice('Consent submitted to Azure. Refresh its status to continue profile creation.');
      setConsent(null); setSample(null); setAuthorized(false); setAzureConsent(false); setCharges(false);
      const form = event.currentTarget; if (form?.isConnected) form.reset();
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Enrollment failed.'); await load().catch(() => {}); }
    finally { setBusy(''); }
  }
  async function act(id: string, method: 'POST' | 'DELETE') {
    setBusy(id); setError(''); setNotice('');
    if (method === 'DELETE') setPreviewUrl('');
    try {
      const response = await fetch(`/api/voice/clones/${encodeURIComponent(id)}`, { method });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Azure did not confirm this request.');
      setNotice(method === 'DELETE' ? 'Azure profile and provider consent deleted.' : result.status === 'ready' ? 'Profile ready in Azure. It is not connected to browser calls.' : 'Status updated. Azure may still be processing.');
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Request failed.'); await load().catch(() => {}); }
    finally { setBusy(''); }
  }
  async function preview(id: string) {
    setBusy(id); setError(''); setNotice('');
    try {
      const response = await fetch(`/api/voice/clones/${encodeURIComponent(id)}/preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: previewText }) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Could not synthesize this preview.'); }
      setPreviewUrl(URL.createObjectURL(await response.blob()));
      setNotice('Azure Speech generated this personal voice sample. Browser calls still use their configured voice.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not preview this voice.'); }
    finally { setBusy(''); }
  }
  return <section className="pc-card" aria-label="Personal Voice enrollment">
    <h3>Personal Voice enrollment</h3>
    <p>Enroll a speaker with their own spoken Azure consent and clean speech sample. Azure processes biometric voice data. A ready profile can generate Speech previews after setup. Using it in browser calls requires a separate Voice Live integration.</p>
    {!listing && !error && <p role="status">Checking Azure Speech setup…</p>}
    {listing && !listing.setup.configured && <p role="status" className="wb-setup">Setup required: {listing.setup.reason}</p>}
    {listing?.setup.configured && !listing.previewSetup.configured && <p role="status" className="wb-setup">Speech preview unavailable: {listing.previewSetup.reason} Resolve preview setup before uploading if you need to hear the enrolled voice.</p>}
    {listing?.setup.configured && <form onSubmit={event => void submit(event)}>
      <label className="pc-field">Speaker’s legal name<input className="pc-input" required maxLength={64} value={name} onChange={event => setName(event.target.value)}/></label>
      <label className="pc-field">Company name spoken in consent<input className="pc-input" required maxLength={80} value={companyName} onChange={event => setCompanyName(event.target.value)}/></label>
      <label className="pc-field">Consent and sample locale<input className="pc-input" required value={locale} onChange={event => setLocale(event.target.value)} placeholder="en-US"/></label>
      <label className="pc-field">Azure verbal consent WAV (5–90 seconds)<input required type="file" accept=".wav,audio/wav,audio/x-wav" onChange={event => setConsent(event.target.files?.[0] || null)}/></label>
      <p><a href="https://learn.microsoft.com/en-us/azure/ai-services/speech-service/personal-voice-create-consent" target="_blank" rel="noreferrer">Get Microsoft’s required consent statement and recording instructions</a>. Use the script for your recording language and the exact speaker and company names entered above.</p>
      <label className="pc-field">Same speaker’s clean WAV sample (30–90 seconds)<input required type="file" accept=".wav,audio/wav,audio/x-wav" onChange={event => setSample(event.target.files?.[0] || null)}/></label>
      <p>Record Microsoft’s current consent statement with the exact name and company configured for this Speech project. Both files must be 24 kHz, 16-bit, mono PCM WAV and at most 10 MiB each.</p>
      <label className="wb-consent"><input type="checkbox" checked={authorized} onChange={event => setAuthorized(event.target.checked)}/>The named speaker authorized creating, using, and deleting this biometric voice profile.</label>
      <label className="wb-consent"><input type="checkbox" checked={azureConsent} onChange={event => setAzureConsent(event.target.checked)}/>The consent recording contains the speaker’s own Azure verbal statement, and the sample is from the same person.</label>
      <label className="wb-consent"><input type="checkbox" checked={charges} onChange={event => setCharges(event.target.checked)}/>I understand Azure may charge for profile training and hosting on the configured Speech resource.</label>
      <button className="pc-button primary" disabled={!!busy || !authorized || !azureConsent || !charges || !consent || !sample}> {busy === 'upload' ? 'Submitting…' : 'Submit consent to Azure'}</button>
    </form>}
    {error && <p className="wb-error" role="alert">{error}</p>}{notice && <p role="status" className="wb-inline-note">{notice}</p>}
    {!!listing?.clones.length && <div><h4>My enrollments</h4>{listing.clones.map(item => <div key={item.id} className="wb-provider"><div><strong>{item.label}</strong><span> · {item.locale} · {item.status.replaceAll('_', ' ')}{item.providerStatus ? ` (${item.providerStatus})` : ''}</span></div><div>
      {['consent_pending', 'profile_pending', 'ready'].includes(item.status) && <button type="button" className="pc-button" disabled={!!busy} onClick={() => void act(item.id, 'POST')}>Refresh status</button>}
      {item.status === 'ready' && <button type="button" className="pc-button" disabled={!!busy || !listing.previewSetup.configured || !previewText.trim()} onClick={() => void preview(item.id)}>Generate paid Speech preview</button>}
      {item.status !== 'revoked' && <button type="button" className="pc-button danger" disabled={!!busy} onClick={() => { if (window.confirm(`Revoke ${item.label} and delete their Azure voice and consent?`)) void act(item.id, 'DELETE'); }}>Revoke &amp; delete</button>}
    </div></div>)}{listing.clones.some(item => item.status === 'ready') && <><label className="pc-field">Speech preview text (up to 240 characters)<input className="pc-input" maxLength={240} value={previewText} onChange={event => setPreviewText(event.target.value)}/></label>{!listing.previewSetup.configured && <p role="status">Speech preview setup required: {listing.previewSetup.reason}</p>}</>}{previewUrl && <audio controls src={previewUrl} aria-label="Generated Personal Voice preview"/>}<p>“Ready” means Azure created a profile. It does not activate the cloned voice in this app’s Realtime calls. A “reconcile required” state never submits training again automatically; revoke it or have an operator inspect Azure first.</p></div>}
  </section>;
}
