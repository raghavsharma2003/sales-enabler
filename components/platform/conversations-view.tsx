'use client';

import { useEffect, useMemo, useState } from 'react';
import { Headphones, MessageSquare, Search } from 'lucide-react';
import { VoiceStudio } from '../voice-studio';
import { VoiceRuntimeEvidence } from '../voice-runtime-evidence';
import { ConversationLearning } from '../conversation-learning';
import { CampaignResults } from '../campaign-results';
import { PublicVoiceEvidence } from '../public-voice-evidence';
import type { PlatformViewProps } from '../../lib/platform/contracts';
import { normalizeVoiceTools, type VoiceToolName } from '../../lib/voice/tools/contracts';
import type { VoiceRuntimeDiagnostics } from '../../lib/voice/diagnostics';

type Turn = { role: 'user' | 'assistant'; text: string; receivedAt?: string; timestamp?: string };
const date = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Time unavailable';
const unverified = (session?: Record<string, unknown>) => !!session && ['public_voice', 'public_chat', 'channel_chat'].includes(String(session.source));
const textConversation = (session: Record<string, unknown>) => ['public_chat', 'channel_chat'].includes(String(session.source));
const channelName = (session: Record<string, unknown>) => session.channel === 'telegram' ? 'Telegram' : session.channel === 'whatsapp' ? 'WhatsApp' : 'Channel';
function sourceLabel(session: Record<string, unknown>) {
  if (session.source === 'public_voice') return 'Public voice';
  if (session.source === 'public_chat') return 'Public chat';
  if (session.source === 'channel_chat') return `${channelName(session)} chat`;
  return session.source === 'browser_preview' ? 'Draft preview' : session.source === 'browser_voice' ? 'Released browser agent' : 'Browser submitted';
}
function participantLabel(session: Record<string, unknown>, contactName?: string) {
  if (session.source === 'public_voice' || session.source === 'public_chat') return 'Anonymous visitor';
  if (session.source === 'channel_chat') return `Unverified ${channelName(session)} account`;
  return contactName || 'Unlinked conversation';
}
const eventTime = (turn?: Turn) => turn?.receivedAt || turn?.timestamp;
function ConversationSource({ session, linkedContact }: { session: Record<string, unknown>; linkedContact: boolean }) {
  const identity = session.source === 'channel_chat' ? 'Platform account · identity unverified; no verified customer link.'
    : session.source === 'public_chat' || session.source === 'public_voice' ? 'Anonymous visitor · no verified customer link.'
      : linkedContact ? 'Linked customer record · this transcript does not verify participant identity.' : 'No linked customer record.';
  const timing = session.source === 'channel_chat' ? 'Message times come from provider events or server processing. Provider acceptance does not prove delivery or reading.'
    : session.source === 'public_voice' ? 'Times are server transcript receipt times; they do not verify when speech occurred.'
      : session.source === 'public_chat' ? 'Times are server transcript receipt times.' : 'Times are browser transcript receipt times; they do not verify when speech occurred.';
  return <><p className="pc-muted">{identity}</p><details className="wb-history"><summary>Conversation source</summary><p>{typeof session.transcriptSource === 'string' ? session.transcriptSource : 'Browser-submitted transcript; capture details were not recorded.'}</p><p className="pc-muted">{timing}</p>{typeof session.title === 'string' && <div className="wb-context-line"><span>Published assistant</span><strong>{session.title}</strong></div>}{typeof session.deploymentId === 'string' && <div className="wb-context-line"><span>Deployment record</span><strong style={{ overflowWrap: 'anywhere' }}>{session.deploymentId}</strong></div>}{typeof session.channelThreadId === 'string' && <div className="wb-context-line"><span>Channel conversation</span><strong style={{ overflowWrap: 'anywhere' }}>{session.channelThreadId}</strong></div>}{typeof (session.responseState || session.outcome) === 'string' && <div className="wb-context-line"><span>Recorded state</span><strong>{String(session.responseState || session.outcome).replaceAll('_', ' ')}</strong></div>}</details>{typeof session.unconfirmedAttemptedReply === 'string' && <details className="wb-history"><summary>Unconfirmed reply attempt</summary><p className="pc-muted">This attempted reply has no confirmed provider acceptance. It is separate from the saved conversation and does not prove delivery.</p><p style={{ whiteSpace: 'pre-wrap' }}>{session.unconfirmedAttemptedReply}</p></details>}</>;
}
const actionLabels: Record<VoiceToolName, string> = { search_company_knowledge: 'Company knowledge', recall_customer_context: 'Customer context', request_follow_up: 'Follow-up request' };
function SavedCallActions({ session }: { session: Record<string, unknown> }) {
  const hasScope = Array.isArray(session.enabledTools);
  const enabled = normalizeVoiceTools(session.enabledTools);
  const receipts = Array.isArray(session.toolReceipts) ? session.toolReceipts.filter((receipt): receipt is Record<string, unknown> => !!receipt && typeof receipt === 'object' && !Array.isArray(receipt)) : [];
  const diagnostic = session.diagnostics && typeof session.diagnostics === 'object' && !Array.isArray(session.diagnostics) ? session.diagnostics as Partial<VoiceRuntimeDiagnostics> : null;
  if (!hasScope && !receipts.length && !diagnostic) return null;
  return <details className="wb-history"><summary>Actions &amp; call diagnostics · {receipts.length} server {receipts.length === 1 ? 'receipt' : 'receipts'}</summary><p className="pc-muted">Action receipts come from the server call record. A follow-up is a pending internal proposal, not a completed handoff or verified customer request.</p>{hasScope && <div className="wb-context-line"><span>Enabled for this call</span><strong>{enabled.length ? enabled.map(name => actionLabels[name]).join(', ') : 'None'}</strong></div>}{receipts.length ? <ol className="wb-tool-trace">{receipts.map((receipt, index) => { const result = receipt.result && typeof receipt.result === 'object' && !Array.isArray(receipt.result) ? receipt.result as Record<string, unknown> : receipt; const name = normalizeVoiceTools([result.name || receipt.name])[0]; return <li key={String(receipt.id || receipt.requestId || index)}><span><strong>{name ? actionLabels[name] : 'Action request'}</strong><small>{date(receipt.createdAt || receipt.receivedAt)}</small></span><span className="wb-tool-state">{result.status === 'awaiting_review' ? 'Awaiting review' : result.status === 'available' ? 'Available' : 'Unavailable'}</span>{typeof result.message === 'string' && <p>{result.message}</p>}{typeof result.actionId === 'string' && <small>Internal action · {result.actionId}</small>}</li>; })}</ol> : <p className="wb-empty-inline">No server action receipts for this call.</p>}{diagnostic?.measurement === 'client_observed_events' && <div className="wb-diagnostics"><h4>Browser event measurements</h4><div className="wb-context-line"><span>Connection ready</span><strong>{typeof diagnostic.clientObservedConnectMs === 'number' ? `${diagnostic.clientObservedConnectMs} ms` : 'No measurement'}</strong></div><div className="wb-context-line"><span>Turn to first output</span><strong>{Array.isArray(diagnostic.clientObservedTurnMs) && diagnostic.clientObservedTurnMs.length ? `${diagnostic.clientObservedTurnMs.at(-1)} ms · latest of ${diagnostic.clientObservedTurnMs.length} measured` : 'No measurement'}</strong></div><p>Browser receipt timing only; it does not measure audible response or end-to-end latency.</p></div>}</details>;
}

