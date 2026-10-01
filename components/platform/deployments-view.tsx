'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Globe2,
  ImagePlus,
  MessageCircle,
  Mic2,
  Palette,
  Pause,
  Plus,
  RefreshCw,
  Rocket,
  Settings2,
  ShieldCheck,
  Square,
  Trash2,
} from 'lucide-react';
import { accentForeground, type CompanySettingsSnapshot } from '../../lib/company/contracts';
import type { ConnectionView } from '../../lib/integrations/vault';
import type { LearningJobStatus, LearningJobView } from '../../lib/learning-jobs/contracts';
import type { AgentConfig } from '../../lib/platform/agents';
import type { PlatformRecord, PlatformViewProps } from '../../lib/platform/contracts';
import {
  DEFAULT_DEPLOYMENT_LIMITS,
  PUBLICATION_ACKNOWLEDGEMENT,
  type Deployment,
  type DeploymentChannel,
  type DeploymentLimits,
} from '../../lib/deployments/contracts';
import { ChannelAgentPanel } from '../channel-agent-panel';

type DeploymentRecord = PlatformRecord<Deployment>;
type ActivationReceipt = {
  deploymentId: string;
  status: 'installed' | 'changed';
  webhookUrl: string;
  botUsername?: string;
  checkedAt: string;
  detail?: string;
};
type ChannelOverview = { activations?: ActivationReceipt[] };
type Draft = {
  name: string;
  releaseId: string;
  channel: DeploymentChannel;
  publicKnowledgeIds: string[];
  brandName: string;
  welcomeMessage: string;
  brandAccent: string;
  brandLogoDataUri: string;
  origins: string;
  allowUnknownInbound: boolean;
  autoLearning: boolean;
  limits: DeploymentLimits;
};

const channels: { value: DeploymentChannel; label: string; detail: string }[] = [
  { value: 'web_voice', label: 'Web voice', detail: 'Microphone voice with a Listen & type option.' },
  { value: 'web_chat', label: 'Web chat', detail: 'Text-only public conversation.' },
  { value: 'telegram', label: 'Telegram', detail: 'Private bot chats after webhook activation.' },
  { value: 'whatsapp', label: 'WhatsApp', detail: 'Private service conversations through a checked Meta connection.' },
];

const statusCopy: Record<string, string> = {
  draft: 'Saved for owner review. It is not publicly available.',
  published: 'Registry publication is recorded. Runtime availability also depends on enabled usage and any channel activation below.',
  paused: 'New public sessions are blocked until an owner publishes this snapshot again.',
  stopped: 'Permanently stopped. Create a replacement to publish again.',
};

function emptyDraft(company: string): Draft {
  return {
    name: '',
    releaseId: '',
    channel: 'web_voice',
    publicKnowledgeIds: [],
    brandName: company,
    welcomeMessage: `Hi, I’m an AI assistant for ${company}. How can I help?`,
    brandAccent: '',
    brandLogoDataUri: '',
    origins: '',
    allowUnknownInbound: false,
    autoLearning: false,
    limits: { ...DEFAULT_DEPLOYMENT_LIMITS },
  };
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const value = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(value.error || 'The deployment action could not be completed.');
  return value;
}

function displayTime(value?: string) {
  return value ? new Date(value).toLocaleString() : 'Not recorded';
}

function channelName(value: DeploymentChannel) {
  return channels.find(channel => channel.value === value)?.label || value;
}

function sourceTitle(record?: PlatformRecord) {
  return String(record?.data.title || record?.data.name || 'Untitled source');
}

function htmlAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function parseOrigins(value: string): string[] {
  const origins = value.split(/[\n,]/).map(item => item.trim()).filter(Boolean);
  return [...new Set(origins.map(origin => {
    let url: URL;
    try { url = new URL(origin); } catch { throw new Error(`“${origin}” is not a complete origin.`); }
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.origin !== origin || (!local && url.protocol !== 'https:') || url.username || url.password) {
      throw new Error('Use exact HTTPS origins without paths. HTTP is allowed only for localhost or loopback testing.');
    }
    return url.origin;
  }))];
}

function StatusBadge({ status }: { status: string }) {
  return <span className="deploy-status" data-status={status}><span />{status}</span>;
}

