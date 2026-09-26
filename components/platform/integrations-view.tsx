'use client';

import { CheckCircle2, Clipboard, Plug, ShieldAlert, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PlatformViewProps } from '../../lib/platform/contracts';
import { IntegrationCatalog, AiUsagePanel } from '../integration-catalog';

type VoiceConfig = { configured?: boolean; provider?: string | null; reason?: string; capabilities?: Record<string, boolean> };
type VoiceCheck = { ready: boolean; provider: 'azure'; model: string; status: string; message: string; checkedAt: string };
const envTemplate = `# Azure Realtime browser voice (server-side only)\nVOICE_PROVIDER=azure\nVOICE_TRANSPORT=webrtc\nAZURE_OPENAI_ENDPOINT=https://YOUR-RESOURCE.openai.azure.com/openai/v1\nAZURE_OPENAI_API_KEY=replace-with-a-server-secret\nAZURE_OPENAI_REALTIME_DEPLOYMENT=YOUR-REALTIME-DEPLOYMENT`;
const capabilityLabel: Record<string, string> = { browserAudio: 'Browser audio', transcription: 'Transcription', interruption: 'Interruption handling', toolExecution: 'Tool execution', telephony: 'Telephony', liveHumanTransfer: 'Live human transfer' };

export function IntegrationsView({ navigate }: PlatformViewProps) {
  const [config, setConfig] = useState<VoiceConfig | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<VoiceCheck | null>(null);
  const [checkError, setCheckError] = useState('');
  useEffect(() => { let active = true; fetch('/api/voice/config', { cache: 'no-store' }).then(async (response) => { if (!response.ok) throw new Error('Voice configuration could not be read.'); return response.json() as Promise<VoiceConfig>; }).then((value) => { if (active) setConfig(value); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Voice configuration could not be read.'); }); return () => { active = false; }; }, []);
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(envTemplate);
      else {
        const area = document.createElement('textarea'); area.value = envTemplate; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
      }
      setCopied(true); window.setTimeout(() => setCopied(false), 1800);
    } catch { setCopied(false); }
  };
  const checkConnection = async () => {
    setChecking(true); setCheck(null); setCheckError('');
    try {
      const response = await fetch('/api/voice/check', { method: 'POST', cache: 'no-store' });
      const value = await response.json() as VoiceCheck & { error?: string };
      if (!response.ok) throw new Error(value.error || 'Azure connection could not be checked.');
      setCheck(value);
    } catch (cause) { setCheckError(cause instanceof Error ? cause.message : 'Azure connection could not be checked.'); }
    finally { setChecking(false); }
  };
  return <main className="pc-page"><header className="pc-pagehead"><div><h1>Integrations</h1><p className="pc-muted">Connect company systems, check access, and turn incoming material into reviewed knowledge.</p></div></header><IntegrationCatalog navigate={navigate}/><details className="provider-details"><summary>Browser voice and server configuration</summary>
    <div className="pc-grid"><section className="pc-panel"><div className="pc-row"><Plug size={20}/><span><h2>Browser voice</h2><p className="pc-muted">Settings loaded from the server. A connection check verifies deployment access; only a browser call can verify speech.</p></span><span className="pc-badge">{config?.configured ? 'Settings present' : 'Settings incomplete'}</span></div>{error && <p className="pc-badge" role="alert">{error}</p>}{config?.provider && <p>Provider: <strong>{config.provider}</strong></p>}{config?.reason && <p className="pc-muted">{config.reason}</p>}{config?.provider === 'azure' && <div style={{ display: 'grid', gap: 10, marginBlock: 18 }}><button className="pc-button" type="button" disabled={checking} onClick={() => void checkConnection()}><RefreshCw size={15}/>{checking ? 'Checking Azure…' : 'Check connection'}</button>{check && <div role="status" className="pc-panel"><strong>{check.ready ? 'Azure session provisioning ready' : 'Azure connection needs attention'}</strong><p style={{ marginBottom: 0 }}>{check.message}</p><p className="pc-muted" style={{ marginBottom: 0 }}>Deployment: {check.model || 'Not set'}</p></div>}{checkError && <p role="alert">{checkError}</p>}</div>}<div className="pc-list">{Object.entries(config?.capabilities || {}).map(([key, enabled]) => <div className="pc-row" key={key}>{enabled ? <CheckCircle2 size={16}/> : <ShieldAlert size={16}/>}<span>{capabilityLabel[key] || key}</span><span className="pc-badge">{enabled ? 'Configured' : 'Unavailable'}</span></div>)}</div></section>
      <section className="pc-panel"><h2>Server setup</h2><p className="pc-muted">Keep credentials in local environment configuration. This Azure template does not include a real key. Use the exact deployment name from your Azure resource.</p><pre className="pc-panel" style={{ overflowX: 'auto', whiteSpace: 'pre-wrap' }}><code>{envTemplate}</code></pre><button className="pc-button quiet" type="button" onClick={copy}><Clipboard size={15}/> {copied ? 'Copied' : 'Copy env template'}</button></section></div>
    </details><AiUsagePanel/>
  </main>;
}
