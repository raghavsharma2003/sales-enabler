'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, History, XCircle } from 'lucide-react';
import type { PlatformRecord, PlatformViewProps } from '../lib/platform/contracts';
import { deriveAgentReadiness, prepareAgentReadiness } from '../lib/platform/agent-readiness';
import { ReleaseReview } from './release-review';
import styles from './agent-release-panel.module.css';

export type AgentReleasePanelProps = {
  agent?: PlatformRecord;
  records: PlatformRecord[];
  dirty: boolean;
  busy: boolean;
  viewer: boolean;
  act: PlatformViewProps['act'];
  navigate: PlatformViewProps['navigate'];
};

const statusCopy: Record<string, string> = {
  unsaved: 'Save this agent to prepare its first version.',
  dirty: 'Save your changes first. Readiness checks use the saved agent below.',
  uncaptured: 'Ready to capture the saved agent and check its configuration.',
  outdated: 'Knowledge changed or its freshness cannot be confirmed. Review the sources, edit and save the agent, then run checks again.',
  unchecked: 'Run readiness checks on this saved version before publishing.',
  failed: 'Resolve the failed checks below, save your changes, then run checks again.',
  ready: 'Configuration checks passed for the current saved version. Review all current evidence before publishing.',
  released: 'This saved version is already active.',
};
const readable = (value: unknown, fallback = 'Not set') => typeof value === 'string' && value.trim() ? value : fallback;

export function AgentReleasePanel(props: AgentReleasePanelProps) {
  const { agent, records, dirty, busy, viewer, act, navigate } = props;
  const [pending, setPending] = useState<'checks' | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const current = useRef(props);
  current.current = props;
  const state = deriveAgentReadiness({ agent, records, dirty, busy: busy || !!pending, viewer });
  const activeVersion = records.find(record => record.kind === 'agent_version' && record.id === state.active?.data.versionId);
  const language = Array.isArray(agent?.data.allowedLanguages) ? agent.data.allowedLanguages.join(', ') : readable(agent?.data.primaryLanguage);
  const sourceCount = Array.isArray(agent?.data.knowledgeIds) ? agent.data.knowledgeIds.length : 0;

  const perform = async () => {
    if (inFlight.current || !state.canCheck) return;
    inFlight.current = true;
    setPending('checks'); setError(''); setNotice('');
    const input = { agent, records, dirty, busy, viewer };
    try {
      const result = await prepareAgentReadiness(input, act, () => current.current.agent?.id === agent?.id && current.current.agent?.revision === agent?.revision && !current.current.dirty && !current.current.viewer);
      setNotice(result.run.data.passed === true ? `Version ${String(result.version.data.number)} configuration checks passed. Review the release evidence next.` : 'Configuration checks completed. Review the failed items below.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The action could not be completed. Refresh and try again.');
    } finally { inFlight.current = false; setPending(''); }
  };

  return <section className={styles.panel} aria-label="Publish agent" aria-busy={!!pending}>
    <header className={styles.header}><div><h2>Publish your agent</h2><p>Check the saved version, then make it available for use.</p></div><button className="pc-button quiet" type="button" onClick={() => navigate('releases', agent?.id)}><History size={15} aria-hidden="true"/> Release history</button></header>
    <div className={styles.summary}>
      <div><strong>{readable(agent?.data.name, 'Unsaved agent')}</strong><span>{agent ? `Saved revision ${agent.revision}` : 'No saved revision'}</span></div>
      <dl><div><dt>Role</dt><dd>{readable(agent?.data.role)}</dd></div><div><dt>Languages</dt><dd>{language}</dd></div><div><dt>Knowledge</dt><dd>{sourceCount} {sourceCount === 1 ? 'source' : 'sources'}</dd></div><div><dt>Active release</dt><dd>{state.active ? `Version ${String(activeVersion?.data.number || '—')}` : 'None yet'}</dd></div></dl>
      {agent && <p className={styles.objective}>{readable(agent.data.objective)}</p>}
    </div>
    {viewer && <p className={styles.notice}>Read-only access. An owner or operator can run checks and publish.</p>}
    <p className={dirty || state.status === 'outdated' ? styles.attention : styles.status} role="status">{statusCopy[state.status]}</p>
    <div className={styles.configuration}>
      <div className={styles.stepHeading}><h3>Run configuration checks</h3></div><div className={styles.stepBody}>
        <p>Check AI disclosure, instructions, language and knowledge permissions for the exact saved version.</p>
        <button type="button" className="pc-button" disabled={!state.canCheck} onClick={() => void perform()}>{pending === 'checks' ? 'Running configuration checks…' : 'Run configuration checks'}</button>
        {state.run && <div className={styles.results}><p className={styles.resultHeading}>Version {String(state.version?.data.number)} · {state.run.data.passed === true ? 'Checks passed' : 'Needs changes'}{!state.currentVersion || state.knowledge !== 'current' ? ' · Outdated' : ''}<time dateTime={state.run.createdAt}>{new Date(state.run.createdAt).toLocaleString()}</time></p><ul>{state.checks.map((check, index) => <li key={`${check.label}-${index}`}>{check.passed ? <CheckCircle2 className={styles.passed} size={17} aria-hidden="true"/> : <XCircle className={styles.failed} size={17} aria-hidden="true"/>}<div><strong>{check.label}<span className={styles.checkLabel}> — {check.passed ? 'Passed' : 'Needs changes'}</span></strong><p>{check.detail}</p></div></li>)}</ul></div>}
      </div>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.reviewWrap}><ReleaseReview
      agent={agent}
      version={state.currentVersion ? state.version : undefined}
      configurationRun={state.currentVersion ? state.run : undefined}
      activeRelease={state.active}
      records={records}
      operation="publish"
      dirty={dirty || !state.currentVersion}
      busy={busy || !!pending}
      viewer={viewer}
      act={act}
      navigate={navigate}
    /></div>
  </section>;
}
