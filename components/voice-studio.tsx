"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Activity, ArrowRight, Check, Download, Headphones, Mic, MicOff, Send, Square, UserRound } from "lucide-react";
import { createBrowserVoiceSession, type BrowserVoiceSession } from "@/lib/voice/browser-session";
import type { AgentConfig } from "@/lib/platform/agents";
import type { RelationshipContext } from "@/lib/voice/relationship";
import type { TranscriptEntry, VoiceConfiguration, VoiceBehaviorContext } from "@/lib/voice/contracts";
import { analyzeConversation } from "@/lib/voice/emotional";
import { compileRelationalRuntime } from "@/lib/voice/relational-runtime";
import { createVoiceStartGate } from "@/lib/voice/start-gate";
import { normalizeVoiceTools, type VoiceToolName } from "@/lib/voice/tools/contracts";
import type { VoiceRuntimeDiagnostics } from "@/lib/voice/diagnostics";
import type { ContinuousUnderstandingSnapshot } from "@/lib/voice/continuous-understanding";
import { resolveSpeechDelivery } from "@/lib/voice/speech-delivery";
import { VoiceTimingEvidence } from "@/components/voice-timing-evidence";
import { ContinuousUnderstanding, type ContinuousUnderstandingStatus } from "@/components/continuous-understanding";

export interface VoiceStudioProps {
  contacts: { id: string; name: string }[];
  releases?: { id: string; agentId: string; versionId: string; label: string }[];
  onSaved: () => void;
  contactId?: string;
  preview?: { draft: AgentConfig; agentId?: string };
  campaignRunId?: string;
  onActiveChange?: (active: boolean) => void;
  lockContactSelection?: boolean;
}

type ContextPreview = { omittedKnowledgeCount?: number; omittedMemoryCount?: number; instructions: string; contextDigest?: string; knowledgeSources?: { id: string; title: string }[]; relationship?: RelationshipContext; error?: string };
type InspectorTab = "Transcript" | "Live understanding" | "EmotionalOS" | "RelationalOS" | "Context";
const inspectorTabs: InspectorTab[] = ["Transcript", "Live understanding", "EmotionalOS", "RelationalOS", "Context"];
const clock = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const toolLabels: Record<VoiceToolName, string> = { search_company_knowledge: "Company knowledge", recall_customer_context: "Customer context", request_follow_up: "Follow-up request" };
type ToolTrace = { id: string; name: VoiceToolName; phase: "requested" | "result"; status?: "available" | "not_available" | "awaiting_review"; message?: string; actionId?: string; receivedAt: string };