export function DeploymentsView({ records, workspace, act, navigate, focusId }: PlatformViewProps) {
  const owner = (workspace.user.role || 'owner') === 'owner';
  const [deployments, setDeployments] = useState<DeploymentRecord[]>([]);
  const [connections, setConnections] = useState<ConnectionView[]>([]);
  const [activations, setActivations] = useState<ActivationReceipt[]>([]);
  const [selectedId, setSelectedId] = useState(focusId?.startsWith('release:') ? '' : focusId || '');
  const [loaded, setLoaded] = useState(false);
  const appliedReleaseFocus = useRef('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(() => emptyDraft(workspace.organization.name));
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [replaceWebhook, setReplaceWebhook] = useState(false);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    const [deploymentResult, integrationResult, channelResult] = await Promise.allSettled([
      api<{ deployments: DeploymentRecord[] }>('/api/deployments'),
      api<{ connections: ConnectionView[] }>('/api/integrations'),
      workspace.user.role === 'viewer' ? Promise.resolve({ activations: [] } as ChannelOverview) : api<ChannelOverview>('/api/channels'),
    ]);
    if (deploymentResult.status === 'fulfilled') {
      const next = deploymentResult.value.deployments.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setDeployments(next);
      setLoaded(true);
      setSelectedId(current => current && next.some(item => item.id === current) ? current : next[0]?.id || '');
    } else throw deploymentResult.reason;
    if (integrationResult.status === 'fulfilled') setConnections(integrationResult.value.connections || []);
    if (channelResult.status === 'fulfilled') setActivations(channelResult.value.activations || []);
  }, [workspace.user.role]);

  useEffect(() => {
    let active = true;
    void load().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Deployments could not be loaded.'); });
    return () => { active = false; };
  }, [load]);

  useEffect(() => {
    if (typeof window !== 'undefined') setDraft(current => current.origins ? current : ({ ...current, origins: window.location.origin }));
  }, []);

  const selected = deployments.find(item => item.id === selectedId);
  const agents = records.filter(record => record.kind === 'agent_definition');
  const versions = records.filter(record => record.kind === 'agent_version');
  const runs = records.filter(record => record.kind === 'test_run');
  const releases = records.filter(record => record.kind === 'release' && record.status === 'active');
  const sources = records.filter(record => record.kind === 'brain_source' && record.status === 'approved');
  const eligible = useMemo(() => releases.filter(release => {
    const version = versions.find(item => item.id === release.data.versionId);
    const test = runs.find(item => item.id === release.data.testRunId);
    const config = version?.data.config as AgentConfig | undefined;
    return release.data.channel === 'browser' && !!version && test?.data.passed === true && test.data.mode === 'configuration' && test.data.versionId === version.id && config?.voiceProfile !== 'maya-despina';
  }), [releases, runs, versions]);
  const chosenRelease = eligible.find(release => release.id === draft.releaseId) || eligible[0];
  useEffect(() => {
    if (!loaded || !owner || !focusId?.startsWith('release:') || appliedReleaseFocus.current === focusId) return;
    const releaseId = focusId.slice('release:'.length);
    if (!eligible.some(release => release.id === releaseId)) return;
    appliedReleaseFocus.current = focusId;
    setCreating(true); setSelectedId(''); setAcknowledged(false); setError(''); setNotice('');
    setDraft(current => ({ ...emptyDraft(workspace.organization.name), releaseId, origins: current.origins || (typeof window !== 'undefined' ? window.location.origin : '') }));
  }, [focusId, loaded, owner, eligible, workspace.organization.name]);
  const chosenVersion = versions.find(version => version.id === chosenRelease?.data.versionId);
  const chosenConfig = chosenVersion?.data.config as AgentConfig | undefined;
  const versionSources = sources.filter(source => chosenConfig?.knowledgeIds?.includes(source.id));
  const selectedVersion = versions.find(version => version.id === selected?.data.versionId);
  const selectedConfig = selectedVersion?.data.config as AgentConfig | undefined;
  const selectedAgent = agents.find(agent => agent.id === selected?.data.agentId);
  const selectedActivation = activations.find(item => item.deploymentId === selected?.id);
  const webChannel = (selected?.data.channel || draft.channel).startsWith('web_');
  const connectionId = (draft.channel === 'telegram' || draft.channel === 'whatsapp') ? (draft.channel === 'telegram' ? 'telegram' : 'whatsapp_cloud') : '';
  const draftConnection = connections.find(connection => connection.integrationId === connectionId);
  const checkedIdentity = draft.channel === 'telegram'
    ? draftConnection?.settings.username || draftConnection?.settings.botUsername || draftConnection?.settings.botId
    : draftConnection?.settings.verifiedName || draftConnection?.settings.displayPhoneNumber || draftConnection?.settings.phoneNumberId;
  const connectionReady = !connectionId || (draftConnection?.status === 'connected' && !!draftConnection.checkedAt && !!checkedIdentity);

  useEffect(() => {
    if (!draft.releaseId && eligible[0]) setDraft(current => current.releaseId ? current : ({ ...current, releaseId: eligible[0].id }));
  }, [draft.releaseId, eligible]);

  useEffect(() => {
    setDraft(current => ({ ...current, publicKnowledgeIds: current.publicKnowledgeIds.filter(id => versionSources.some(source => source.id === id)) }));
  }, [chosenVersion?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async (key: string, value: string) => {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const area = document.createElement('textarea'); area.value = value; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
      }
      setCopied(key); window.setTimeout(() => setCopied(''), 1600);
    } catch { setError('Copy failed. Select the text and copy it manually.'); }
  };

  const mutate = async (body: Record<string, unknown>, success: string) => {
    setPending(String(body.action)); setError(''); setNotice('');
    try {
      const result = await api<{ deployment: DeploymentRecord }>('/api/deployments', { method: 'POST', body: JSON.stringify(body) });
      await Promise.all([load(), act('workspace.refresh')]);
      setSelectedId(result.deployment.id); setCreating(false); setAcknowledged(false); setNotice(success);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The deployment action failed.'); }
    finally { setPending(''); }
  };

  const create = async () => {
    if (!owner || !chosenRelease || !chosenVersion || !chosenConfig) return;
    setError('');
    try {
      const origins = draft.channel.startsWith('web_') ? parseOrigins(draft.origins) : [];
      if (!draft.name.trim()) throw new Error('Name this deployment.');
      if (!draft.brandName.trim() || !draft.welcomeMessage.trim()) throw new Error('Add the public brand name and welcome message.');
      if (draft.brandAccent && !/^#[0-9a-f]{6}$/i.test(draft.brandAccent)) throw new Error('Use a six-digit public accent such as #5148ce, or clear it to use the Relay default.');
      if (draft.channel.startsWith('web_') && (origins.length < 1 || origins.length > 10)) throw new Error('Add one to ten exact web origins.');
      if (!draft.limits.enabled) throw new Error('Explicitly enable public usage limits before saving this draft.');
      if (!connectionReady) throw new Error(`Check the ${draft.channel === 'telegram' ? 'Telegram' : 'WhatsApp'} connection and verified identity in Integrations first.`);
      await mutate({
        action: 'create', name: draft.name.trim(), agentId: chosenRelease.data.agentId,
        versionId: chosenVersion.id, releaseId: chosenRelease.id, channel: draft.channel,
        publicKnowledgeIds: draft.publicKnowledgeIds,
        brand: {
          name: draft.brandName.trim(), welcomeMessage: draft.welcomeMessage.trim(),
          ...(draft.brandAccent ? { accent: draft.brandAccent.toLowerCase() } : {}),
          ...(draft.brandLogoDataUri ? { logoDataUri: draft.brandLogoDataUri } : {}),
        },
        allowedOrigins: origins, limits: draft.limits,
        allowUnknownInbound: !draft.channel.startsWith('web_') && draft.allowUnknownInbound,
        autoLearning: draft.autoLearning,
      }, 'Draft saved. Review the exact public snapshot before publishing.');
      setDraft(emptyDraft(workspace.organization.name));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The deployment draft is incomplete.'); }
  };

  const transition = async (action: 'publish' | 'pause' | 'stop') => {
    if (!selected || !owner) return;
    if (action === 'stop' && !window.confirm('Permanently stop this deployment? Its public ID cannot be published again.')) return;
    await mutate({ action, deploymentId: selected.id, revision: selected.revision, ...(action === 'publish' ? { publicationAcknowledgement: acknowledged ? PUBLICATION_ACKNOWLEDGEMENT : '' } : {}) },
      action === 'publish' ? 'Deployment published to the registry. Complete the channel activation step if one is shown.' : action === 'pause' ? 'Deployment paused. New public sessions are blocked.' : 'Deployment permanently stopped.');
  };

  const activateTelegram = async () => {
    if (!selected || selected.data.channel !== 'telegram' || !owner) return;
    setPending('activate'); setError(''); setNotice('');
    try {
      await api<{ webhookUrl: string; botUsername?: string }>('/api/channels', { method: 'POST', body: JSON.stringify({ action: 'activateTelegram', deploymentId: selected.id, acknowledgeReplace: replaceWebhook }) });
      await load();
      setNotice('Telegram confirmed the webhook installation. Changes made later in Telegram are not monitored automatically.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Telegram activation failed.'); }
    finally { setPending(''); }
  };

  const begin = () => {
    setCreating(true); setSelectedId(''); setError(''); setNotice(''); setAcknowledged(false);
    setDraft(current => ({ ...emptyDraft(workspace.organization.name), origins: current.origins || (typeof window !== 'undefined' ? window.location.origin : '') }));
  };

  return <main className="pc-page deploy-page">
    <header className="pc-pagehead deploy-pagehead"><div><h1>Deployments</h1><p className="pc-muted">Publish one tested agent snapshot to one public channel, with explicit knowledge and usage boundaries.</p></div>{owner && <button className="pc-button primary" type="button" onClick={begin}><Plus size={16}/> New deployment</button>}</header>
    {!owner && <p className="deploy-role-note" role="status"><ShieldCheck size={16}/><span><strong>Read-only deployment access.</strong> Only a workspace owner can create, publish, pause, stop, or activate a public channel.</span></p>}
    {error && <p className="deploy-feedback is-error" role="alert"><AlertCircle size={16}/>{error}</p>}
    {notice && <p className="deploy-feedback is-notice" role="status"><CheckCircle2 size={16}/>{notice}</p>}

    <div className="deploy-layout">
      <aside className="deploy-registry" aria-label="Deployment registry">
        <div className="deploy-registry-head"><div><h2>Registry</h2><p>{deployments.length} saved</p></div><button className="pc-iconbutton" type="button" aria-label="Refresh deployments" disabled={!!pending} onClick={() => void load().catch(cause => setError(cause instanceof Error ? cause.message : 'Refresh failed.'))}><RefreshCw size={15}/></button></div>
        {owner && <button className={`deploy-new-row ${creating ? 'is-current' : ''}`} type="button" onClick={begin}><Plus size={16}/><span><strong>New deployment</strong><small>Choose a release and channel</small></span></button>}
        <div className="deploy-records">{deployments.map(deployment => <button key={deployment.id} type="button" className="deploy-record" aria-current={!creating && selectedId === deployment.id ? 'true' : undefined} onClick={() => { setCreating(false); setSelectedId(deployment.id); setAcknowledged(false); setError(''); setNotice(''); }}><span className="deploy-record-top"><strong>{deployment.data.name}</strong><StatusBadge status={deployment.status}/></span><small>{channelName(deployment.data.channel)} · {deployment.data.brand.name}</small><time>{displayTime(deployment.updatedAt)}</time></button>)}</div>
        {!deployments.length && !owner && <p className="pc-empty">No deployments have been saved.</p>}
      </aside>

      <section className="deploy-workspace">
        {creating ? <DraftEditor
          draft={draft} setDraft={setDraft} eligible={eligible} versions={versions} agents={agents}
          chosenRelease={chosenRelease} chosenVersion={chosenVersion} chosenConfig={chosenConfig}
          versionSources={versionSources} connection={draftConnection} checkedIdentity={checkedIdentity}
          connectionReady={connectionReady} pending={pending} navigate={navigate} onCreate={() => void create()}
        /> : selected ? <DeploymentReview
          deployment={selected} agent={selectedAgent} version={selectedVersion} config={selectedConfig}
          sources={sources} connections={connections} activation={selectedActivation} owner={owner}
          acknowledged={acknowledged} setAcknowledged={setAcknowledged} pending={pending}
          replaceWebhook={replaceWebhook} setReplaceWebhook={setReplaceWebhook}
          onTransition={transition} onActivateTelegram={activateTelegram} navigate={navigate}
          copied={copied} copy={copy}
        /> : <StartState owner={owner} records={records} navigate={navigate} begin={begin}/>} 
      </section>
    </div>

    {workspace.user.role !== 'viewer' && deployments.some(item => item.data.channel === 'telegram' || item.data.channel === 'whatsapp') && <ChannelAgentPanel readOnly={!owner}/>} 
  </main>;
}

function StartState({ owner, records, navigate, begin }: { owner: boolean; records: PlatformRecord[]; navigate: PlatformViewProps['navigate']; begin: () => void }) {
  const hasAgent = records.some(record => record.kind === 'agent_definition');
  const hasVersion = records.some(record => record.kind === 'agent_version');
  const hasTest = records.some(record => record.kind === 'test_run' && record.data.passed === true);
  const hasRelease = records.some(record => record.kind === 'release' && record.status === 'active');
  const steps = [
    { done: hasAgent && hasVersion, title: 'Prepare an agent version', detail: 'Write the public-safe prompt and capture an immutable version.', target: 'Agents' },
    { done: hasTest, title: 'Pass configuration checks', detail: 'Verify AI disclosure, language, instructions, and current knowledge authority.', target: 'Test lab' },
    { done: hasRelease, title: 'Publish a browser release', detail: 'A deployment binds to the exact tested active release.', target: 'Releases' },
  ];
  return <div className="deploy-start"><div className="deploy-start-copy"><Globe2 size={28}/><h2>Prepare a public channel</h2><p>A deployment is a separate public boundary around one tested release. It never includes customer memories, GroupAI context, connection secrets, or unselected company sources.</p></div><ol className="deploy-prerequisites">{steps.map((step, index) => <li key={step.title} data-done={step.done}><span>{step.done ? <Check size={15}/> : index + 1}</span><div><strong>{step.title}</strong><p>{step.detail}</p></div><button className="pc-button quiet" type="button" onClick={() => navigate(step.target)}>{step.done ? 'Review' : 'Open'}<ArrowRight size={14}/></button></li>)}</ol>{owner && <button className="pc-button primary" type="button" disabled={!hasRelease} onClick={begin}><Plus size={16}/> Configure deployment</button>}{!hasRelease && <p className="pc-muted">Complete the release step before configuring a deployment.</p>}</div>;
}

type DraftEditorProps = {
  draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  eligible: PlatformRecord[]; versions: PlatformRecord[]; agents: PlatformRecord[];
  chosenRelease?: PlatformRecord; chosenVersion?: PlatformRecord; chosenConfig?: AgentConfig;
  versionSources: PlatformRecord[]; connection?: ConnectionView; checkedIdentity?: string;
  connectionReady: boolean; pending: string; navigate: PlatformViewProps['navigate']; onCreate: () => void;
};

function DraftEditor({ draft, setDraft, eligible, versions, agents, chosenRelease, chosenVersion, chosenConfig, versionSources, connection, checkedIdentity, connectionReady, pending, navigate, onCreate }: DraftEditorProps) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [maxStep, setMaxStep] = useState<0 | 1 | 2>(0);
  const [stepError, setStepError] = useState('');
  const [brandBusy, setBrandBusy] = useState(false);
  const [brandNotice, setBrandNotice] = useState('');
  const [brandError, setBrandError] = useState('');
  const setLimit = (key: keyof DeploymentLimits, value: number | boolean) => setDraft(current => ({ ...current, limits: { ...current.limits, [key]: value } }));
  const versionNumber = (id: unknown) => String(versions.find(version => version.id === id)?.data.number || '?');
  const agentName = (id: unknown) => String(agents.find(agent => agent.id === id)?.data.name || 'Agent');
  const selectedCount = draft.publicKnowledgeIds.length;
  const channel = channels.find(item => item.value === draft.channel)!;
  const previewAccent = /^#[0-9a-f]{6}$/i.test(draft.brandAccent) ? draft.brandAccent : '#5148ce';
  const previewOnAccent = accentForeground(previewAccent);
  const stepFocus = useRef<HTMLElement>(null);
  const copyCompanyBrand = async () => {
    setBrandBusy(true); setBrandError(''); setBrandNotice('');
    try {
      const snapshot = await api<CompanySettingsSnapshot>('/api/company');
      setDraft(current => ({
        ...current,
        brandName: snapshot.publicBrand.name,
        brandAccent: snapshot.publicBrand.accent || snapshot.publicBrand.fallbackAccent,
        brandLogoDataUri: snapshot.publicBrand.logoDataUri || '',
      }));
      setBrandNotice('Public company name, accent, and logo copied into this draft. Later company-profile edits will not change the saved deployment snapshot.');
    } catch (cause) { setBrandError(cause instanceof Error ? cause.message : 'The public company brand could not be copied.'); }
    finally { setBrandBusy(false); }
  };
  const chooseLogo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 256 * 1024) {
      setBrandError('Choose a PNG, JPEG, or WebP logo up to 256 KB.'); return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setDraft(current => ({ ...current, brandLogoDataUri: reader.result as string }));
        setBrandError(''); setBrandNotice('Logo added to this deployment draft. The server checks its file contents and dimensions when the draft is saved.');
      }
    };
    reader.onerror = () => setBrandError('The logo file could not be read.');
    reader.readAsDataURL(file);
  };
  const validateStep = (value: 0 | 1 | 2) => {
    if (value === 0) {
      if (!draft.name.trim()) return 'Name this deployment before continuing.';
      if (!chosenRelease || !chosenVersion) return 'Choose an active tested release.';
      if (!connectionReady) return `Check the ${draft.channel === 'telegram' ? 'Telegram' : 'WhatsApp'} identity in Integrations before continuing.`;
    }
    if (value === 1 && draft.publicKnowledgeIds.length > 20) return 'Select no more than 20 approved sources.';
    if (value === 2) {
      if (!draft.brandName.trim() || !draft.welcomeMessage.trim()) return 'Add the public brand name and welcome message.';
      if (draft.brandAccent && !/^#[0-9a-f]{6}$/i.test(draft.brandAccent)) return 'Use a six-digit accent such as #5148ce, or clear it.';
      if (draft.channel.startsWith('web_')) {
        try { const origins = parseOrigins(draft.origins); if (!origins.length || origins.length > 10) return 'Add one to ten exact web origins.'; }
        catch (cause) { return cause instanceof Error ? cause.message : 'Review the allowed origins.'; }
      }
      if (!draft.limits.enabled) return 'Explicitly enable public usage within the configured limits.';
      const bounds: [number, number][] = [[draft.limits.maxSessionsPerDay, 500], [draft.limits.maxTurnsPerConversation, 40], [draft.limits.maxConcurrentSessions, 10], [draft.limits.maxSessionSeconds, 600], [draft.limits.maxSessionsPerIpHour, 10]];
      if (bounds.some(([current, max]) => !Number.isSafeInteger(current) || current < 1 || current > max)) return 'Review each usage limit and keep it within the displayed range.';
    }
    return '';
  };
  const focusStep = () => window.requestAnimationFrame(() => stepFocus.current?.focus());
  const next = () => {
    const invalid = validateStep(step);
    if (invalid) { setStepError(invalid); focusStep(); return; }
    const value = Math.min(2, step + 1) as 0 | 1 | 2;
    setStep(value); setMaxStep(current => Math.max(current, value) as 0 | 1 | 2); setStepError(''); focusStep();
  };
  const back = () => { setStep(Math.max(0, step - 1) as 0 | 1 | 2); setStepError(''); focusStep(); };
  const goTo = (value: 0 | 1 | 2) => {
    if (value > step) { const invalid = validateStep(step); if (invalid) { setStepError(invalid); focusStep(); return; } }
    setStep(value); setStepError(''); focusStep();
  };
  const save = () => {
    for (const value of [0, 1, 2] as const) {
      const invalid = validateStep(value);
      if (invalid) { setStep(value); setStepError(invalid); focusStep(); return; }
    }
    onCreate();
  };
  if (!eligible.length) return <div className="deploy-start compact"><Bot size={27}/><h2>A tested active release is required</h2><p>Public deployment accepts only an active browser release backed by a passing exact-version check and the Azure provider-default voice profile.</p><div className="deploy-empty-actions"><button className="pc-button" type="button" onClick={() => navigate('Agents')}>Open agents</button><button className="pc-button" type="button" onClick={() => navigate('Test lab')}>Open Test lab</button><button className="pc-button primary" type="button" onClick={() => navigate('Releases')}>Open releases</button></div><p className="pc-muted">Maya original / Gemini Despina remains available for private testing. Public deployments use the Azure provider-default profile; this does not claim any acoustic quality result.</p></div>;
  return <div className="deploy-editor">
    <header className="deploy-editor-head"><div><h2>Configure deployment</h2><p>Three focused steps, followed by an owner publication review.</p></div><span className="pc-badge">Owner draft</span></header>
    <nav className="deploy-stepper" aria-label="Deployment draft steps">{(['Agent & channel', 'Knowledge & behavior', 'Brand & usage'] as const).map((label, index) => { const value = index as 0 | 1 | 2; return <button key={label} type="button" aria-current={step === value ? 'step' : undefined} disabled={value > maxStep} onClick={() => goTo(value)}><span>{value < step || value < maxStep ? <Check size={13}/> : index + 1}</span><strong>{label}</strong></button>; })}</nav>
    {stepError && <p className="deploy-feedback is-error deploy-step-error" role="alert"><AlertCircle size={15}/>{stepError}</p>}

    {step === 0 && <section className="deploy-step-panel" ref={stepFocus} tabIndex={-1} aria-labelledby="deploy-step-agent"><div className="deploy-section-heading"><span>Step 1</span><div><h3 id="deploy-step-agent">Agent and channel</h3><p>Bind one tested release to one public destination.</p></div></div><div className="deploy-fields two"><label className="pc-field">Deployment name<input className="pc-input" maxLength={120} placeholder="Website assistant" value={draft.name} onChange={event => { setDraft(current => ({ ...current, name: event.target.value })); setStepError(''); }}/></label><label className="pc-field">Active tested release<select className="pc-select" value={chosenRelease?.id || ''} onChange={event => setDraft(current => ({ ...current, releaseId: event.target.value, publicKnowledgeIds: [] }))}>{eligible.map(release => <option key={release.id} value={release.id}>{agentName(release.data.agentId)} · version {versionNumber(release.data.versionId)}</option>)}</select></label></div><div className="deploy-gate-row"><span><CheckCircle2 size={16}/><strong>Configuration check passed</strong></span><span><ShieldCheck size={16}/><strong>Azure provider-default</strong></span><button className="pc-button quiet" type="button" onClick={() => navigate('Releases')}>Review release</button></div><details className="deploy-compact-details"><summary>Public provider guard</summary><p>The profile is eligible for public routing. This does not confirm a live provider connection or speech quality; review provider setup in Integrations.</p></details><div className="deploy-step-divider"/><label className="pc-field deploy-channel-select">Public channel<select className="pc-select" value={draft.channel} onChange={event => { setDraft(current => ({ ...current, channel: event.target.value as DeploymentChannel })); setStepError(''); }}>{channels.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><small>{channel.detail} Provider webhook activation remains a separate publish-time action.</small></label>{(draft.channel === 'telegram' || draft.channel === 'whatsapp') && <><div className={`deploy-connection-gate ${connectionReady ? 'is-ready' : ''}`}><MessageCircle size={18}/><div><strong>{connectionReady ? `Checked identity: ${checkedIdentity}` : `${channel.label} connection needs attention`}</strong><p>{connectionReady ? `Access checked ${displayTime(connection?.checkedAt)}.` : 'Save credentials, check provider access, and verify the account identity.'}</p></div><button className="pc-button" type="button" onClick={() => navigate('Integrations')}>Configure connection<ExternalLink size={14}/></button></div><label className="deploy-check important"><input type="checkbox" checked={draft.allowUnknownInbound} onChange={event => setDraft(current => ({ ...current, allowUnknownInbound: event.target.checked }))}/><span><strong>Allow people without a linked customer record to start a chat</strong><small>Channel metadata does not verify a person’s identity. Leave off to reject unknown senders.</small></span></label></>}</section>}

    {step === 1 && <section className="deploy-step-panel" ref={stepFocus} tabIndex={-1} aria-labelledby="deploy-step-knowledge"><div className="deploy-section-heading"><span>Step 2</span><div><h3 id="deploy-step-knowledge">Knowledge and behavior</h3><p>Choose the approved public subset and whether Azure may prepare reviewable learning proposals.</p></div><strong>{selectedCount} / 20 sources</strong></div>{versionSources.length ? <div className="deploy-source-list">{versionSources.map(source => { const selected = draft.publicKnowledgeIds.includes(source.id); return <label key={source.id}><input type="checkbox" checked={selected} disabled={!selected && selectedCount >= 20} onChange={event => setDraft(current => ({ ...current, publicKnowledgeIds: event.target.checked ? [...current.publicKnowledgeIds, source.id] : current.publicKnowledgeIds.filter(id => id !== source.id) }))}/><span><strong>{sourceTitle(source)}</strong><small>Approved source · revision {source.revision}</small></span></label>; })}</div> : <p className="deploy-inline-empty">This tested version has no approved company sources. The assistant will have no public company knowledge.</p>}<details className="deploy-prompt"><summary>Review tested disclosure and prompt</summary><dl><div><dt>AI disclosure</dt><dd>{chosenConfig?.disclosure || 'Missing'}</dd></div><div><dt>Opening message</dt><dd>{chosenConfig?.openingMessage || 'No opening message in the version.'}</dd></div><div><dt>System prompt</dt><dd><pre>{chosenConfig?.systemPrompt || 'No custom system prompt.'}</pre></dd></div></dl><p>The public page does not render the raw prompt.</p></details><div className="deploy-learning-choice"><div><strong>After public conversations</strong><p>Azure can prepare proposals from eligible completed conversations.</p></div><label className="deploy-check important"><input type="checkbox" checked={draft.autoLearning} onChange={event => setDraft(current => ({ ...current, autoLearning: event.target.checked }))}/><span><strong>Propose reviewed learning automatically</strong><small>Default off. Uses metered Azure text processing. An operator must review every proposal before any permanent memory or prompt change.</small></span></label></div></section>}

    {step === 2 && <section className="deploy-step-panel" ref={stepFocus} tabIndex={-1} aria-labelledby="deploy-step-brand"><div className="deploy-section-heading"><span>Step 3</span><div><h3 id="deploy-step-brand">Brand and usage</h3><p>Freeze the public presentation, allowed origins, and session limits.</p></div><button className="pc-button" type="button" disabled={brandBusy} onClick={() => void copyCompanyBrand()}><Palette size={14}/>{brandBusy ? 'Copying…' : 'Copy company brand'}</button></div>{brandError && <p className="deploy-feedback is-error" role="alert"><AlertCircle size={15}/>{brandError}</p>}{brandNotice && <p className="deploy-feedback is-notice" role="status"><CheckCircle2 size={15}/>{brandNotice}</p>}<div className="deploy-brand-editor"><div className="deploy-brand-controls"><label className="pc-field">Public brand name<input className="pc-input" maxLength={120} value={draft.brandName} onChange={event => { setDraft(current => ({ ...current, brandName: event.target.value })); setBrandNotice(''); setStepError(''); }}/></label><label className="pc-field">Welcome message<textarea className="pc-textarea" maxLength={600} rows={3} value={draft.welcomeMessage} onChange={event => { setDraft(current => ({ ...current, welcomeMessage: event.target.value })); setStepError(''); }}/></label><label className="pc-field">Optional accent<div className="deploy-color-field"><input type="color" aria-label="Choose deployment accent" value={previewAccent} onChange={event => { setDraft(current => ({ ...current, brandAccent: event.target.value })); setBrandNotice(''); }}/><input className="pc-input" maxLength={7} pattern="#[0-9A-Fa-f]{6}" placeholder="#5148ce" value={draft.brandAccent} onChange={event => { setDraft(current => ({ ...current, brandAccent: event.target.value })); setBrandNotice(''); }}/><button className="pc-button quiet" type="button" disabled={!draft.brandAccent} onClick={() => { setDraft(current => ({ ...current, brandAccent: '' })); setBrandNotice('Accent cleared. Relay indigo will be used.'); }}>Use default</button></div><small>Six-digit hex; blank uses Relay indigo.</small></label><div className="deploy-logo-control"><span><strong>Optional logo</strong><small>PNG, JPEG, or WebP · up to 256 KB · 16–2,048 px</small></span><div><label className="pc-button quiet deploy-file"><ImagePlus size={14}/>{draft.brandLogoDataUri ? 'Replace logo' : 'Choose logo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo}/></label>{draft.brandLogoDataUri && <button className="pc-button quiet" type="button" onClick={() => { setDraft(current => ({ ...current, brandLogoDataUri: '' })); setBrandNotice('Logo removed from this draft.'); }}><Trash2 size={14}/>Remove logo</button>}</div></div></div><div className="deploy-brand-preview" style={{ '--deploy-brand-accent': previewAccent, '--deploy-brand-on-accent': previewOnAccent } as CSSProperties}><span className="deploy-brand-preview-label">Deployment preview</span><div className="deploy-brand-mark">{draft.brandLogoDataUri ? <img src={draft.brandLogoDataUri} alt="Deployment logo preview"/> : <span>{(draft.brandName || 'AI').slice(0, 2).toUpperCase()}</span>}</div><div><h4>{draft.brandName || 'Public brand name'}</h4><p>{draft.welcomeMessage || 'Add a welcome message for visitors.'}</p></div><span className="deploy-brand-action">Start a conversation</span><small>Preview of frozen public fields.</small></div></div>{draft.channel.startsWith('web_') && <label className="pc-field deploy-origin-field">Allowed web origins<textarea className="pc-textarea deploy-origin-input" rows={2} placeholder={'https://www.example.com\nhttp://localhost:3000'} value={draft.origins} onChange={event => { setDraft(current => ({ ...current, origins: event.target.value })); setStepError(''); }}/><small>Exact HTTPS origins; localhost and loopback may use HTTP. Include this app’s origin.</small></label>}<div className="deploy-step-usage"><div><Settings2 size={16}/><span><strong>Usage boundaries</strong><small>Required public session caps</small></span></div><label className="deploy-check important"><input type="checkbox" checked={draft.limits.enabled} onChange={event => { setLimit('enabled', event.target.checked); setStepError(''); }}/><span><strong>Enable public usage within these limits</strong><small>Required. Publishing accepts new sessions only inside the caps below.</small></span></label><div className="deploy-limit-grid"><LimitField label="Sessions / day" value={draft.limits.maxSessionsPerDay} max={500} onChange={value => setLimit('maxSessionsPerDay', value)}/><LimitField label="Turns / conversation" value={draft.limits.maxTurnsPerConversation} max={40} onChange={value => setLimit('maxTurnsPerConversation', value)}/><LimitField label="Concurrent sessions" value={draft.limits.maxConcurrentSessions} max={10} onChange={value => setLimit('maxConcurrentSessions', value)}/><LimitField label="Session seconds" value={draft.limits.maxSessionSeconds} max={600} onChange={value => setLimit('maxSessionSeconds', value)}/><LimitField label="Sessions / IP / hour" value={draft.limits.maxSessionsPerIpHour} max={10} onChange={value => setLimit('maxSessionsPerIpHour', value)}/></div></div></section>}

    <footer className="deploy-editor-actions"><div><strong>{step === 2 ? 'Next: owner review' : `Step ${step + 1} of 3`}</strong><p>{step === 2 ? 'Saving creates a draft only; it does not publish or activate a provider.' : step === 0 ? 'Next, choose the public knowledge and learning behavior.' : 'Next, review the public brand, origins, and limits.'}</p></div><div className="deploy-step-actions">{step > 0 && <button className="pc-button" type="button" onClick={back}>Back</button>}{step < 2 ? <button className="pc-button primary" type="button" onClick={next}>Continue<ArrowRight size={15}/></button> : <button className="pc-button primary" type="button" disabled={!!pending || !chosenVersion || !connectionReady} onClick={save}><ArrowRight size={16}/>{pending === 'create' ? 'Saving draft…' : 'Save review draft'}</button>}</div></footer>
  </div>;
}

function LimitField({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (value: number) => void }) {
  return <label className="pc-field">{label}<input className="pc-input" type="number" inputMode="numeric" min={1} max={max} value={value} onChange={event => onChange(Number(event.target.value))}/><small>1–{max}</small></label>;
}

type DeploymentReviewProps = {
  deployment: DeploymentRecord; agent?: PlatformRecord; version?: PlatformRecord; config?: AgentConfig;
  sources: PlatformRecord[]; connections: ConnectionView[]; activation?: ActivationReceipt; owner: boolean;
  acknowledged: boolean; setAcknowledged: (value: boolean) => void; pending: string;
  replaceWebhook: boolean; setReplaceWebhook: (value: boolean) => void;
  onTransition: (action: 'publish' | 'pause' | 'stop') => void; onActivateTelegram: () => void;
  navigate: PlatformViewProps['navigate']; copied: string; copy: (key: string, value: string) => Promise<void>;
};

function DeploymentReview({ deployment, agent, version, config, sources, connections, activation, owner, acknowledged, setAcknowledged, pending, replaceWebhook, setReplaceWebhook, onTransition, onActivateTelegram, navigate, copied, copy }: DeploymentReviewProps) {
  const data = deployment.data;
  const chosenSources = data.publicKnowledgeIds.map(id => sources.find(source => source.id === id)).filter(Boolean) as PlatformRecord[];
  const localOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicUrl = localOrigin ? `${localOrigin}/talk/${data.publicId}` : `/talk/${data.publicId}`;
  const localOnly = localOrigin ? /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(localOrigin) : false;
  const frameTitle = htmlAttribute(`${data.brand.name} AI assistant`);
  const iframe = `<iframe src="${publicUrl}" title="${frameTitle}"${data.channel === 'web_voice' ? ' allow="microphone"' : ''} style="width:100%;min-height:640px;border:0" loading="lazy"></iframe>`;
  const connection = data.connection ? connections.find(item => item.id === data.connection?.connectionId) : undefined;
  const identity = data.channel === 'telegram' ? connection?.settings.username || connection?.settings.botUsername || connection?.settings.botId || activation?.botUsername : connection?.settings.verifiedName || connection?.settings.displayPhoneNumber || connection?.settings.phoneNumberId;
  const canPublish = owner && (deployment.status === 'draft' || deployment.status === 'paused') && acknowledged && data.limits.enabled;
  const reviewAccent = /^#[0-9a-f]{6}$/i.test(data.brand.accent || '') ? data.brand.accent! : '#5148ce';
  const reviewOnAccent = data.brand.onAccent || accentForeground(reviewAccent);
  return <div className="deploy-review">
    <header className="deploy-review-head"><div><div className="deploy-title-line"><h2>{data.name}</h2><StatusBadge status={deployment.status}/></div><p>{channelName(data.channel)} · {statusCopy[deployment.status] || deployment.status}</p></div>{owner && <button className="pc-button" type="button" onClick={() => onTransition('stop')} disabled={!!pending || deployment.status === 'stopped'}><Square size={14}/> Stop permanently</button>}</header>
    <div className="deploy-summary-strip"><div><span>Agent snapshot</span><strong>{String(agent?.data.name || 'Agent')} · version {String(version?.data.number || '?')}</strong></div><div><span>Public knowledge</span><strong>{chosenSources.length} selected source{chosenSources.length === 1 ? '' : 's'}</strong></div><div><span>Usage</span><strong>{data.limits.enabled ? 'Enabled within limits' : 'Disabled'}</strong></div><div><span>Updated</span><strong>{displayTime(deployment.updatedAt)}</strong></div></div>

    <section className="deploy-review-section"><div className="deploy-review-section-head"><div><h3>What visitors can see</h3><p>Review the public presentation and its explicit data boundary.</p></div><Globe2 size={20}/></div><div className="deploy-public-preview" style={{ '--deploy-brand-accent': reviewAccent, '--deploy-brand-on-accent': reviewOnAccent } as CSSProperties}><div><span>{data.brand.logoDataUri ? <img src={data.brand.logoDataUri} alt="Public deployment logo"/> : data.brand.name.slice(0, 2).toUpperCase()}</span><div><strong>{data.brand.name}</strong><p>{data.brand.welcomeMessage}</p></div></div><small>{config?.disclosure || 'AI disclosure unavailable'}</small></div><div className="deploy-boundary"><div><Check size={15}/><p><strong>Included:</strong> frozen public brand text{data.brand.accent ? ', accent and logo choice' : ''}, AI disclosure, the tested agent instructions, and {chosenSources.length ? chosenSources.map(sourceTitle).join(', ') : 'no company knowledge sources'}.</p></div><div><ShieldCheck size={15}/><p><strong>Excluded:</strong> customer records, private memories, GroupAI, nonselected sources, agent tools, connection secrets, and workspace credentials.</p></div></div><details className="deploy-prompt"><summary>Review exact tested instructions</summary><dl><div><dt>System prompt</dt><dd><pre>{config?.systemPrompt || 'No custom system prompt.'}</pre></dd></div><div><dt>Response style</dt><dd>{config?.responseStyle || 'Not recorded'}</dd></div><div><dt>Public sources</dt><dd>{chosenSources.length ? <ul>{chosenSources.map(source => <li key={source.id}>{sourceTitle(source)} · revision {source.revision}</li>)}</ul> : 'No sources selected.'}</dd></div></dl><p>This owner review is private. The public page does not render the raw prompt or connection metadata.</p></details></section>

    <section className="deploy-review-section"><div className="deploy-review-section-head"><div><h3>Owner publication review</h3><p>Publication rechecks the release, passing test, current sources, provider profile, connection authority, and owner access.</p></div><Rocket size={20}/></div>{(deployment.status === 'draft' || deployment.status === 'paused') && <label className="deploy-check important"><input type="checkbox" disabled={!owner} checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/><span><strong>I confirm that only the selected approved company sources above are public</strong><small>The server requires this exact acknowledgement for publishing and republishing.</small></span></label>}<div className="deploy-action-row">{(deployment.status === 'draft' || deployment.status === 'paused') && <button className="pc-button primary" type="button" disabled={!canPublish || !!pending} onClick={() => onTransition('publish')}><Rocket size={15}/>{pending === 'publish' ? 'Publishing…' : deployment.status === 'paused' ? 'Republish deployment' : 'Publish deployment'}</button>}{deployment.status === 'published' && <button className="pc-button" type="button" disabled={!owner || !!pending} onClick={() => onTransition('pause')}><Pause size={15}/>{pending === 'pause' ? 'Pausing…' : 'Pause new sessions'}</button>}<span className="pc-muted">Drafts and paused deployments have no active public runtime. Stopping is permanent.</span></div>{!data.limits.enabled && <p className="deploy-feedback is-error"><AlertCircle size={15}/>Public usage was saved as disabled. This snapshot cannot serve sessions; create a replacement with explicit limits enabled.</p>}</section>

    <LearningJobsPanel deployment={deployment} navigate={navigate}/>

    {(deployment.status === 'published' || deployment.status === 'paused') && data.channel.startsWith('web_') && <section className="deploy-review-section"><div className="deploy-review-section-head"><div><h3>Public web share</h3><p>The link contains no credential. A short-lived public session is issued only after origin and deployment checks.</p></div>{data.channel === 'web_voice' ? <Mic2 size={20}/> : <MessageCircle size={20}/>}</div><CopyField label="Public URL" value={publicUrl} action={copied === 'url' ? 'Copied' : 'Copy URL'} onCopy={() => void copy('url', publicUrl)} openHref={deployment.status === 'published' ? publicUrl : undefined}/><CopyField label="Embed code" value={iframe} multiline action={copied === 'embed' ? 'Copied' : 'Copy embed'} onCopy={() => void copy('embed', iframe)}/><div className="deploy-origin-review"><strong>Allowed origins</strong>{data.allowedOrigins.map(origin => <code key={origin}>{origin}</code>)}</div><p className="pc-muted">Embedding also requires the host to apply a scoped <code>frame-ancestors</code> policy for these origins. Voice embeds request microphone permission; the browser still asks the visitor for consent.</p>{localOnly && <p className="deploy-local-note"><AlertCircle size={16}/><span><strong>This is a local URL.</strong> It works on this computer, but it is not reachable from the public internet until the app and optional voice gateway are hosted on final HTTPS/WSS addresses.</span></p>}</section>}

    {(data.channel === 'telegram' || data.channel === 'whatsapp') && <section className="deploy-review-section"><div className="deploy-review-section-head"><div><h3>Provider activation</h3><p>Registry publication does not install or verify an external provider webhook.</p></div><MessageCircle size={20}/></div><div className="deploy-provider-row"><div><span>Checked provider identity</span><strong>{identity || 'Identity unavailable — recheck the connection'}</strong><small>{connection?.status === 'connected' && connection.checkedAt ? `Provider access checked ${displayTime(connection.checkedAt)}` : 'Connection is not currently reported as checked.'}</small></div><button className="pc-button" type="button" onClick={() => navigate('Integrations')}>Open integrations<ExternalLink size={14}/></button></div>{data.channel === 'telegram' ? <>{activation ? <div className={`deploy-activation-receipt ${activation.status === 'installed' ? 'is-installed' : ''}`}><CheckCircle2 size={17}/><div><strong>{activation.status === 'installed' ? 'Telegram webhook installed' : 'Telegram binding changed'}</strong><p>{activation.detail || `Provider confirmed ${displayTime(activation.checkedAt)}.`} Changes made later in Telegram are not monitored automatically.</p>{activation.botUsername && <a href={`https://t.me/${activation.botUsername.replace(/^@/, '')}`} target="_blank" rel="noreferrer">Open @{activation.botUsername.replace(/^@/, '')}<ExternalLink size={13}/></a>}</div></div> : <p className="deploy-inline-empty">No saved provider activation receipt exists for this deployment.</p>}<label className="deploy-check"><input type="checkbox" disabled={!owner || deployment.status !== 'published'} checked={replaceWebhook} onChange={event => setReplaceWebhook(event.target.checked)}/><span><strong>Replace a different existing Telegram webhook if found</strong><small>Leave this clear to stop safely when the bot points somewhere else.</small></span></label><button className="pc-button primary" type="button" disabled={!owner || deployment.status !== 'published' || !!pending} onClick={onActivateTelegram}><Settings2 size={15}/>{pending === 'activate' ? 'Checking and installing…' : 'Check and activate Telegram'}</button></> : <div className="deploy-activation-receipt"><AlertCircle size={17}/><div><strong>Meta webhook registration requires operator review</strong><p>Use the generated HTTPS webhook shown in Integrations and complete registration in Meta. This screen does not claim that external registration is active.</p></div></div>}</section>}

    <footer className="deploy-record-foot"><span>Registry revision {deployment.revision}</span><span>Public ID {data.publicId}</span></footer>
  </div>;
}

function CopyField({ label, value, action, multiline = false, onCopy, openHref }: { label: string; value: string; action: string; multiline?: boolean; onCopy: () => void; openHref?: string }) {
  return <div className="deploy-copy-field"><label className="pc-field">{label}{multiline ? <textarea className="pc-textarea" rows={4} readOnly value={value}/> : <input className="pc-input" readOnly value={value}/>}</label><div className="deploy-copy-actions"><button className="pc-button" type="button" onClick={onCopy}><Clipboard size={14}/>{action}</button>{openHref && <a className="pc-button primary" href={openHref} target="_blank" rel="noreferrer">Open assistant<ExternalLink size={14}/></a>}</div></div>;
}

const learningStatus: Record<LearningJobStatus, { label: string; detail: string }> = {
  queued: { label: 'Queued', detail: 'Waiting for the learning worker.' },
  claimed: { label: 'Claimed', detail: 'Reserved by the learning worker.' },
  inference: { label: 'Analyzing', detail: 'Metered Azure analysis is running.' },
  ready: { label: 'Ready for review', detail: 'A proposal is ready for operator review.' },
  cancelled: { label: 'Cancelled', detail: 'Stopped without an automatic retry.' },
  uncertain: { label: 'Uncertain', detail: 'Outcome is retained and will not retry automatically.' },
};

function LearningJobsPanel({ deployment, navigate }: { deployment: DeploymentRecord; navigate: PlatformViewProps['navigate'] }) {
  const [result, setResult] = useState<{ enabled: boolean; jobs: LearningJobView[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    setError('');
    try {
      setResult(await api<{ enabled: boolean; jobs: LearningJobView[] }>(`/api/learning-jobs?deploymentId=${encodeURIComponent(deployment.id)}`, { signal }));
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'Learning activity could not be loaded.');
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [deployment.id]);
  useEffect(() => { const controller = new AbortController(); setLoading(true); void load(controller.signal); return () => controller.abort(); }, [load]);
  const optedIn = deployment.data.autoLearning === true;
  useEffect(() => {
    if (!optedIn || result?.enabled !== true) return;
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load, optedIn, result?.enabled]);
  return <section className="deploy-review-section deploy-learning-status"><div className="deploy-review-section-head"><div><h3>Reviewed learning</h3><p>Azure may propose improvements after eligible completed conversations. Operators decide whether anything becomes permanent.</p></div><div className="deploy-learning-head"><span className="pc-badge" data-status={optedIn ? 'active' : undefined}>{optedIn ? 'Opt-in on' : 'Opt-in off'}</span><button className="pc-iconbutton" type="button" aria-label="Refresh learning activity" disabled={loading} onClick={() => void load()}><RefreshCw size={15}/></button></div></div>
    {!optedIn ? <p className="deploy-inline-empty">This snapshot does not create automatic learning jobs. Create a replacement draft to change this immutable setting.</p> : result && !result.enabled ? <p className="deploy-learning-worker"><AlertCircle size={15}/><span><strong>Learning worker is off.</strong> The opt-in is saved, but automated proposals will not be queued until the worker is explicitly enabled.</span></p> : null}
    {loading && <p className="pc-muted" role="status">Reading learning activity…</p>}
    {error && <p className="deploy-feedback is-error" role="alert"><AlertCircle size={15}/>{error}</p>}
    {!loading && !error && optedIn && result?.enabled && result.jobs.length === 0 && <p className="deploy-inline-empty">No eligible completed conversation has produced a learning job yet.</p>}
    {!!result?.jobs.length && <div className="deploy-learning-jobs">{result.jobs.slice(0, 6).map(job => { const copy = learningStatus[job.status]; return <article key={job.id}><span className="deploy-learning-job-icon" data-status={job.status}>{job.status === 'ready' ? <Check size={14}/> : <span/>}</span><div><strong>{copy.label}</strong><p>{job.reason || copy.detail}</p><small>Anonymous public conversation · {displayTime(job.updatedAt)} · deployment revision {job.deploymentRevision}</small></div><div className="deploy-learning-job-actions">{job.analysisId && <span className="pc-badge">Proposal saved</span>}<button className="pc-button quiet" type="button" onClick={() => navigate('Conversations', job.sessionId)}>{job.status === 'ready' ? 'Review proposal' : 'Open conversation'}<ArrowRight size={13}/></button></div></article>; })}</div>}
    <p className="pc-muted deploy-learning-footnote">Learning analysis is metered Azure text usage. Jobs create reviewable proposals only; no memory or prompt change is applied automatically.{(result?.jobs.length || 0) > 6 ? ` Showing the latest 6 of ${result!.jobs.length} jobs.` : ''}</p>
  </section>;
}