export function ConversationsView({ records, workspace, act, busy, navigate, focusId }: PlatformViewProps) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(focusId || '');
  const [handledFocusId, setHandledFocusId] = useState(focusId);
  const [showStudio, setShowStudio] = useState(false);
  const [proposal, setProposal] = useState<'memory' | 'action' | ''>('');
  const [proposalText, setProposalText] = useState('');
  const [proposalError, setProposalError] = useState('');
  const [proposalBusy, setProposalBusy] = useState(false);
  const [sourceTurn, setSourceTurn] = useState<number | null>(null);
  useEffect(() => {
    setHandledFocusId(focusId);
    if (!focusId) return;
    setSelectedId(focusId); setQuery('');
    setProposal(''); setProposalText(''); setSourceTurn(null); setProposalError('');
  }, [focusId]);
  const canOperate = workspace.user.role !== 'viewer';
  const contacts = workspace.contacts.map(c => ({ id: c.id, name: String(c.name || 'Unnamed contact') }));
  const releases = records.filter(r => r.kind === 'release' && r.status === 'active' && r.data.channel === 'browser').map(r => {
    const version = records.find(v => v.kind === 'agent_version' && v.id === r.data.versionId);
    const agent = records.find(a => a.kind === 'agent_definition' && a.id === r.data.agentId);
    return { id: r.id, agentId: String(r.data.agentId), versionId: String(r.data.versionId), label: `${String(agent?.data.name || 'Representative')} · v${String(version?.data.number || '?')}` };
  });
  const sessions = useMemo(() => workspace.sessions.filter(session => {
    const contact = contacts.find(c => c.id === session.contactId);
    const haystack = `${participantLabel(session, contact?.name)} ${sourceLabel(session)} ${session.title || ''} ${session.summary || ''} ${(Array.isArray(session.transcript) ? session.transcript as Turn[] : []).map(t => t.text).join(' ')}`.toLowerCase();
    return haystack.includes(query.toLowerCase().trim());
  }), [workspace.sessions, query, contacts]);
  const pendingFocus = focusId !== handledFocusId;
  const effectiveSelectedId = pendingFocus && focusId ? focusId : selectedId;
  const exactFocus = !!focusId && effectiveSelectedId === focusId && (pendingFocus || !query.trim());
  // An explicit link must never silently open a different person's conversation.
  const selected = exactFocus ? workspace.sessions.find(session => session.id === effectiveSelectedId) : sessions.find(session => session.id === effectiveSelectedId) || sessions[0];
  const missingFocusedSession = exactFocus && !selected;
  const selectedContact = contacts.find(c => c.id === selected?.contactId);
  const unverifiedParticipant = unverified(selected);
  const transcript = Array.isArray(selected?.transcript) ? selected.transcript as Turn[] : [];
  async function saveProposal() {
    if (!selected || !proposal || !proposalText.trim() || proposalBusy || !canOperate || unverifiedParticipant || pendingFocus) return;
    setProposalBusy(true); setProposalError('');
    try {
      if (proposal === 'memory' && !selectedContact) throw new Error('Select a conversation linked to a customer.');
      const excerpt = sourceTurn === null ? '' : transcript[sourceTurn]?.text || '';
      if (!excerpt) throw new Error('Choose a transcript turn as source evidence.');
      if (proposal === 'memory' && transcript[sourceTurn!].role !== 'user') throw new Error('A customer memory needs a person’s statement as its source.');
      const source = `Session ${selected.id}, turn ${sourceTurn! + 1} (${transcript[sourceTurn!].role}), recorded ${eventTime(transcript[sourceTurn!]) || 'time unavailable'}: ${excerpt.slice(0, 650)}`;
      const body = proposal === 'memory'
        ? { contactId: selected.contactId, content: proposalText.trim(), source, status: 'proposed' }
        : { contactId: selected.contactId || undefined, title: proposalText.trim().slice(0, 200), description: source, status: 'proposed' };
      await act(proposal === 'memory' ? 'memory.create' : 'action.create', body);
      setProposal(''); setProposalText('');
      setSourceTurn(null);
    } catch (error) { setProposalError(error instanceof Error ? error.message : 'Could not save the proposal.'); }
    finally { setProposalBusy(false); }
  }
  return <main className="pc-page">
    <header className="pc-pagehead"><div><h1>Conversations</h1><p className="pc-muted">Review saved browser, public and channel conversations with their capture source and participant scope.</p></div><button className="pc-button primary" type="button" disabled={!canOperate || busy} onClick={() => setShowStudio(v => !v)}><Headphones size={16}/> {showStudio ? 'Close browser studio' : 'Open browser studio'}</button></header>
    {showStudio && canOperate && <section className="pc-panel" style={{ marginBottom: 24 }}><VoiceStudio contacts={contacts} releases={releases} onSaved={() => { void act('workspace.refresh'); }} /></section>}
    <div className="pc-split"><aside className="pc-panel"><h2>Saved sessions</h2><label className="pc-field"><span className="pc-muted">Search conversations</span><span style={{ position: 'relative' }}><Search size={15} style={{ position: 'absolute', top: 13, left: 12 }}/><input className="pc-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="Participant, channel or transcript" style={{ paddingLeft: 35 }}/></span></label><div className="pc-list">{sessions.map(session => {
      const contact = contacts.find(c => c.id === session.contactId);
      return <button className="pc-row" type="button" key={session.id} aria-current={selected?.id === session.id ? 'true' : undefined} onClick={() => { setSelectedId(session.id); setProposal(''); setProposalText(''); setSourceTurn(null); setProposalError(''); }}><MessageSquare size={17}/><span><strong>{participantLabel(session, contact?.name)}</strong><small className="pc-muted">{sourceLabel(session)} · {date(session.createdAt)}</small></span></button>;
    })}</div>{sessions.length === 0 && <p className="pc-empty">No saved conversation matches this search.</p>}</aside>
    <section className="pc-panel">{selected ? <><div className="pc-pagehead"><div><p className="pc-muted">{date(selected.createdAt)}</p><h2>{participantLabel(selected, selectedContact?.name)}</h2></div><span className="pc-badge">{sourceLabel(selected)}</span></div><p className="pc-muted">{selected.source === 'browser_preview' ? 'Internal draft test · server snapshot retained' : selected.agentVersionId ? `Agent version ${String(selected.agentVersionId).slice(0, 8)}${selected.releaseId ? ` · release ${String(selected.releaseId).slice(0, 8)}` : ''}` : 'Legacy session · agent version unavailable'} · {String(selected.provider || 'Unknown provider')} · {textConversation(selected) ? 'Text conversation' : selected.inputMode === 'text' ? 'Listen & type' : selected.inputMode === 'microphone' ? 'Microphone' : 'Input mode not recorded'}</p><ConversationSource session={selected} linkedContact={!!selectedContact}/>{selected.source === 'browser_preview' && selected.previewConfig && typeof selected.previewConfig === 'object' ? <details className="wb-history"><summary>View tested prompt</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{String((selected.previewConfig as Record<string, unknown>).systemPrompt || 'No custom system prompt.')}</pre></details> : null}{selected.source === 'public_voice' && <PublicVoiceEvidence source={selected.source} evidence={selected.voiceEvidence}/>}<VoiceRuntimeEvidence evidence={selected.runtimeEvidence}/><SavedCallActions session={selected}/>{selected.source === 'browser_voice' && typeof selected.campaignRunId === 'string' && <CampaignResults key={`results:${selected.id}`} sessionId={selected.id} turns={transcript}/>}<div role="log" aria-label="Saved transcript">{transcript.map((turn, index) => <div key={index} className="pc-row" style={{ alignItems: 'flex-start' }}><span className="pc-badge">{turn.role === 'assistant' ? 'AI' : 'Person'}</span><span><small className="pc-muted">{date(eventTime(turn))}</small><p style={{ whiteSpace: 'pre-wrap', margin: '6px 0' }}>{turn.text}</p>{proposal && canOperate && !unverifiedParticipant && (proposal === 'action' || turn.role === 'user') && <button className="pc-button quiet" type="button" onClick={() => { setSourceTurn(index); setProposalText(turn.text.slice(0, proposal === 'memory' ? 10000 : 200)); }}>Use turn as source</button>}</span></div>)}</div>{transcript.length === 0 && <p className="pc-empty">No transcript was saved for this session.</p>}<ConversationLearning key={selected.id} sessionId={selected.id} feedbackOnly={unverifiedParticipant} readOnly={!canOperate} onRefresh={async () => { await act('workspace.refresh'); }}/><p className="pc-muted">{unverifiedParticipant ? 'Unverified participants support conversation feedback only. Customer memories and follow-up proposals require a linked customer record.' : 'Review the source and exact participant statement before creating a proposal.'}</p><div className="pc-row"><button className="pc-button" type="button" disabled={!selectedContact || unverifiedParticipant || !canOperate || busy} onClick={() => { setProposal('memory'); setProposalText(''); setSourceTurn(null); }}>Propose memory</button><button className="pc-button" type="button" disabled={unverifiedParticipant || !canOperate || busy} onClick={() => { setProposal('action'); setProposalText(''); setSourceTurn(null); }}>Propose follow-up</button>{selectedContact && !unverifiedParticipant && <button className="pc-button" type="button" onClick={() => navigate('customers')}>Open customer journey</button>}</div>{proposal && canOperate && !unverifiedParticipant && <div className="pc-form" style={{ marginTop: 18 }}><p className="pc-muted">Choose a transcript turn above, then edit the proposed {proposal === 'memory' ? 'customer fact' : 'manual follow-up'}. It remains pending human approval.</p>{sourceTurn !== null && <p className="pc-muted">Source: turn {sourceTurn + 1} · {date(eventTime(transcript[sourceTurn]))}</p>}<label className="pc-field">{proposal === 'memory' ? 'Memory to review' : 'Follow-up title'}<textarea className="pc-textarea" value={proposalText} maxLength={proposal === 'memory' ? 10000 : 200} onChange={e => setProposalText(e.target.value)}/></label>{proposalError && <p role="alert">{proposalError}</p>}<div className="pc-row"><button className="pc-button primary" type="button" disabled={proposalBusy || !proposalText.trim() || sourceTurn === null} onClick={() => void saveProposal()}>{proposalBusy ? 'Saving…' : 'Save proposal'}</button><button className="pc-button" type="button" onClick={() => setProposal('')}>Cancel</button></div></div>}</> : <div className="pc-empty"><MessageSquare size={25}/><p>{missingFocusedSession ? 'The requested conversation is not available in this workspace. Select another saved conversation from the list.' : 'Saved browser, public and channel conversations appear here.'}</p></div>}</section></div>
  </main>;
}
