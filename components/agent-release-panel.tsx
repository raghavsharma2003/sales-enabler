'use client';

import { useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Circle, History, XCircle } from 'lucide-react';
import type { PlatformRecord, PlatformViewProps } from '../lib/platform/contracts';
import { agentPublishBody, deriveAgentReadiness, prepareAgentReadiness } from '../lib/platform/agent-readiness';
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
  ready: 'Readiness checks passed for the current saved version.',
  released: 'This saved version is already active.',
};
const readable = (value: unknown, fallback = 'Not set') => typeof value === 'string' && value.trim() ? value : fallback;

export function AgentReleasePanel(props: AgentReleasePanelProps) {
  const { agent, records, dirty, busy, viewer, act, navigate } = props;
  const [pending, setPending] = useState<'checks' | 'publish' | ''>('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const current = useRef(props);
  current.current = props;
  const state = deriveAgentReadiness({ agent, records, dirty, busy: busy || !!pending, viewer });
  const activeVersion = records.find(record => record.kind === 'agent_version' && record.id === state.active?.data.versionId);
  const language = Array.isArray(agent?.data.allowedLanguages) ? agent.data.allowedLanguages.join(', ') : readable(agent?.data.primaryLanguage);
  const sourceCount = Array.isArray(agent?.data.knowledgeIds) ? agent.data.knowledgeIds.length : 0;

  const perform = async (action: 'checks' | 'publish') => {
    if (inFlight.current || (action === 'checks' ? !state.canCheck : !state.canPublish)) return;
    inFlight.current = true;
    setPending(action); setError(''); setNotice('');
    const input = { agent, records, dirty, busy, viewer };
    try {
      if (action === 'checks') {
        const result = await prepareAgentReadiness(input, act, () => current.current.agent?.id === agent?.id && current.current.agent?.revision === agent?.revision && !current.current.dirty && !current.current.viewer);
        setNotice(result.run.data.passed === true ? `Version ${String(result.version.data.number)} checks passed.` : 'Checks completed. Review the failed items below.');
      } else {
        await act('release.publish', agentPublishBody(input));
        setNotice('Version published. New internal browser calls and campaigns can use this release.');
      }
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
    <ol className={styles.steps}>
      <li><div className={styles.stepHeading}><span className={styles.number} aria-hidden="true">1</span><h3>Run readiness checks</h3></div><div className={styles.stepBody}>
        <p>Checks cover AI disclosure, instructions, language and knowledge permissions.</p>
        <button type="button" className="pc-button" disabled={!state.canCheck} onClick={() => void perform('checks')}>{pending === 'checks' ? 'Running readiness checks…' : 'Run readiness checks'}</button>
        {state.run && <div className={styles.results}><p className={styles.resultHeading}>Version {String(state.version?.data.number)} · {state.run.data.passed === true ? 'Checks passed' : 'Needs changes'}{!state.currentVersion || state.knowledge !== 'current' ? ' · Outdated' : ''}<time dateTime={state.run.createdAt}>{new Date(state.run.createdAt).toLocaleString()}</time></p><ul>{state.checks.map((check, index) => <li key={`${check.label}-${index}`}>{check.passed ? <CheckCircle2 className={styles.passed} size={17} aria-hidden="true"/> : <XCircle className={styles.failed} size={17} aria-hidden="true"/>}<div><strong>{check.label}<span className={styles.checkLabel}> — {check.passed ? 'Passed' : 'Needs changes'}</span></strong><p>{check.detail}</p></div></li>)}</ul></div>}
        <p className={styles.scope}>Configuration checks do not assess voice quality or conversation quality.</p>
      </div></li>
      <li><div className={styles.stepHeading}><span className={styles.number} aria-hidden="true">2</span><h3>Publish the version</h3>{state.alreadyActive && <span className={styles.active}>Active</span>}</div><div className={styles.stepBody}>
        <p>Publishing updates the agent for new internal browser calls and campaigns. Knowledge is checked again when you publish.</p>
        <button type="button" className="pc-button primary" disabled={!state.canPublish} onClick={() => void perform('publish')}>{pending === 'publish' ? 'Publishing version…' : state.alreadyActive && state.currentVersion ? 'Version already active' : 'Publish version'}</button>
      </div></li>
      <li><div className={styles.stepHeading}><span className={styles.number} aria-hidden="true">3</span><h3>Set up channels</h3></div><div className={styles.stepBody}><p>Choose a public web or messaging channel, then review its access and usage limits.</p><button type="button" className="pc-button quiet" disabled={!state.active || !!pending} onClick={() => state.active && navigate('deployments', `release:${state.active.id}`)}>Set up channels <ArrowRight size={15} aria-hidden="true"/></button>{!state.active && <span className={styles.waiting}><Circle size={13} aria-hidden="true"/> Available after publishing</span>}</div></li>
    </ol>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
  </section>;
}
