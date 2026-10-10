'use client';

import { useEffect, useRef, useState } from 'react';
import { FlaskConical, Plus, Save, GitBranch, ArrowLeft } from 'lucide-react';
import type { PlatformViewProps } from '../../lib/platform/contracts';
import type { AgentConfig } from '../../lib/platform/agents';
import { normalizeVoiceTools, type VoiceToolName } from '../../lib/voice/tools/contracts';
import { normalizeSpeechVocabulary, MAX_SPEECH_VOCABULARY_TERMS } from '../../lib/voice/speech-vocabulary';
import { VoiceStudio } from '../voice-studio';
import { VoiceCloningPanel } from '../voice-cloning-panel';
import { AgentRevision } from '../agent-revision';
import { AgentReleasePanel } from '../agent-release-panel';
import { campaignAgentBinding, campaignAgentContext, campaignAgentFocus, campaignAgentTemplate, parseCampaignAgentFocus, returnCampaignAgent } from '../../lib/platform/campaign-agent-handoff';
import { campaignDisplayName } from '../../lib/platform/campaign-workflow';
import { campaignFocus } from '../../lib/platform/campaign-workspace-view';
import type { PlatformRecord } from '../../lib/platform/contracts';
import styles from './agents-workspace.module.css';

const initial: AgentConfig = { name: '', role: '', objective: '', disclosure: 'I am an AI assistant for this company.', primaryLanguage: 'English', allowedLanguages: ['English'], responseStyle: 'Be clear, concise and respectful. Acknowledge uncertainty.', memoryScope: 'approved_contact', escalation: 'Offer human help when requested or when the answer is uncertain.', knowledgeIds: [], enabledTools: [], systemPrompt: '', openingMessage: '', speechVocabulary: [] };
const values = (value: string) => value.split(',').map((part) => part.trim()).filter(Boolean);
type Section = 'Setup' | 'Conversation' | 'Voice & language' | 'Knowledge' | 'Behaviour & actions' | 'Publish';
const sections: Section[] = ['Setup', 'Conversation', 'Voice & language', 'Knowledge', 'Behaviour & actions', 'Publish'];
const tabId = (section: Section) => 'agent-tab-' + sections.indexOf(section);
const actions: { name: VoiceToolName; title: string; description: string }[] = [
  { name: 'search_company_knowledge', title: 'Search company knowledge', description: 'Look up facts in approved company sources attached to this agent. Replies can cite the matching source.' },
  { name: 'recall_customer_context', title: 'Recall customer context', description: 'Use approved relationship notes and open commitments for the contact selected by the operator.' },
  { name: 'request_follow_up', title: 'Request a follow-up', description: 'Create an internal follow-up or human handoff proposal for staff review. This does not book, send, or transfer anything.' },
];
const presets = [
  { name: 'Customer feedback', role: 'Customer feedback representative', objective: 'Learn what happened in the customer experience, identify what helped or failed, and ask permission before proposing a follow-up.', systemPrompt: 'Listen for the customer’s own account. Ask one open question at a time. Reflect specific details without assuming how they feel. If they describe a problem, clarify the impact and offer a human follow-up. Do not promise a resolution or invent company policy.', openingMessage: 'Hello, I’m an AI assistant calling to understand your experience. Is now a good time to talk for a few minutes?', responseStyle: 'Warm, patient and concise. Allow pauses, confirm corrections, and avoid leading questions.' },
  { name: 'Lead qualification', role: 'Sales qualification representative', objective: 'Understand the prospect’s needs, timing, and decision process, then offer a useful next step when appropriate.', systemPrompt: 'Learn the prospect’s goal before describing an offering. Ask one question at a time about their situation, timeline, and constraints. Use only approved company knowledge for factual claims. If the fit is unclear, say so and offer a human follow-up.', openingMessage: 'Hi, I’m an AI assistant with the team. Is this a convenient time to ask a few questions about what you’re looking for?', responseStyle: 'Direct, helpful and curious. Do not pressure for a commitment or invent pricing.' },
];
export function AgentsView({ records, workspace, act, busy: platformBusy, navigate, focusId }: PlatformViewProps) {
  const viewer = workspace.user.role === 'viewer';
  const route = parseCampaignAgentFocus(focusId);
  const handoff = route && route !== 'invalid' ? route : undefined;
  const [returnPending, setReturnPending] = useState(false);
  const [returnError, setReturnError] = useState('');
  const returnLock = useRef(false);
  const busy = platformBusy || returnPending;
  const agents = records.filter(record => record.kind === 'agent_definition');
  const versions = records.filter(record => record.kind === 'agent_version');
  const approvedSources = records.filter(record => record.kind === 'brain_source' && record.status === 'approved');
  const [selected, select] = useState<string | null>(route ? handoff?.agentId || null : focusId === 'new' ? null : focusId || agents[0]?.id || null);
  const current = agents.find(agent => agent.id === selected);
  const [draft, setDraft] = useState<AgentConfig>(() => ({ ...initial, ...(current?.data as AgentConfig | undefined) }));
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const dirty = JSON.stringify(draft) !== baseline;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const [section, setSection] = useState<Section>(current ? 'Conversation' : 'Setup');
  const [validation, setValidation] = useState('');
  const [invalidField, setInvalidField] = useState('');
  const [notice, setNotice] = useState('');
  const [languagesText, setLanguagesText] = useState(draft.allowedLanguages.join(', '));
  const [vocabularyText, setVocabularyText] = useState((draft.speechVocabulary || []).join('\n'));
  const [vocabularyError, setVocabularyError] = useState('');
  const loadedRecord = useRef({ id: current?.id, revision: current?.revision });
  const lastFocus = useRef(focusId);
  const selectionRef = useRef({ selected, focusId, viewer });
  selectionRef.current = { selected, focusId, viewer };
  const agentFocus = (id?: string) => handoff ? campaignAgentFocus({ ...handoff, agentId: id }) : id || 'new';
  let campaignContext: ReturnType<typeof campaignAgentContext> | undefined;
  let handoffError = route === 'invalid' ? 'This campaign preparation link is invalid. Open a saved campaign and choose Prepare an agent again.' : '';
  if (handoff) {
    try {
      campaignContext = campaignAgentContext(records, handoff);
      if (handoff.agentId && !agents.some(agent => agent.id === handoff.agentId)) handoffError = 'This agent is unavailable in this workspace. Return to the campaign to choose or prepare another agent.';
    } catch (cause) { handoffError = cause instanceof Error ? cause.message : 'Campaign setup is unavailable.'; }
  }
  const resetDraft = (next: AgentConfig) => {
    setDraft(next); setBaseline(JSON.stringify(next)); dirtyRef.current = false;
    setLanguagesText(next.allowedLanguages.join(', ')); setVocabularyText((next.speechVocabulary || []).join('\n'));
    setVocabularyError(''); setValidation(''); setInvalidField('');
  };
  // Background refreshes must not replace work in progress. Revision checks on save remain authoritative.
  useEffect(() => {
    if (current && (loadedRecord.current.id !== current.id || !dirtyRef.current)) {
      resetDraft({ ...initial, ...(current.data as AgentConfig) });
      loadedRecord.current = { id: current.id, revision: current.revision };
    }
  }, [current?.id, current?.revision]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirtyRef.current || returnLock.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  useEffect(() => {
    const warn = (event: Event) => {
      if (returnLock.current) { event.preventDefault(); return; }
      if (dirtyRef.current && !window.confirm('You have unsaved agent changes. Leave without saving?')) event.preventDefault();
    };
    window.addEventListener('relay:before-navigation', warn);
    return () => window.removeEventListener('relay:before-navigation', warn);
  }, []);
  useEffect(() => {
    if (validation && invalidField) document.getElementById(invalidField)?.focus();
  }, [validation, invalidField, section]);
  const canDiscard = () => !dirtyRef.current || window.confirm('Discard the unsaved changes to this agent?');
  const changeAgent = (id: string | null, navigationApproved = false) => {
    if (id === selected || busy || (!navigationApproved && !canDiscard())) return;
    const next = agents.find(agent => agent.id === id);
    select(id); resetDraft(next ? { ...initial, ...(next.data as AgentConfig) } : { ...initial });
    loadedRecord.current = { id: next?.id, revision: next?.revision };
    setSection(next ? 'Conversation' : 'Setup'); setNotice('');
    if (!navigationApproved) navigate('agents', agentFocus(id || undefined));
  };
  useEffect(() => {
    if (lastFocus.current === focusId) return;
    lastFocus.current = focusId;
    // The platform's cancelable navigation event already guarded this route change.
    if (route && route !== 'invalid') changeAgent(route.agentId || null, true);
    else if (focusId === 'new') changeAgent(null, true);
    else if (focusId && agents.some(agent => agent.id === focusId)) changeAgent(focusId, true);
  }, [focusId]);
  const startNew = (preset?: (typeof presets)[number]) => {
    if (viewer || busy || !canDiscard()) return;
    select(null); resetDraft({ ...initial }); loadedRecord.current = { id: undefined, revision: undefined };
    navigate('agents', agentFocus());
    if (preset) { setDraft({ ...initial, ...preset }); setLanguagesText('English'); }
    setSection('Setup'); setNotice('');
    requestAnimationFrame(() => document.getElementById('agent-name')?.focus());
  };
  const set = <K extends keyof AgentConfig>(key: K, value: AgentConfig[K]) => {
    if (viewer || busy) return;
    setDraft(previous => ({ ...previous, [key]: value })); setNotice(''); setValidation(''); setInvalidField('');
  };
  const agentVersions = versions.filter(version => version.data.agentId === current?.id).sort((a, b) => Number(b.data.number) - Number(a.data.number));
  const latestConfig = agentVersions[0]?.data.config as AgentConfig | undefined;
  const sourcesChanged = !!agentVersions[0] && draft.knowledgeIds.some(id => {
    const source = approvedSources.find(item => item.id === id);
    return !source || source.updatedAt > agentVersions[0].createdAt;
  });
  const changed = latestConfig ? (Object.keys(draft) as (keyof AgentConfig)[]).filter(key => JSON.stringify(key === 'speechVocabulary' ? draft[key] || [] : draft[key]) !== JSON.stringify(key === 'speechVocabulary' ? latestConfig[key] || [] : latestConfig[key])) : [];
  const validate = (): { section: Section; field: string; message: string } | undefined => {
    if (!draft.name.trim()) return { section: 'Setup', field: 'agent-name', message: 'Give this agent a name.' };
    if (!draft.role.trim()) return { section: 'Setup', field: 'agent-role', message: 'Describe the role this agent will perform.' };
    if (draft.objective.trim().length < 20) return { section: 'Setup', field: 'agent-objective', message: 'Describe the agent’s purpose in at least 20 characters.' };
    if (!/\b(ai|artificial intelligence|virtual assistant)\b/i.test(draft.disclosure)) return { section: 'Conversation', field: 'agent-disclosure', message: 'The introduction must clearly identify the agent as AI.' };
    if (!draft.responseStyle.trim()) return { section: 'Conversation', field: 'agent-style', message: 'Describe how the agent should respond.' };
    if ((draft.systemPrompt || '').length > 12000) return { section: 'Conversation', field: 'agent-system-prompt', message: 'Keep the system prompt within 12,000 characters.' };
    if ((draft.openingMessage || '').length > 1000) return { section: 'Conversation', field: 'agent-opening-message', message: 'Keep the opening message within 1,000 characters.' };
    if (!draft.primaryLanguage.trim() || !draft.allowedLanguages.includes(draft.primaryLanguage)) return { section: 'Voice & language', field: 'agent-languages', message: 'Include the primary language in the allowed languages.' };
    try { normalizeSpeechVocabulary(draft.speechVocabulary); } catch (error) {
      const message = error instanceof Error ? error.message : 'Review the speech vocabulary.';
      setVocabularyError(message); return { section: 'Voice & language', field: 'agent-speech-vocabulary', message };
    }
    if (draft.escalation.trim().length < 15) return { section: 'Behaviour & actions', field: 'agent-escalation', message: 'Describe when to offer human help in at least 15 characters.' };
    if (draft.knowledgeIds.some(id => !approvedSources.some(source => source.id === id))) return { section: 'Knowledge', field: 'agent-source-review', message: 'Remove sources that are no longer approved before saving.' };
  };
  const save = async () => {
    if (viewer || busy) return;
    const invalid = validate();
    if (invalid) {
      setSection(invalid.section); setInvalidField(invalid.field); setValidation(invalid.message);
      requestAnimationFrame(() => document.getElementById(invalid.field)?.focus());
      return;
    }
    try {
      const result = await act(current ? 'agent.update' : 'agent.create', { ...draft, ...(current ? { agentId: current.id, revision: loadedRecord.current.revision ?? current.revision } : {}) });
      if (result && typeof result === 'object' && 'id' in result && 'data' in result) {
        const saved = result as { id: string; data: AgentConfig; revision: number };
        resetDraft({ ...initial, ...saved.data }); select(saved.id);
        loadedRecord.current = { id: saved.id, revision: saved.revision };
        navigate('agents', agentFocus(saved.id));
      } else { setBaseline(JSON.stringify(draft)); dirtyRef.current = false; }
      setNotice('Draft saved. Test it here, then open Publish to review the release checks.');
    } catch { /* The platform action banner presents the server error; keep the draft. */ }
  };
  const jumpTo = (id: string) => {
    const panel = document.getElementById(id);
    const target = id === 'agent-test-call'
      ? panel?.querySelector<HTMLInputElement>('.wb-input-mode input:checked:not(:disabled)') || panel?.querySelector<HTMLButtonElement>('.wb-call-actions button:not(:disabled)') || panel
      : panel;
    target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: id === 'agent-test-call' ? 'center' : 'start' });
    target?.focus({ preventScroll: true });
  };
  const fieldError = (id: string) => ({ 'aria-invalid': invalidField === id || undefined, 'aria-describedby': invalidField === id ? 'agent-validation' : undefined });
  const activeRelease = current ? records.find(record => record.kind === 'release' && record.status === 'active' && record.data.channel === 'browser' && record.data.agentId === current.id) : undefined;
  let returnBlocker = '';
  if (handoff && current && activeRelease) {
    try { campaignAgentBinding({ records, reference: handoff, agentId: current.id, releaseId: activeRelease.id, dirty, viewer }); }
    catch (cause) { returnBlocker = cause instanceof Error ? cause.message : 'Review Publish before returning.'; }
  }
  const useCampaignTemplate = () => {
    if (!handoff || viewer || busy || !canDiscard()) return;
    try {
      const template = campaignAgentTemplate(records, handoff);
      resetDraft({ ...initial }); setDraft({ ...initial, ...template }); dirtyRef.current = true;
      setSection('Setup'); setNotice('Campaign starting draft copied. Review the instructions and approved knowledge, then save and test.');
    } catch (cause) { setReturnError(cause instanceof Error ? cause.message : 'Campaign starting draft is unavailable.'); }
  };
  const returnWithAgent = async () => {
    if (!handoff || !current || !activeRelease || viewer || busy || returnLock.current || dirtyRef.current) return;
    const expected = { selected, focusId };
    returnLock.current = true; setReturnPending(true); setReturnError('');
    try {
      const saved = await returnCampaignAgent({ reference: handoff, agentId: current.id, releaseId: activeRelease.id, dirty: dirtyRef.current, viewer }, async () => {
        const response = await fetch('/api/platform', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('Current campaign and release records could not be loaded. Refresh and try again.');
        const result = await response.json() as { records?: PlatformRecord[] };
        if (!Array.isArray(result.records)) throw new Error('The current workspace response could not be verified.');
        return result.records;
      }, act, () => !dirtyRef.current && !selectionRef.current.viewer && selectionRef.current.selected === expected.selected && selectionRef.current.focusId === expected.focusId);
      returnLock.current = false;
      navigate('campaigns', campaignFocus(saved.id, 'review'));
    } catch (cause) { setReturnError(cause instanceof Error ? cause.message : 'The release could not be saved to the campaign. Your agent is still here.'); }
    finally { returnLock.current = false; setReturnPending(false); }
  };

  if (handoffError) return <main className={`pc-page ${styles.page}`}><header className={styles.header}><div><h1>Campaign preparation unavailable</h1><p role="alert">{handoffError}</p></div></header><button type="button" className="pc-button" onClick={() => navigate('campaigns', handoff ? campaignFocus(handoff.campaignId, 'agent_content') : undefined)}>Return to campaign setup</button></main>;

  return <main className={`pc-page ${styles.page}`}>
    <header className={styles.header}>
      <div><h1>Voice agents</h1><p>Build, test and publish an agent in one workspace.</p></div>
      <button className="pc-button" type="button" disabled={viewer || busy} onClick={() => startNew()}><Plus size={16} aria-hidden="true"/> New agent</button>
    </header>
    {handoff && campaignContext && <section className={styles.campaignContext} aria-label="Campaign preparation">
      <div className={styles.campaignHeading}><div><h2>Agent for {campaignDisplayName(campaignContext.campaign)}</h2><p>{String(campaignContext.offering.data.name)} · {campaignContext.fields.goal}</p></div><button type="button" className="pc-button quiet" disabled={busy} onClick={() => navigate('campaigns', campaignFocus(handoff.campaignId, 'agent_content'))}><ArrowLeft size={15} aria-hidden="true"/> Return to campaign</button></div>
      {!current && !viewer && <details className={styles.campaignTemplate} open><summary>Review a campaign starting draft</summary><p>This task template uses the saved offering and goal. Copying it changes only the editable agent draft.</p><dl><div><dt>Purpose</dt><dd>{campaignAgentTemplate(records, handoff).objective}</dd></div><div><dt>Opening</dt><dd>{campaignAgentTemplate(records, handoff).openingMessage}</dd></div></dl><button type="button" className="pc-button" disabled={busy} onClick={useCampaignTemplate}>Use campaign starting draft</button></details>}
      {current && <div className={styles.campaignReturn}><div><strong>{activeRelease ? `Active version ${String(versions.find(version => version.id === activeRelease.data.versionId)?.data.number || '—')}` : 'Save, test and publish this agent'}</strong><p>{returnBlocker || (activeRelease ? 'Use this exact active release in the saved campaign, then review its brief and current eligibility.' : 'Open Publish for configuration checks and current release evidence. Publication is an explicit decision.')}</p></div>{activeRelease ? <button type="button" className="pc-button primary" disabled={busy || viewer || !!returnBlocker} onClick={() => void returnWithAgent()}>{returnPending ? 'Checking and returning…' : 'Return and use this agent'}</button> : <button type="button" className="pc-button" onClick={() => setSection('Publish')}>Review Publish</button>}</div>}
      {returnError && <p className={styles.error} role="alert">{returnError}</p>}
    </section>}
    <div className={styles.toolbar}>
      <label className={styles.picker}>Agent<select className="pc-select" value={selected || ''} disabled={busy} onChange={event => changeAgent(event.target.value || null)}>
        {!viewer && <option value="">New draft</option>}{viewer && !agents.length && <option value="">No agents available</option>}
        {agents.map(agent => <option key={agent.id} value={agent.id}>{String(agent.data.name)}</option>)}
      </select></label>
      <div className={styles.identity}><h2>{draft.name || 'New voice agent'}</h2><p role="status">{dirty ? 'Unsaved changes' : current ? `Saved draft · revision ${current.revision}` : 'Not saved yet'}{viewer ? ' · Read only' : ''}</p></div>
      <div className={styles.topActions}>
        {!viewer && <button className="pc-button" type="button" onClick={() => jumpTo('agent-test-call')}><FlaskConical size={16} aria-hidden="true"/> Test agent</button>}
        {!viewer && <button className="pc-button primary" type="button" disabled={busy || (!dirty && !!current && !sourcesChanged)} onClick={() => void save()}><Save size={16} aria-hidden="true"/> {busy ? 'Working…' : 'Save draft'}</button>}
      </div>
    </div>
    {viewer && <p className={styles.notice} role="status">Read-only access. An operator can edit, test and publish agents.</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.workspace}>
      <section className={styles.editor} id="agent-editor" tabIndex={-1} aria-label="Agent editor">
        <div className={styles.tabs} role="tablist" aria-label="Agent settings" onKeyDown={event => {
          const index = sections.indexOf(section);
          const next = event.key === 'ArrowRight' ? (index + 1) % sections.length : event.key === 'ArrowLeft' ? (index + sections.length - 1) % sections.length : event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault(); setSection(sections[next]); document.getElementById(tabId(sections[next]))?.focus();
        }}>{sections.map(item => <button type="button" role="tab" id={tabId(item)} aria-controls="agent-settings-panel" tabIndex={section === item ? 0 : -1} aria-selected={section === item} key={item} onClick={() => setSection(item)}>{item}</button>)}</div>
        <div id="agent-settings-panel" role="tabpanel" aria-labelledby={tabId(section)} className={styles.content}>
          {validation && <p id="agent-validation" role="alert" className={styles.error}>{validation}</p>}
          {section !== 'Publish' && <form id="agent-form" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
            <fieldset disabled={viewer || busy} className={styles.fields}>
              {section === 'Setup' && <>
                <div className={styles.sectionHead}><h3>Give your agent a clear job</h3><p>Set its name, role and purpose before testing a conversation.</p></div>
                {!current && !viewer && <div className={styles.templates}><span>Start with a task</span>{presets.map(preset => <button type="button" className="pc-button" key={preset.name} onClick={() => startNew(preset)}>{preset.name}</button>)}</div>}
                <label className="pc-field" htmlFor="agent-name">Agent name<input id="agent-name" className="pc-input" required maxLength={120} value={draft.name} onChange={event => set('name', event.target.value)} placeholder="Customer feedback assistant" {...fieldError('agent-name')}/></label>
                <label className="pc-field" htmlFor="agent-role">Role<input id="agent-role" className="pc-input" required maxLength={160} value={draft.role} onChange={event => set('role', event.target.value)} placeholder="Customer feedback representative" {...fieldError('agent-role')}/></label>
                <label className="pc-field" htmlFor="agent-objective">Purpose<textarea id="agent-objective" className="pc-textarea" required rows={4} maxLength={3000} value={draft.objective} onChange={event => set('objective', event.target.value)} placeholder="Describe what this agent should learn or help someone accomplish." {...fieldError('agent-objective')}/><small>At least 20 characters. Give the agent a specific outcome to work towards.</small></label>
                <div className={styles.sectionFooter}><button type="button" className="pc-button" onClick={() => setSection('Conversation')}>Continue to conversation</button></div>
              </>}
              {section === 'Conversation' && <>
                <div className={styles.sectionHead}><h3>Shape the conversation</h3><p>Write the agent’s instructions and the first words a customer hears.</p></div>
                <label className="pc-field" htmlFor="agent-system-prompt"><span className={styles.fieldHeading}>System prompt <small>{(draft.systemPrompt || '').length.toLocaleString()} / 12,000</small></span><textarea id="agent-system-prompt" className={`pc-textarea ${styles.prompt}`} maxLength={12000} rows={9} value={draft.systemPrompt || ''} onChange={event => set('systemPrompt', event.target.value)} placeholder="Ask one question at a time. Use approved sources for factual answers. Acknowledge corrections and uncertainty…" {...fieldError('agent-system-prompt')}/><small>Approved company context and safety instructions are added when a call starts.</small></label>
                <label className="pc-field" htmlFor="agent-opening-message"><span className={styles.fieldHeading}>Opening message <small>Optional · {(draft.openingMessage || '').length} / 1,000</small></span><textarea id="agent-opening-message" className="pc-textarea" rows={3} maxLength={1000} value={draft.openingMessage || ''} onChange={event => set('openingMessage', event.target.value)} placeholder="Hello, I’m an AI assistant with the team. Is now a good time to talk?" {...fieldError('agent-opening-message')}/></label>
                <label className="pc-field" htmlFor="agent-disclosure">AI introduction<textarea id="agent-disclosure" className="pc-textarea" required rows={2} maxLength={500} value={draft.disclosure} onChange={event => set('disclosure', event.target.value)} {...fieldError('agent-disclosure')}/><small>Must clearly identify the agent as AI before a customer conversation.</small></label>
                <label className="pc-field" htmlFor="agent-style">Conversation style<textarea id="agent-style" className="pc-textarea" required rows={3} value={draft.responseStyle} onChange={event => set('responseStyle', event.target.value)} {...fieldError('agent-style')}/></label>
              </>}
              {section === 'Voice & language' && <>
                <div className={styles.sectionHead}><h3>Voice and language</h3><p>Choose how the agent speaks, then check it in a test call.</p></div>
                <label className="pc-field" htmlFor="agent-voice">Voice profile<select id="agent-voice" className="pc-select" value={draft.voiceProfile || 'provider-default'} onChange={event => set('voiceProfile', event.target.value as AgentConfig['voiceProfile'])}><option value="provider-default">Azure workspace voice</option><option value="maya-despina">Maya original · Gemini Despina</option></select><small>{draft.voiceProfile === 'maya-despina' ? 'Uses the configured free Gemini pool and the source Despina preset.' : 'Uses the voice configured for your Azure workspace.'}</small></label>
                <div className={styles.pair}><label className="pc-field" htmlFor="agent-language">Primary language<input id="agent-language" className="pc-input" required value={draft.primaryLanguage} onChange={event => set('primaryLanguage', event.target.value)}/></label><label className="pc-field" htmlFor="agent-languages">Allowed languages<input id="agent-languages" className="pc-input" value={languagesText} onChange={event => { setLanguagesText(event.target.value); set('allowedLanguages', values(event.target.value)); }} {...fieldError('agent-languages')}/><small>Separate languages with commas.</small></label></div>
                <div className={styles.vocabulary}><label className={styles.fieldHeading} htmlFor="agent-speech-vocabulary">Speech vocabulary <small>{draft.speechVocabulary?.length || 0} / {MAX_SPEECH_VOCABULARY_TERMS} terms</small></label><p id="agent-speech-vocabulary-help">Optional spelling hints for company names, products and acronyms. Add one term per line.</p><textarea id="agent-speech-vocabulary" className="pc-textarea" rows={5} maxLength={4096} value={vocabularyText} aria-invalid={!!vocabularyError} aria-describedby={`agent-speech-vocabulary-help${vocabularyError ? ' agent-speech-vocabulary-error' : ''}`} placeholder={'Northstar Learning\nIELTS\nपुणे'} onChange={event => {
                  const text = event.target.value; const terms = text.split(/\r?\n/).map(term => term.trim()).filter(Boolean);
                  setVocabularyText(text); set('speechVocabulary', terms);
                  if (vocabularyError) { try { normalizeSpeechVocabulary(terms); setVocabularyError(''); } catch (error) { setVocabularyError(error instanceof Error ? error.message : 'Review the speech vocabulary.'); } }
                }}/>{vocabularyError && <p id="agent-speech-vocabulary-error" role="alert" className={styles.error}>{vocabularyError}</p>}<p>Keep customer personal data out. Hints are saved in agent versions and public voice releases. They do not add company facts or change the voice.</p>{draft.voiceProfile === 'maya-despina' && <p>The Maya profile saves these terms, but transcription hints currently apply to Azure calls.</p>}</div>
              </>}
              {section === 'Knowledge' && <>
                <div className={styles.sectionHead}><h3>Attach approved company knowledge</h3><p>Choose the sources this agent can reference. Changed sources need fresh release checks.</p></div>
                {sourcesChanged && <p className={styles.notice}>An attached source changed. Review it, save the draft and run checks in Publish.</p>}
                <fieldset className={styles.sourceList} id="agent-source-review" tabIndex={-1}><legend>Company sources · {draft.knowledgeIds.length} selected</legend>
                  {approvedSources.map(source => <label className={styles.checkRow} key={source.id}><input type="checkbox" checked={draft.knowledgeIds.includes(source.id)} onChange={event => set('knowledgeIds', event.target.checked ? [...draft.knowledgeIds, source.id] : draft.knowledgeIds.filter(id => id !== source.id))}/><span><strong>{String(source.data.title)}</strong><small>Approved company source</small></span></label>)}
                  {!approvedSources.length && <p className={styles.empty}>There are no approved sources yet. Add and review company material in Company brain, then attach it here.</p>}
                  {draft.knowledgeIds.filter(id => !approvedSources.some(source => source.id === id)).map(id => <div className={styles.missingSource} key={id}><p>A previously attached source is no longer approved.</p><button className="pc-button" type="button" onClick={() => set('knowledgeIds', draft.knowledgeIds.filter(sourceId => sourceId !== id))}>Remove source</button></div>)}
                </fieldset>
              </>}
              {section === 'Behaviour & actions' && <>
                <div className={styles.sectionHead}><h3>Set memory, handoff and actions</h3><p>Keep the agent’s authority clear and give people a route to human help.</p></div>
                <label className="pc-field" htmlFor="agent-memory">Relationship memory<select id="agent-memory" className="pc-select" value={draft.memoryScope} onChange={event => set('memoryScope', event.target.value as AgentConfig['memoryScope'])}><option value="approved_contact">Approved memory for this customer only</option><option value="none">No relationship memory</option></select></label>
                <label className="pc-field" htmlFor="agent-escalation">When to offer human help<textarea id="agent-escalation" className="pc-textarea" rows={3} required value={draft.escalation} onChange={event => set('escalation', event.target.value)} {...fieldError('agent-escalation')}/></label>
                <fieldset className={styles.sourceList}><legend>In-call actions</legend><p>Enable only what this agent needs. A test call does not verify the caller’s identity.</p>{actions.map(action => <label className={styles.checkRow} key={action.name}><input type="checkbox" checked={normalizeVoiceTools(draft.enabledTools).includes(action.name)} onChange={event => { const enabled = normalizeVoiceTools(draft.enabledTools); set('enabledTools', event.target.checked ? [...enabled, action.name] : enabled.filter(name => name !== action.name)); }}/><span><strong>{action.title}</strong><small>{action.description}</small></span></label>)}<p>Follow-up requests remain pending for human review. The agent cannot book, send or transfer on your behalf.</p></fieldset>
              </>}
            </fieldset>
          </form>}
          {section === 'Publish' && <>
            <AgentReleasePanel key={current?.id || 'new'} agent={current} records={records} dirty={dirty} busy={busy} viewer={viewer} act={act} navigate={navigate}/>
            {current && <details className={styles.details}>
              <summary>Version history · {agentVersions.length}</summary>
              <p>Versions are immutable snapshots used for release checks. Test calls can use the current draft.</p>
              {latestConfig && <p>Compared with version {String(agentVersions[0].data.number)}: {changed.length ? changed.join(', ') : 'no setting differences'}.</p>}
              {!agentVersions.length && <p>No versions yet. Create one when you run release checks.</p>}
              {agentVersions.map(version => <div className={styles.versionRow} key={version.id}><GitBranch size={16} aria-hidden="true"/><span><strong>Version {String(version.data.number)}</strong><small>{new Date(version.createdAt).toLocaleString()}</small></span><span className="pc-badge">{version.status}</span></div>)}
            </details>}
          </>}
          <div hidden={section !== 'Conversation'} className={styles.revision}><AgentRevision agent={current} dirty={dirty} viewer={viewer} proposals={records} onApplied={async () => { await act('workspace.refresh'); }}/></div>
          <div hidden={section !== 'Voice & language'}>{!viewer && <details className={styles.details}><summary>Personal Voice enrollment</summary><VoiceCloningPanel/></details>}</div>
        </div>
      </section>
      <aside id="agent-test-call" tabIndex={-1} className={styles.testDock} aria-label="Test current agent draft">
        <div className={styles.dockHeading}><span>Test current draft</span><button type="button" className="pc-button quiet" onClick={() => jumpTo('agent-editor')}><ArrowLeft size={14} aria-hidden="true"/> Back to editor</button></div>
        {viewer ? <p className={styles.empty}>Operator access is required to test calls.</p> : <VoiceStudio contacts={workspace.contacts.map(contact => ({ id: contact.id, name: String(contact.name || contact.id) }))} onSaved={() => { void act('workspace.refresh'); }} preview={{ draft, agentId: current?.id }}/>}
      </aside>
    </div>
  </main>;
}
