// call.export: the calls-list filter as a CSV. Policy, like contact.export: personal data leaves Vyakti, so an owner or
// compliance approves it and the audit keeps who and when. Formula cells are escaped; people who are suppressed or erased,
// and test calls, are left out; a call whose transcript was purged carries no summary. The file goes to the approver's
// receipt only (redactResult): the stored action keeps the count.
import type { Registry } from '../../tools.ts';
import { tool } from '../../tools.ts';
import { many, one } from '../../db.ts';
import { bool, num, obj, opt, str, uuid } from '../../../shared/validate.ts';
import { REASON_CODES } from '../calls/taxonomy.ts';
import { BEST_GRADE, BEST_OUTCOME } from '../calls/stats.ts';
import { csvCell } from '../intake/csv.ts';
import { initials, maskPhone } from './events.ts';

const MAX_ROWS = 50_000;
const SUPP_JOIN = `s.workspace_id = c.workspace_id AND s.scope = 'workspace' AND (s.contact_id = c.id OR s.e164 = c.e164)`;
const date = str({ pattern: /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/ });

export const CALL_EXPORT_COLUMNS = ['call_id', 'started_at', 'ended_at', 'duration_s', 'direction', 'campaign', 'agent', 'agent_version', 'phone', 'name', 'language',
  'outcome', 'grade', 'reason_code', 'reason', 'flagged', 'hand_off', 'summary', 'cost_inr', 'recorded'] as const;

export function registerCallExport(r: Registry) {
  r.register(tool(obj({
    campaignId: opt(uuid()), agentVersionId: opt(uuid()), outcome: opt(str({ max: 80 })), reasonCode: opt(str({ oneOf: REASON_CODES.map(x => x.code) })),
    from: opt(date), to: opt(date), flagged: opt(bool()), wholeNumbers: opt(bool()), limit: opt(num({ int: true, min: 1, max: MAX_ROWS })),
  }), {
    name: 'call.export', risk: 'policy', roles: ['owner', 'compliance'],
    summary: 'Export calls as CSV (personal data leaves Vyakti; approved by Compliance or Owner, audited)',
    describe: async (i, ctx) => {
      const camp = i.campaignId ? (await one<{ name: string }>(ctx.q, 'SELECT name FROM campaign WHERE id = $1 AND workspace_id = $2', [i.campaignId, ctx.workspaceId]))?.name ?? 'this campaign' : null;
      const bits = [camp && `campaign ${camp}`, i.outcome && `outcome ${i.outcome}`, i.reasonCode && `reason ${i.reasonCode}`, i.from && `from ${i.from.slice(0, 10)}`, i.to && `to ${i.to.slice(0, 10)}`, i.flagged !== undefined && (i.flagged ? 'flagged only' : 'unflagged only')].filter(Boolean);
      return `Export ${bits.length ? 'the calls matching ' + bits.join(', ') : 'every call'} as CSV${i.wholeNumbers ? ', with whole phone numbers and names' : ', with phone numbers masked'}. Suppressed and erased people and test calls are left out. Personal data leaves Vyakti.`;
    },
    redactResult: (out: { rows: number; csv: string }) => ({ rows: out.rows, csvBytes: Buffer.byteLength(out.csv), csv: '[delivered to the approver]' }),
    run: async (ctx, i): Promise<{ rows: number; csv: string; columns: readonly string[] }> => {
      const where = ['cv.workspace_id = $1', `cv.channel <> 'test'`], p: unknown[] = [ctx.workspaceId];
      const add = (sql: string, v: unknown) => { p.push(v); where.push(sql.replace('?', '$' + p.length)); };
      if (i.campaignId) add('a.campaign_id = ?', i.campaignId);
      if (i.agentVersionId) add('cv.agent_version_id = ?', i.agentVersionId);
      if (i.reasonCode) add('cv.reason_code = ?', i.reasonCode);
      if (i.outcome) add(`${BEST_OUTCOME} = ?`, i.outcome);
      if (i.from) add('cv.started_at >= ?::timestamptz', i.from);
      if (i.to) add('cv.started_at < ?::timestamptz', i.to);
      if (i.flagged !== undefined) add('cv.flagged = ?', i.flagged);
      // The same rule as contact.export: a person who is suppressed workspace-wide, or erased, is not in the file.
      where.push(`(c.id IS NULL OR (c.erased_at IS NULL AND NOT EXISTS (SELECT 1 FROM suppression s WHERE ${SUPP_JOIN})))`);
      p.push(i.limit ?? MAX_ROWS);
      const rows = await many<Record<string, any>>(ctx.q, `
        SELECT cv.id, cv.started_at, cv.ended_at, cv.duration_s, cv.direction, k.name AS campaign, ag.name AS agent, av.number AS agent_version,
               c.e164, c.name AS contact_name, c.language, ${BEST_OUTCOME} AS outcome, ${BEST_GRADE} AS grade, cv.reason_code, cv.flagged,
               EXISTS (SELECT 1 FROM hand_off h WHERE h.conversation_id = cv.id AND h.workspace_id = cv.workspace_id) AS hand_off,
               CASE WHEN cv.transcript_purged_at IS NULL THEN cv.analysis->>'summary' END AS summary, cv.cost_inr_milli::bigint AS cost_inr_milli,
               (cv.recording_uri IS NOT NULL AND cv.recording_purged_at IS NULL) AS recorded
        FROM conversation cv
        LEFT JOIN attempt a ON a.id = cv.attempt_id AND a.workspace_id = cv.workspace_id
        LEFT JOIN campaign k ON k.id = a.campaign_id AND k.workspace_id = cv.workspace_id
        LEFT JOIN agent_version av ON av.id = cv.agent_version_id
        LEFT JOIN agent ag ON ag.id = av.agent_id AND ag.workspace_id = cv.workspace_id
        LEFT JOIN contact c ON c.id = cv.contact_id AND c.workspace_id = cv.workspace_id
        WHERE ${where.join(' AND ')} ORDER BY cv.started_at DESC, cv.id LIMIT $${p.length}`, p);
      const label = (code: string | null) => REASON_CODES.find(x => x.code === code)?.label ?? '';
      const lines = [CALL_EXPORT_COLUMNS.map(csvCell).join(',')];
      for (const r of rows) {
        const whole = !!i.wholeNumbers;
        lines.push([r.id, new Date(r.started_at).toISOString(), r.ended_at ? new Date(r.ended_at).toISOString() : '', r.duration_s ?? '', r.direction, r.campaign ?? '', r.agent ?? '', r.agent_version ?? '',
          whole ? r.e164 : maskPhone(r.e164), whole ? r.contact_name : initials(r.contact_name), r.language ?? '', r.outcome ?? '', r.grade ?? '', r.reason_code ?? '', label(r.reason_code),
          r.flagged ? 'yes' : 'no', r.hand_off ? 'yes' : 'no', r.summary ?? '', (Number(r.cost_inr_milli ?? 0) / 1000).toFixed(2), r.recorded ? 'yes' : 'no'].map(csvCell).join(','));
      }
      return { rows: rows.length, csv: lines.join('\r\n') + '\r\n', columns: CALL_EXPORT_COLUMNS };
    },
  }));
}
