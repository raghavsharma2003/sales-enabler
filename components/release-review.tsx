'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, CircleAlert, CircleDashed, RefreshCw, Rocket, RotateCcw } from 'lucide-react';
import type { PlatformRecord, PlatformViewProps } from '../lib/platform/contracts';
import type { ReleaseReviewPacket, RegressionSuiteCaseResult } from '../lib/regression/contracts';
import {
  configurationEvidenceStatus,
  isReleaseReviewPacket,
  releaseMutationBody,
  releaseReviewContextKey,
  releaseReviewRequest,
  type ReleaseOperation,
} from '../lib/platform/release-review';
import { testCaseVersionFocus } from '../lib/platform/test-lab-route';
import styles from './release-review.module.css';

export type ReleaseReviewProps = {
  agent?: PlatformRecord;
  version?: PlatformRecord;
  configurationRun?: PlatformRecord;
  activeRelease?: PlatformRecord;
  records: PlatformRecord[];
  operation: ReleaseOperation;
  dirty?: boolean;
  busy: boolean;
  viewer: boolean;
  act: PlatformViewProps['act'];
  navigate: PlatformViewProps['navigate'];
  onPublished?: (release: PlatformRecord) => void;
};

const sentence = (value: string) => value.replaceAll('_', ' ').replace(/^./, character => character.toUpperCase());
const shortRef = (value: string | null | undefined) => value ? value.slice(-8) : 'none';
const text = (value: unknown, fallback: string) => typeof value === 'string' && value.trim() ? value : fallback;
const statusTone = (status: string) => status === 'passed' ? 'pass' : status === 'missing' || status === 'pending' || status === 'review_needed' ? 'wait' : 'fail';
const statusIcon = (tone: 'pass' | 'wait' | 'fail') => tone === 'pass' ? <Check size={16} aria-hidden="true"/> : tone === 'wait' ? <CircleDashed size={16} aria-hidden="true"/> : <CircleAlert size={16} aria-hidden="true"/>;

function CaseEvidence({ item, versionId, versionNumber, navigate }: { item: RegressionSuiteCaseResult; versionId: string; versionNumber: number; navigate: PlatformViewProps['navigate'] }) {
  const tone = statusTone(item.status);
  const action = item.status === 'missing' ? 'Run this required case'
    : item.status === 'pending' ? 'Wait for this attempt, then refresh'
    : item.status === 'review_needed' ? 'Review its blocking criteria'
    : item.status === 'stale' ? 'Rerun this case for the current version'
    : item.status === 'invalid' || item.status === 'uncertain' || item.status === 'failed' ? 'Correct and rerun this case'
    : 'Current reviewed evidence';
  return <li className={styles.caseRow}>
    <span className={styles.caseIcon} data-tone={tone}>{statusIcon(tone)}</span>
    <span className={styles.caseCopy}>
      <strong>Case {shortRef(item.caseId)} · case version {item.caseVersion}</strong>
      <small>{sentence(item.status)} for agent version {versionNumber}{item.runId ? ` · attempt ${shortRef(item.runId)}` : ''}</small>
    </span>
    {item.status !== 'passed' && <button type="button" className={styles.caseAction} onClick={() => navigate('tests', testCaseVersionFocus(item.caseId, versionId))}>{action}</button>}
  </li>;
}