export function VoiceStudio({ contacts, releases = [], onSaved, contactId, preview, campaignRunId, onActiveChange, lockContactSelection = false }: VoiceStudioProps) {
  const [config, setConfig] = useState<VoiceConfiguration | null>(null);
  const [configError, setConfigError] = useState("");
  const [selectedContact, setSelectedContact] = useState(contactId || "");
  const [selectedRelease, setSelectedRelease] = useState("");
  const release = releases.find(item => item.id === selectedRelease) || (releases.length === 1 ? releases[0] : undefined);
  const [consent, setConsent] = useState(false);
  const [inputMode, setInputMode] = useState<"microphone" | "text">("microphone");
  const [callInputMode, setCallInputMode] = useState<"microphone" | "text">("microphone");
  const [continuousSpeech, setContinuousSpeech] = useState(false);
  const [callContinuousSpeech, setCallContinuousSpeech] = useState(false);
  const [continuousSpeechStatus, setContinuousSpeechStatus] = useState<ContinuousUnderstandingStatus | null>(null);
  const [continuousUnderstanding, setContinuousUnderstanding] = useState<ContinuousUnderstandingSnapshot | null>(null);
  const [typedMessage, setTypedMessage] = useState("");
  const [connectingFor, setConnectingFor] = useState(0);
  const [state, setState] = useState<"idle" | "connecting" | "live" | "ended">("idle");
  const [activity, setActivity] = useState("listening");
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioLevel, setAudioLevel] = useState<number | null>(null);
  const [diagnostics, setDiagnostics] = useState<VoiceRuntimeDiagnostics | null>(null);
  const [toolTrace, setToolTrace] = useState<ToolTrace[]>([]);
  const [callTools, setCallTools] = useState<VoiceToolName[]>([]);
  const [inspector, setInspector] = useState<InspectorTab>("Transcript");
  const inspectorId = useId();
  const [compiled, setCompiled] = useState<ContextPreview | null>(null);
  const [compiledError, setCompiledError] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [callContext, setCallContext] = useState<ContextPreview | null>(null);
  const [callDraftSnapshot, setCallDraftSnapshot] = useState("");
  const connection = useRef<BrowserVoiceSession | null>(null);
  const startGate = useRef(createVoiceStartGate());
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const itemOrder = useRef<string[]>([]);
  const sessionKey = useRef("");
  const sessionRelease = useRef<{ id: string; agentId: string; versionId: string } | null>(null);
  const sessionPreviewId = useRef<string | null>(null);
  const sessionConnectionId = useRef<string | null>(null);
  const [callBehaviorContext, setCallBehaviorContext] = useState<VoiceBehaviorContext | null>(null);
  const sessionContact = useRef("");
  const callStarted = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const behaviorSent = useRef("");
  const live = state === "live" || state === "connecting";
  const continuousSpeechAvailable = config?.provider === "azure" && config.continuousSpeech?.configured === true;
  const activeChange = useRef(onActiveChange);
  activeChange.current = onActiveChange;
  const unsaved = transcript.length > 0 && !saved;
  const controlledContact = lockContactSelection && contactId && contacts.some(item => item.id === contactId) ? contactId : "";
  const contactSelectionBusy = live || unsaved || saving;
  const controlledContactPending = lockContactSelection && selectedContact !== controlledContact;
  const campaignContactReady = !!selectedContact && contacts.some(item => item.id === selectedContact) && (!lockContactSelection || selectedContact === controlledContact);
  const analysis = useMemo(() => analyzeConversation(transcript), [transcript]);
  const previewIsReady = !!preview?.draft.name.trim() && !!preview.draft.role.trim() && preview.draft.objective.trim().length >= 20 && preview.draft.escalation.trim().length >= 15 && !!preview.draft.responseStyle.trim() && /\b(ai|artificial intelligence|virtual assistant)\b/i.test(preview.draft.disclosure) && preview.draft.allowedLanguages.includes(preview.draft.primaryLanguage);
  const displayedContext = callContext && state !== "idle" ? callContext : callBehaviorContext ? { instructions: "", relationship: callBehaviorContext.relationship } : compiled;
  const draftChangedAfterCall = !!preview && !!callDraftSnapshot && JSON.stringify(preview.draft) !== callDraftSnapshot;

  const voiceProfile = preview?.draft.voiceProfile || "provider-default";
  const runtimeSettings = callDraftSnapshot ? JSON.parse(callDraftSnapshot) as AgentConfig : preview?.draft;
  const relationalRuntime = useMemo(() => compileRelationalRuntime({ entries: transcript, relationship: callBehaviorContext?.relationship || displayedContext?.relationship, settings: callBehaviorContext?.settings || runtimeSettings, callId: sessionKey.current || "current-call" }), [transcript, displayedContext?.relationship, callDraftSnapshot, preview?.draft, callBehaviorContext]);
  const displayedSpeechDelivery = state === "idle" ? voiceProfile === "provider-default" ? preview?.draft.speechDelivery : undefined : state === "connecting" ? undefined : callBehaviorContext?.speechDelivery || runtimeSettings?.speechDelivery;
  const speechDeliveryDecision = useMemo(() => displayedSpeechDelivery ? resolveSpeechDelivery(displayedSpeechDelivery, transcript) : undefined, [displayedSpeechDelivery, transcript]);

  useEffect(() => { if (live) return;
    const abort = new AbortController();
    setConfig(null); setConfigError("");
    const query = preview ? `profile=${encodeURIComponent(voiceProfile)}` : release ? `releaseId=${encodeURIComponent(release.id)}` : "";
    fetch(`/api/voice/config?${query}`, { cache: "no-store", signal: abort.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load voice settings."); setConfig(data); })
      .catch(error => { if (!abort.signal.aborted) setConfigError(error instanceof Error ? error.message : "Could not load voice settings."); });
    return () => { abort.abort(); };
  }, [voiceProfile, release?.id, !!preview, live]);
  useEffect(() => { activeChange.current?.(live); }, [live]);
  useEffect(() => () => { startGate.current.cancel(); connection.current?.close(); connection.current = null; activeChange.current?.(false); }, []);
  useEffect(() => { if (!live && config && !continuousSpeechAvailable) setContinuousSpeech(false); }, [config, continuousSpeechAvailable, live]);
  useEffect(() => {
    if (!lockContactSelection || contactSelectionBusy) return;
    setSelectedContact(controlledContact);
  }, [lockContactSelection, controlledContact, contactSelectionBusy]);

  useEffect(() => {
    if (!preview || !previewIsReady) { setCompiled(null); setCompiledError(""); setCompiling(false); return; }
    if (live) return;
    const abort = new AbortController();
    setCompiled(null);
    setCompiling(false);
    setCompiledError("");
    const timeout = window.setTimeout(async () => {
      setCompiling(true); setCompiledError("");
      try {
        const response = await fetch("/api/voice/preview", { method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal, body: JSON.stringify({ draft: preview.draft, agentId: preview.agentId, contactId: selectedContact || undefined }) });
        const result = await response.json() as ContextPreview;
        if (!response.ok) throw new Error(result.error || "Could not inspect this draft.");
        setCompiled(result);
      } catch (cause) { if (!abort.signal.aborted) { setCompiled(null); setCompiledError(cause instanceof Error ? cause.message : "Could not inspect this draft."); } }
      finally { if (!abort.signal.aborted) setCompiling(false); }
    }, 500);
    return () => { window.clearTimeout(timeout); abort.abort(); };
  }, [preview?.draft, preview?.agentId, previewIsReady, selectedContact, live]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    if (unsaved || live) window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [unsaved, live]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [transcript]);
  useEffect(() => {
    if (state !== "live") return;
    const interval = window.setInterval(() => { if (callStarted.current) setElapsed(Math.floor((Date.now() - callStarted.current) / 1000)); }, 1000);
    return () => window.clearInterval(interval);
  }, [state]);
  useEffect(() => {
    if (state !== "connecting") { setConnectingFor(0); return; }
    const began = Date.now();
    const interval = window.setInterval(() => setConnectingFor(Math.floor((Date.now() - began) / 1000)), 1000);
    return () => window.clearInterval(interval);
  }, [state]);

  function end(human = false) {
    connection.current?.close(); connection.current = null;
    startGate.current.cancel();
    setState("ended"); setMuted(false); setAudioLevel(null);
    setContinuousSpeechStatus(previous => callContinuousSpeech ? { state: "ended", reason: previous?.reason } : null);
    setContinuousUnderstanding(previous => previous ? { ...previous, phase: "ended", bound: false, latest: undefined, cues: undefined } : null);
    setNotice(human ? "AI stopped. A staff member can continue separately; no live transfer was made." : "Call ended. Review the available transcript before saving.");
  }

  async function start() {
    if (!config?.configured || !config.provider || (!preview && !release) || (preview && !previewIsReady) || (campaignRunId && (preview || !campaignContactReady)) || !consent || live || unsaved) return;
    const attempt = startGate.current.begin();
    const useContinuousSpeech = continuousSpeech && inputMode === "microphone" && config.provider === "azure" && !!config.continuousSpeech?.configured;
    connection.current?.close();
    connection.current = null;
    setState("connecting"); setError(""); setNotice(""); setSaved(false); setMuted(false); setElapsed(0); setAudioLevel(null); setActivity("listening"); setCallInputMode(inputMode); setTypedMessage("");
    setCallContinuousSpeech(useContinuousSpeech); setContinuousUnderstanding(null); setContinuousSpeechStatus(useContinuousSpeech ? { state: "connecting" } : null);
    setDiagnostics(null); setToolTrace([]); setCallTools(preview ? normalizeVoiceTools(preview.draft.enabledTools) : []);
    transcriptRef.current = []; setTranscript([]); itemOrder.current = []; sessionKey.current = crypto.randomUUID(); sessionRelease.current = preview ? null : release || null; sessionPreviewId.current = null; sessionContact.current = selectedContact;
    let preparedContext = compiled;
    let connectedBehavior: VoiceBehaviorContext | undefined;
    setCallBehaviorContext(null); sessionConnectionId.current = null;
    behaviorSent.current = "";
    const draftSnapshot = preview ? { ...preview.draft, allowedLanguages: [...preview.draft.allowedLanguages], knowledgeIds: [...preview.draft.knowledgeIds] } : undefined;
    if (draftSnapshot) {
      try {
        const response = await attempt.currentResult(fetch("/api/voice/preview", { method: "POST", headers: { "Content-Type": "application/json" }, signal: attempt.signal, body: JSON.stringify({ draft: draftSnapshot, agentId: preview?.agentId, contactId: selectedContact || undefined }) }));
        if (!response) return;
        const result = await attempt.currentResult(response.json() as Promise<ContextPreview>);
        if (!result) return;
        if (!response.ok) throw new Error(result.error || "This draft could not be prepared for a call.");
        preparedContext = result; setCallContext(result); setCallDraftSnapshot(JSON.stringify(draftSnapshot));
      } catch (cause) { if (attempt.isCurrent()) { setState("ended"); setContinuousSpeechStatus(useContinuousSpeech ? { state: "ended" } : null); setError(cause instanceof Error ? cause.message : "This draft could not be prepared for a call."); } return; }
    }
    if (!attempt.isCurrent()) return;
    const session = createBrowserVoiceSession({
      mode: preview ? "preview" : "release", draft: draftSnapshot, inputMode,
      continuousSpeech: useContinuousSpeech,
      provider: config.provider, contactId: selectedContact || undefined, agentId: preview?.agentId || release?.agentId, versionId: preview ? undefined : release?.versionId, releaseId: preview ? undefined : release?.id,
      campaignRunId: preview ? undefined : campaignRunId,
      onConnected: meta => { if (!attempt.isCurrent()) return; sessionPreviewId.current = meta?.previewId || null; sessionConnectionId.current = meta?.connectionId || null; connectedBehavior = meta?.behaviorContext; setCallBehaviorContext(connectedBehavior || null); setCallTools(normalizeVoiceTools(meta?.enabledTools)); callStarted.current = Date.now(); setState("live"); setActivity("listening"); },
      onDiagnostics: snapshot => { if (attempt.isCurrent()) setDiagnostics(snapshot); },
      onUnderstanding: snapshot => { if (attempt.isCurrent() && useContinuousSpeech) setContinuousUnderstanding(snapshot); },
      onContinuousSpeechStatus: status => {
        if (!attempt.isCurrent() || !useContinuousSpeech) return;
        setContinuousSpeechStatus(status);
        if (status.state === "ended" || status.state === "unavailable") setContinuousUnderstanding(previous => previous ? { ...previous, phase: "ended", bound: false, latest: undefined, cues: undefined } : null);
      },
      onFailure: message => { if (!attempt.isCurrent()) return; startGate.current.cancel(); connection.current = null; setError(message); setState("ended"); setMuted(false); setAudioLevel(null); setContinuousSpeechStatus(previous => useContinuousSpeech ? { state: "ended", reason: previous?.reason } : null); setContinuousUnderstanding(previous => previous ? { ...previous, phase: "ended", bound: false, latest: undefined, cues: undefined } : null); },
      onEvent: event => {
        if (!attempt.isCurrent()) return;
        if (event.type === "activity") setActivity(event.activity);
        if (event.type === "audiolevel") setAudioLevel(Math.max(0, Math.min(1, event.level)));
        if (event.type === "tool") setToolTrace(previous => [...previous, { id: event.id, name: event.name, phase: event.phase, status: event.status, message: event.message, actionId: event.actionId, receivedAt: new Date().toISOString() }].slice(-30));
        if (event.type === "item" && !itemOrder.current.includes(event.id)) itemOrder.current.push(event.id);
        if (event.type === "transcript") {
          if (!itemOrder.current.includes(event.entry.id)) itemOrder.current.push(event.entry.id);
          const entry = { ...event.entry, receivedAt: new Date().toISOString() };
          const next = transcriptRef.current.some(previous => previous.id === entry.id)
            ? transcriptRef.current.map(previous => previous.id === entry.id ? entry : previous)
            : [...transcriptRef.current, entry];
          next.sort((a, b) => itemOrder.current.indexOf(a.id) - itemOrder.current.indexOf(b.id));
          if (next.length > 450 || new TextEncoder().encode(JSON.stringify(next)).length > 400_000) { end(); setError("Transcript limit reached. Save this call before starting another."); return; }
          if (entry.role === "user") {
            const update = compileRelationalRuntime({ entries: next, relationship: connectedBehavior?.relationship || preparedContext?.relationship, settings: connectedBehavior?.settings || draftSnapshot, callId: sessionKey.current });
            if (update.instructions !== behaviorSent.current && connection.current?.updateBehavior(update.instructions)) behaviorSent.current = update.instructions;
          }
          transcriptRef.current = next; setTranscript(next);
        }
      },
    });
    if (!attempt.isCurrent()) { session.close(); return; }
    connection.current = session;
    if (!attempt.isCurrent()) { session.close(); connection.current = null; return; }
    await session.connect();
  }

  function sendTypedMessage() {
    const message = typedMessage.trim();
    if (state !== "live" || callInputMode !== "text" || !message || !connection.current) return;
    try { if (connection.current.sendText(message)) { setTypedMessage(""); setNotice(""); } else { setNotice("Wait for the current response, then send your reply again."); } }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send your message. Try again."); }
  }

  async function save() {
    if (saving || saved || live || !transcript.length || (preview && !sessionPreviewId.current)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId: sessionContact.current || undefined, provider: config?.provider, inputMode: callInputMode, source: preview ? "browser_preview" : "browser_voice", previewId: preview ? sessionPreviewId.current : undefined, connectionId: preview ? undefined : sessionConnectionId.current || undefined, agentId: preview ? undefined : sessionRelease.current?.agentId, agentVersionId: preview ? undefined : sessionRelease.current?.versionId, releaseId: preview ? undefined : sessionRelease.current?.id, idempotencyKey: sessionKey.current, diagnostics, transcript: transcript.map(({ role, text, receivedAt }) => ({ role, text, receivedAt })) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save this conversation.");
      setSaved(true); setNotice(preview ? "Transcript saved as an internal preview. Personal memories still need separate approval." : "Transcript saved to conversations. Personal memories still need separate approval."); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save this conversation. The transcript is still here; try again."); }
    finally { setSaving(false); }
  }

  function download() {
    const blob = new Blob(["Staff preview transcript. Times are local event receipt times, not speech timestamps.\n\n" + transcript.map(entry => `[${entry.receivedAt || "time unavailable"}] ${entry.role === "user" ? "Person" : "AI assistant"}: ${entry.text}`).join("\n\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `conversation-${new Date().toISOString().slice(0, 10)}.txt`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="voice-studio wb-studio" aria-label={preview ? "Draft call tester" : "Browser voice studio"}>
    <div className="wb-call-head"><div><h2>{preview ? "Test call" : "Browser call"}</h2><p>{preview ? "Your current editor values are used when the call starts." : "Speak with an active browser release."}</p></div><span className="wb-state" data-state={state} role="status"><span className="wb-state-dot"/>{state === "live" ? muted ? "Muted" : "Live" : state === "connecting" ? "Connecting" : state === "ended" ? "Ended" : "Ready"}</span></div>
    {preview && <div className="wb-draft-strip"><Check size={15}/><span>Internal draft test · current editor values, including enabled actions, are used when the call starts</span></div>}
    <div className="wb-call-body"><div className="wb-provider"><span>Voice provider</span><strong>{config?.label || config?.provider || (config || configError ? "Not connected" : "Checking…")}</strong></div><div className="wb-provider"><span>Language</span><strong>{preview?.draft.primaryLanguage || callBehaviorContext?.settings.primaryLanguage || "Per release"}</strong></div>{speechDeliveryDecision && <div className="wb-provider"><span>Requested speech rate</span><strong>{speechDeliveryDecision.pace === "unhurried" ? "Unhurried · 0.9×" : "Standard · 1×"}{speechDeliveryDecision.basis === "caller_request" ? " · caller request" : " · agent setting"}</strong><span>Applies between turns; this is not evidence of heard output.</span></div>}</div>
    {!preview && <label className="pc-field">Released agent<select className="pc-select" value={release?.id || ""} disabled={!!campaignRunId || live || unsaved || saving} onChange={event => setSelectedRelease(event.target.value)}>{releases.length !== 1 && <option value="">Choose an active release</option>}{releases.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
    <label className="pc-field">{campaignRunId ? 'Queued campaign recipient' : 'Conversation context'}<select className="pc-select" value={selectedContact} disabled={lockContactSelection || live || unsaved || saving} onChange={event => setSelectedContact(event.target.value)}>{!campaignRunId && <option value="">Company knowledge only</option>}{campaignRunId && <option value="">Choose a queued recipient</option>}{contacts.map(contact => <option value={contact.id} key={contact.id}>{contact.name}</option>)}</select></label>
    {lockContactSelection && !controlledContactPending && !controlledContact && <p className="wb-inline-note">Select a queued recipient above to prepare the call desk.</p>}
    {controlledContactPending && contactSelectionBusy && <p className="wb-inline-note" role="status">{live ? 'End the current call before moving the call desk to another recipient.' : saving ? 'Wait for the previous transcript to finish saving before moving the call desk.' : 'Save or discard the previous transcript before moving the call desk to another recipient.'}</p>}
    <div className="wb-call-stage" aria-label="Call state"><div className="wb-stage-symbol" data-active={state === "live"} data-activity={state === "live" ? activity : state}><Activity size={30} strokeWidth={1.5}/></div><strong>{state === "live" ? callInputMode === "microphone" && muted ? "Microphone muted" : activity === "thinking" ? "Agent is preparing a response" : activity === "speaking" ? "Agent is speaking" : callInputMode === "text" ? "Listening for the agent" : "Listening" : state === "connecting" ? callInputMode === "microphone" ? "Opening the microphone and voice connection" : "Opening the voice connection" : state === "ended" ? "Call ended" : inputMode === "text" ? "Ready to listen and type" : "Ready to speak"}</strong><span>{state === "live" || state === "ended" ? clock(elapsed) : inputMode === "text" ? "Agent audio plays through this browser" : "Use headphones for a clearer test"}</span>{audioLevel !== null && state === "live" && <div className="wb-level" role="meter" aria-label="Microphone level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(audioLevel * 100)}><span style={{ width: `${Math.round(audioLevel * 100)}%` }}/></div>}</div>
    {!config?.configured && <div className="wb-setup" role="status"><Headphones size={18}/><span>{configError || config?.reason || "Checking the workspace voice configuration…"}</span></div>}
    {preview && compiledError && !live && <p className="wb-error" role="alert">{compiledError}</p>}
    {preview && !previewIsReady && <p className="wb-inline-note">Add a name, role, objective, AI introduction, response style, human escalation and language in the editor to begin.</p>}
    {!preview && releases.length === 0 && <p className="wb-inline-note">Publish a tested version to the browser channel before calling.</p>}
    <fieldset className="wb-input-mode" disabled={live || unsaved || saving}><legend>How will you respond?</legend><label><input type="radio" name={`${inspectorId}-input-mode`} value="microphone" checked={inputMode === "microphone"} onChange={() => setInputMode("microphone")}/><Mic size={15}/><span>Microphone</span></label><label><input type="radio" name={`${inspectorId}-input-mode`} value="text" checked={inputMode === "text"} disabled={continuousSpeech} onChange={() => setInputMode("text")}/><Headphones size={15}/><span>Listen &amp; type</span></label></fieldset>
    <p className="wb-mode-description">{continuousSpeech ? "Listen & type is unavailable while Live understanding is selected. Turn it off to change modes." : inputMode === "text" ? "Hear real AI audio and type your replies. Your microphone is not requested." : "Talk through your microphone and hear the agent respond in this browser."}</p>
    {config?.provider === "azure" && <><label className="wb-consent"><input type="checkbox" checked={continuousSpeech} disabled={live || unsaved || saving || inputMode !== "microphone" || !continuousSpeechAvailable} onChange={event => setContinuousSpeech(event.target.checked)}/><span><strong>Live understanding</strong><br/>Use the same microphone with Azure Speech to show tentative words and response cues during this call. Intermediate words may change and are not saved.</span></label>{!continuousSpeechAvailable && <p className="wb-inline-note">Live understanding is unavailable in this workspace. An administrator can finish the Azure Speech setup.</p>}</>}
    <label className="wb-consent"><input type="checkbox" checked={consent} disabled={live} onChange={event => setConsent(event.target.checked)}/><span>I understand this is an AI call. {inputMode === "microphone" ? `My microphone and selected context will be processed by the voice provider${continuousSpeech ? " and the Azure Speech recognition path" : ""}` : "My typed replies and selected context will be processed by the voice provider"}. The transcript is saved only if I choose to save it. Enabled actions may create internal review records and tool receipts during the call, even if I discard the transcript.</span></label>
    <div className="wb-call-actions">{!live ? <button type="button" className="pc-button primary wb-start" disabled={!config?.configured || (preview ? !previewIsReady || !compiled || !!compiledError || compiling : !release) || (campaignRunId && !campaignContactReady) || !consent || unsaved || saving} onClick={() => void start()}>{inputMode === "microphone" ? <Mic size={17}/> : <Headphones size={17}/>} {!preview ? "Start browser call" : inputMode === "text" ? "Start voice preview" : state === "ended" ? "Try another call" : "Start test call"}<ArrowRight size={15}/></button> : <>{callInputMode === "microphone" && <button type="button" className="pc-button" disabled={state !== "live"} onClick={() => { const nextMuted = !muted; connection.current?.setMuted(nextMuted); setMuted(nextMuted); if (callContinuousSpeech) setContinuousUnderstanding(previous => previous ? { ...previous, phase: nextMuted ? "paused" : "listening", bound: false, latest: undefined, cues: undefined } : null); }}>{muted ? <MicOff size={16}/> : <Mic size={16}/>} {muted ? "Unmute" : "Mute"}</button>}<button type="button" className="pc-button danger" onClick={() => end()}><Square size={15}/>End call</button><button type="button" className="pc-button" onClick={() => end(true)}><UserRound size={15}/>Stop for human</button></>}</div>
    {state === "connecting" && callInputMode === "microphone" && connectingFor >= 8 && <p className="wb-inline-note" role="status">Waiting for microphone permission. Check this browser’s permission prompt. You can end the attempt and choose Listen &amp; type if microphone access is unavailable.</p>}
    {state === "live" && callInputMode === "text" && <form className="wb-text-reply" onSubmit={event => { event.preventDefault(); sendTypedMessage(); }}><label htmlFor={`${inspectorId}-reply`}>Your reply</label><div><input id={`${inspectorId}-reply`} className="pc-input" type="text" autoComplete="off" maxLength={1000} value={typedMessage} onChange={event => setTypedMessage(event.target.value)} placeholder="Type what you want to say…"/><button type="submit" className="pc-button primary" disabled={!typedMessage.trim()}><Send size={15}/>Send</button></div><p>The provider speaks its response. Your reply appears in the transcript after it is sent.</p></form>}
    {unsaved && !live && <p className="wb-inline-note">Save or discard this transcript before another call.</p>}
    {error && <p className="wb-error" role="alert">{error}</p>}{notice && <p className="wb-inline-note" role="status">{notice}</p>}

    <div className="wb-inspector"><div className="wb-inspector-title"><h3>Call inspector</h3><span>{transcript.length ? `${transcript.length} ${transcript.length === 1 ? "turn" : "turns"}` : "Awaiting call"}</span></div><div className="wb-inspector-tabs" role="tablist" aria-label="Call inspector" onKeyDown={event => { const index = inspectorTabs.indexOf(inspector); const next = event.key === "ArrowRight" ? (index + 1) % inspectorTabs.length : event.key === "ArrowLeft" ? (index + inspectorTabs.length - 1) % inspectorTabs.length : event.key === "Home" ? 0 : event.key === "End" ? inspectorTabs.length - 1 : -1; if (next < 0) return; event.preventDefault(); setInspector(inspectorTabs[next]); event.currentTarget.querySelector<HTMLButtonElement>(`[data-inspector-tab="${inspectorTabs[next]}"]`)?.focus(); }}>{inspectorTabs.map(tab => <button type="button" role="tab" id={`${inspectorId}-${tab}`} data-inspector-tab={tab} aria-controls={`${inspectorId}-panel`} tabIndex={inspector === tab ? 0 : -1} key={tab} aria-selected={inspector === tab} onClick={() => setInspector(tab)}>{tab}</button>)}</div>
      {inspector === "Transcript" && <div id={`${inspectorId}-panel`} aria-labelledby={`${inspectorId}-Transcript`} className="wb-inspector-panel" role="tabpanel"><div ref={scrollRef} role="log" aria-label="Conversation transcript" aria-live="polite" className="wb-transcript">{!transcript.length ? <div className="wb-empty-transcript"><Headphones size={23}/><p>Spoken turns will appear here during a real call.</p></div> : transcript.map(entry => <div className="wb-turn" key={entry.id}><div><strong>{entry.role === "assistant" ? "AI agent" : "Person"}</strong><time>{entry.receivedAt ? new Date(entry.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</time></div><p>{entry.text}</p></div>)}</div>{transcript.length > 0 && <><p className="wb-transcript-note">Automatic transcription can omit or mishear speech. Review before relying on it.</p><div className="wb-transcript-actions"><button type="button" className="pc-button" disabled={live || saving || saved || !!preview && !sessionPreviewId.current} onClick={() => void save()}>{saving ? "Saving…" : saved ? "Saved" : preview ? "Save internal preview" : "Save transcript"}</button><button type="button" className="pc-button" onClick={download}><Download size={15}/>Download</button>{!live && !saved && <button type="button" className="pc-button quiet" disabled={saving} onClick={() => { if (window.confirm("Discard this unsaved transcript?")) { transcriptRef.current = []; setTranscript([]); setNotice("Transcript discarded."); } }}>Discard</button>}</div></>}</div>}
      {inspector === "Live understanding" && <div id={`${inspectorId}-panel`} aria-labelledby={`${inspectorId}-Live understanding`} className="wb-inspector-panel" role="tabpanel"><ContinuousUnderstanding enabled={live || state === "ended" ? callContinuousSpeech : continuousSpeech} callState={state} muted={muted} snapshot={continuousUnderstanding} status={continuousSpeechStatus}/></div>}
      {inspector === "EmotionalOS" && <div id={`${inspectorId}-panel`} aria-labelledby={`${inspectorId}-EmotionalOS`} className="wb-inspector-panel wb-relational" role="tabpanel"><p>Observed cues come from the person’s transcribed words. They guide a careful response; they are not a diagnosis or score.</p>{analysis.observedCues.length ? <div className="wb-cue-list">{analysis.observedCues.map((cue, index) => <div className="wb-cue" key={`${cue.evidence.entryId}-${index}`}><strong>{cue.kind.replaceAll("-", " ")}</strong><blockquote>“{cue.evidence.text}”</blockquote><small>Person’s transcript · turn {cue.evidence.entryIndex + 1}</small></div>)}</div> : <p className="wb-empty-inline">No specific cues observed in this transcript yet.</p>}<h4>Working state across this call</h4><div className="wb-context-line"><span>Pacing</span><strong>{relationalRuntime.state.pace}</strong></div><div className="wb-context-line"><span>Current turn</span><strong>{relationalRuntime.moment}</strong></div><div className="wb-context-line"><span>Pause requested</span><strong>{relationalRuntime.state.pauseRequested ? 'Yes' : 'No'}</strong></div><h4>Response guidance</h4><p>{relationalRuntime.instructions}</p><p className="wb-inline-note">Guidance is sent to the live provider when a caller turn is transcribed. Azure and OpenAI wait for the current turn guidance to be confirmed before requesting a reply. Gemini receives best-effort context for a later turn.</p>{analysis.correctionCandidates.length > 0 && <p className="wb-inline-note">{analysis.correctionCandidates.length} possible correction{analysis.correctionCandidates.length === 1 ? "" : "s"} require human review before memory is changed.</p>}</div>}
      {inspector === "RelationalOS" && <div id={`${inspectorId}-panel`} aria-labelledby={`${inspectorId}-RelationalOS`} className="wb-inspector-panel wb-relational" role="tabpanel"><div className="wb-context-line"><span>Conversation repair</span><strong>{relationalRuntime.state.repair_state}</strong></div><div className="wb-context-line"><span>Language / address</span><strong>{relationalRuntime.state.language} · {relationalRuntime.state.honorific}</strong></div>{relationalRuntime.events.length > 0 && <details><summary>State transitions · {relationalRuntime.events.length}</summary>{relationalRuntime.events.map(event => <div className="wb-cue" key={event.id}><strong>{event.dim}: {event.from_v || 'unset'} → {event.to_v}</strong><p>{event.note}</p>{event.citations.map((citation, index) => <blockquote key={index}>“{citation.text}” · turn {citation.entryIndex + 1}</blockquote>)}</div>)}</details>}<p>{callContext && state !== "idle" ? "Relationship context used for this call." : "Approved relationship context for the selected contact."} Preferences and commitments are reference data, not identity verification or completed actions.</p>{displayedContext?.relationship?.preferences.length ? <><h4>Approved communication preferences</h4>{displayedContext.relationship.preferences.map(preference => <div className="wb-cue" key={`${preference.kind}-${preference.sourceId}`}><strong>{preference.kind}: {preference.value}</strong><blockquote>“{preference.sourceText}”</blockquote><small>Approved memory · {preference.sourceId}</small></div>)}</> : <p className="wb-empty-inline">No approved communication preferences in this context.</p>}{displayedContext?.relationship?.openCommitments.length ? <><h4>Open team commitments</h4>{displayedContext.relationship.openCommitments.map(commitment => <div className="wb-cue" key={commitment.id}><strong>{commitment.title}</strong><small>Open commitment · {commitment.id}{commitment.dueDate ? ` · due ${commitment.dueDate}` : ""}</small></div>)}</> : <p className="wb-empty-inline">No open team commitments in this context.</p>}{displayedContext?.relationship?.omittedCount ? <p className="wb-inline-note">{displayedContext.relationship.omittedCount} relationship item(s) omitted by context limits.</p> : null}</div>}
      {inspector === "Context" && <div id={`${inspectorId}-panel`} aria-labelledby={`${inspectorId}-Context`} className="wb-inspector-panel wb-context" role="tabpanel">{preview ? <><p>{callContext && state !== "idle" ? "Call context · frozen when this call started." : "Current draft context · compiled from approved sources."}{draftChangedAfterCall ? " The editor has changed since the call began." : ""}</p>{compiling && state === "idle" && <p className="wb-inline-note">Refreshing context…</p>}{compiledError && state === "idle" && <p className="wb-error" role="alert">{compiledError}</p>}{displayedContext && <>{!!(displayedContext.omittedKnowledgeCount || displayedContext.omittedMemoryCount) && <p className="wb-inline-note">Context limits omitted {displayedContext.omittedKnowledgeCount || 0} complete company sources and {displayedContext.omittedMemoryCount || 0} memory entries. Shorten large sources before relying on them.</p>}<div className="wb-context-line"><span>Approved sources</span><strong>{displayedContext.knowledgeSources?.length || 0}</strong></div>{displayedContext.knowledgeSources?.map(source => <div className="wb-source" key={source.id}>{source.title} <small>· {source.id}</small></div>)}<details><summary>Read compiled instructions</summary><pre>{displayedContext.instructions}</pre></details></>}</> : <p>This call uses the selected released version and its approved source snapshot.</p>}</div>}
      <details className="wb-runtime-details"><summary>Actions &amp; call diagnostics{toolTrace.length ? ` · ${toolTrace.filter(item => item.phase === "requested").length} requested` : ""}</summary><div className="wb-runtime-content"><p>Browser-observed events for this call. Saved conversations use server action receipts for durable evidence.</p><div className="wb-context-line"><span>Enabled actions</span><strong>{callTools.length ? callTools.map(name => toolLabels[name]).join(', ') : 'None for this call'}</strong></div>{toolTrace.length ? <ol className="wb-tool-trace">{toolTrace.map((item, index) => <li key={`${item.id}-${item.phase}-${index}`}><span><strong>{toolLabels[item.name]}</strong><small>{new Date(item.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small></span><span className="wb-tool-state">{item.phase === 'requested' ? 'Requested' : item.status === 'awaiting_review' ? 'Awaiting review' : item.status === 'available' ? 'Available' : 'Unavailable'}</span>{item.message && <p>{item.message}</p>}{item.actionId && <small>Internal action · {item.actionId}</small>}</li>)}</ol> : <p className="wb-empty-inline">No action requests observed in this call.</p>}{diagnostics && <><div className="wb-context-line"><span>Action results</span><strong>{diagnostics.toolCalls.available} available · {diagnostics.toolCalls.awaitingReview} review · {diagnostics.toolCalls.unavailable} unavailable</strong></div><VoiceTimingEvidence diagnostics={diagnostics} inputMode={callInputMode}/></>}</div></details>
    </div>
  </section>;
}