export function ReleaseReview(props: ReleaseReviewProps) {
  const { agent, version, configurationRun, activeRelease, records, operation, dirty = false, busy, viewer, act, navigate, onPublished } = props;
  const [reviewed, setReviewed] = useState<{ key: string; packet: ReleaseReviewPacket } | null>(null);
  const [pending, setPending] = useState<'review' | 'publish' | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [publishedRelease, setPublishedRelease] = useState<PlatformRecord | null>(null);
  const inFlight = useRef(false);
  const activeVersion = records.find(record => record.kind === 'agent_version' && record.id === activeRelease?.data.versionId);
  const versionConfig = version?.data.config && typeof version.data.config === 'object' ? version.data.config as Record<string, unknown> : undefined;
  const purpose = text(versionConfig?.objective, text(agent?.data.objective, 'No purpose has been saved for this agent.'));
  const contextKey = releaseReviewContextKey({ records, agent, version, run: configurationRun, activeRelease, dirty, operation });
  const currentContext = useRef(contextKey);
  currentContext.current = contextKey;
  const packet = reviewed?.key === contextKey ? reviewed.packet : null;
  const configurationStatus = configurationEvidenceStatus(packet, configurationRun);
  const selectionKey = `${agent?.id || ''}:${version?.id || ''}:${operation}`;
  const selectedRef = useRef(selectionKey);

  useEffect(() => {
    if (selectedRef.current === selectionKey) return;
    selectedRef.current = selectionKey;
    setPublishedRelease(null);
    setNotice('');
    setError('');
  }, [selectionKey]);

  const review = async () => {
    if (!version || dirty || viewer || inFlight.current) return;
    const requestedKey = contextKey;
    inFlight.current = true;
    setPending('review'); setError(''); setNotice(''); setReviewed(null);
    try {
      const value = await act('release.review', releaseReviewRequest(version, configurationRun, operation));
      if (!isReleaseReviewPacket(value)
        || value.agentVersionId !== version.id
        || value.operation !== operation
        || value.testRunId !== (configurationRun?.id || null)) {
        throw new Error('The release review did not match this exact version and check. Refresh the workspace and review again.');
      }
      if (currentContext.current !== requestedKey) throw new Error('Release evidence changed while it was being reviewed. Review the current evidence again.');
      setReviewed({ key: requestedKey, packet: value });
      setNotice(value.publishable ? 'Current evidence reviewed. This version is ready for an explicit publish decision.' : 'Current evidence reviewed. Resolve the items below, then refresh this review.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Release evidence could not be reviewed. Refresh and try again.');
    } finally {
      inFlight.current = false; setPending('');
    }
  };

  const publish = async () => {
    if (!packet || !packet.publishable || viewer || dirty || inFlight.current) return;
    inFlight.current = true;
    setPending('publish'); setError(''); setNotice('');
    try {
      const value = await act(operation === 'rollback' ? 'release.rollback' : 'release.publish', releaseMutationBody(packet));
      const release = value as PlatformRecord | undefined;
      if (!release || release.kind !== 'release' || release.data.versionId !== packet.agentVersionId) {
        throw new Error('The saved release could not be confirmed. Refresh release history before trying again.');
      }
      setPublishedRelease(release);
      setNotice(operation === 'rollback' ? `Version ${packet.agentVersionNumber} is active again.` : `Version ${packet.agentVersionNumber} is active.`);
      onPublished?.(release);
    } catch (cause) {
      setReviewed(null);
      setError(cause instanceof Error ? cause.message : 'The release could not be saved. Refresh its review before trying again.');
    } finally {
      inFlight.current = false; setPending('');
    }
  };

  if (!version) return <section className={styles.review} aria-label="Release review">
    <div className={styles.empty}><p>Capture a saved agent version before reviewing a release.</p><button type="button" className="pc-button" onClick={() => navigate('agents')}>Open agent builder</button></div>
  </section>;

  const firstBlockingCase = packet?.suite.cases.find(item => item.status !== 'passed');
  const configurationTone = configurationStatus === 'passed' ? 'pass' : configurationStatus === 'missing' || configurationStatus === 'unreviewed' ? 'wait' : 'fail';
  const conversationTone = !packet || packet.suite.requiredCases === 0 ? 'wait' : packet.suite.passing ? 'pass' : 'fail';
  const currentRelease = publishedRelease || (activeRelease?.data.versionId === version.id ? activeRelease : undefined);
  const canPublish = !!packet?.publishable && !viewer && !dirty && !busy && !pending && !currentRelease;

  return <section className={styles.review} aria-label="Release review" aria-busy={!!pending}>
    <header className={styles.header}>
      <div><h3>{operation === 'rollback' ? 'Review rollback' : 'Review release'}</h3><p>{operation === 'rollback' ? 'Recheck this earlier version against today’s required evidence before making it active.' : 'Review the exact saved version and its latest proof before making it active.'}</p></div>
      <button type="button" className="pc-button" disabled={dirty || viewer || busy || !!pending} onClick={() => void review()}><RefreshCw size={15} aria-hidden="true"/>{pending === 'review' ? 'Reviewing evidence…' : packet ? 'Refresh review' : 'Review current evidence'}</button>
    </header>

    <div className={styles.identity}>
      <div><span>Purpose</span><strong>{purpose}</strong></div>
      <dl>
        <div><dt>Candidate</dt><dd>Version {String(version.data.number)}</dd></div>
        <div><dt>Active now</dt><dd>{activeRelease ? `Version ${String(activeVersion?.data.number || 'unknown')}` : 'No active release'}</dd></div>
        <div><dt>Decision</dt><dd>{operation === 'rollback' ? 'Make this earlier version active' : 'Publish this candidate'}</dd></div>
      </dl>
    </div>

    {dirty && <p className={styles.attention} role="status">Save the current agent changes before reviewing this saved version.</p>}
    {viewer && <p className={styles.note}>Read-only access. You can inspect saved release evidence and history; an owner or operator must request a fresh review or publish.</p>}

    <div className={styles.evidence}>
      <div className={styles.evidenceHeading}><h4>What has been proved</h4>{packet && <span className={styles.decision} data-ready={packet.publishable}>{packet.publishable ? 'Ready for your decision' : `${packet.blockers.length} ${packet.blockers.length === 1 ? 'item needs' : 'items need'} attention`}</span>}</div>
      <div className={styles.evidenceRow}>
        <span className={styles.evidenceIcon} data-tone={configurationTone}>{statusIcon(configurationTone)}</span>
        <div><strong>Configuration</strong><p>{configurationStatus === 'passed' ? `Latest checks passed for version ${String(version.data.number)}.` : configurationStatus === 'missing' ? `No configuration check exists for version ${String(version.data.number)}.` : configurationStatus === 'failed' ? `The latest configuration check failed for version ${String(version.data.number)}.` : configurationStatus === 'unreviewed' ? `The latest check passed locally for version ${String(version.data.number)}. Review current evidence to confirm it is still valid.` : `The latest passing check is stale for version ${String(version.data.number)}.`}</p>{configurationRun && <small>Check ref {shortRef(configurationRun.id)} · {new Date(configurationRun.createdAt).toLocaleString()}</small>}</div>
        {(configurationStatus === 'missing' || configurationStatus === 'failed' || configurationStatus === 'stale') && <button type="button" className={styles.rowAction} onClick={() => navigate('tests', version.id)}>Run configuration checks</button>}
      </div>
      <div className={styles.evidenceRow}>
        <span className={styles.evidenceIcon} data-tone={conversationTone}>{statusIcon(conversationTone)}</span>
        <div><strong>Conversation cases</strong><p>{!packet ? 'Review current evidence to check required conversation cases.' : packet.suite.requiredCases === 0 ? 'No required text cases configured. This release is configuration-only.' : packet.suite.passing ? `${packet.suite.requiredCases} required ${packet.suite.requiredCases === 1 ? 'case has' : 'cases have'} current reviewed evidence for version ${packet.agentVersionNumber}.` : `${packet.suite.cases.filter(item => item.status === 'passed').length} of ${packet.suite.requiredCases} required cases currently pass for version ${packet.agentVersionNumber}.`}</p></div>
        {firstBlockingCase && <button type="button" className={styles.rowAction} onClick={() => navigate('tests', testCaseVersionFocus(firstBlockingCase.caseId, version.id))}>Open next case</button>}
      </div>
      {packet && packet.suite.cases.length > 0 && <ul className={styles.caseList}>{packet.suite.cases.map(item => <CaseEvidence key={`${item.caseId}:${item.caseVersion}`} item={item} versionId={packet.agentVersionId} versionNumber={packet.agentVersionNumber} navigate={navigate}/>)}</ul>}
      <div className={styles.evidenceRow}>
        <span className={styles.evidenceIcon} data-tone="wait"><CircleDashed size={16} aria-hidden="true"/></span>
        <div><strong>Voice and device</strong><p>Not measured by configuration checks or text rehearsals. Audio, latency, interruption and microphone behaviour remain unproven.</p></div>
      </div>
    </div>

    {packet && packet.blockers.length > 0 && <div className={styles.blockers} role="status"><strong>What needs fixing</strong><ul>{packet.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.note} role="status">{notice}</p>}

    <div className={styles.decisionBar}>
      <div><strong>{currentRelease ? `Version ${String(version.data.number)} is active` : operation === 'rollback' ? `Make version ${String(version.data.number)} active again` : `Publish version ${String(version.data.number)}`}</strong><p>Publishing changes the release used by new internal calls and campaigns. It does not activate a public or messaging channel.</p></div>
      {!currentRelease && <button type="button" className="pc-button primary" disabled={!canPublish} onClick={() => void publish()}>{operation === 'rollback' ? <RotateCcw size={16} aria-hidden="true"/> : <Rocket size={16} aria-hidden="true"/>}{pending === 'publish' ? 'Saving release…' : operation === 'rollback' ? 'Roll back to this version' : 'Publish this version'}</button>}
    </div>

    {currentRelease && <div className={styles.channelHandoff}>
      <div><strong>Choose where this release runs</strong><p>Set up or update a channel with this exact release. Access, consent, limits and provider activation are reviewed separately.</p></div>
      <button type="button" className="pc-button quiet" onClick={() => navigate('deployments', `release:${currentRelease.id}`)}>Set up channels <ArrowRight size={15} aria-hidden="true"/></button>
    </div>}
  </section>;
}
