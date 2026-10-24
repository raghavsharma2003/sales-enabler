// "Start from a sample": a synthetic pack per starter agent loads as an ordinary CSV upload, so source.map shows the real
// preview and verdicts and source.commit writes the real receipt. "Add me as a test contact" adds the member's own
// verified phone as one more row; saving marks that contact as the member's test contact (sources.ts, commitUpload).
import { bool, obj, opt, str } from '../../../shared/validate.ts';
import { many, one } from '../../db.ts';
import { tool, type Registry } from '../../tools.ts';
import { packCsv, samplePacks, SAMPLE_ROWS, testRow } from './samples.ts';
import { receivePart } from './sources.ts';

const mask = (e164: string) => e164.slice(0, 3) + '•••••' + e164.slice(-4);

export function registerSampleTools(reg: Registry): void {
  reg.register(tool(obj({}), {
    name: 'source.sample.list', risk: 'read',
    summary: "Synthetic sample contact lists, one per starter agent, to try an import and a campaign; and whether you have a verified phone to add as a test contact",
    run: async ctx => {
      const me = ctx.actor.type === 'member' ? await one<{ e164: string }>(ctx.q,
        'SELECT e164 FROM verified_test_phone WHERE workspace_id = $1 AND member_id = $2 AND verified_at IS NOT NULL ORDER BY created_at LIMIT 1', [ctx.workspaceId, ctx.actor.id]) : null;
      return {
        packs: samplePacks().map(p => ({ id: p.id, label: p.label, templateId: p.templateId, about: p.about, rows: SAMPLE_ROWS, columns: p.headers })),
        testPhone: me ? mask(me.e164) : null,
      };
    },
  }));

  reg.register(tool(obj({ packId: str({ oneOf: samplePacks().map(p => p.id) }), includeMe: opt(bool()) },
    'Load a sample pack as an upload; then check it with source.map and save it with source.commit, as with a file. includeMe adds your own verified phone as a test contact.'), {
    name: 'source.sample.load', risk: 'draft',
    summary: 'Load a synthetic sample contact list as an import you can check before saving, optionally with your own verified phone as a test contact',
    run: async (ctx, i) => {
      const pack = samplePacks().find(p => p.id === i.packId)!;
      const rows = [...pack.rows];
      let testMemberId: string | null = null, testRowNumber: number | null = null;
      if (i.includeMe) {
        if (ctx.actor.type !== 'member') throw new Error('only a member can add their own phone as a test contact');
        const me = await one<{ e164: string; name: string | null; email: string }>(ctx.q, `SELECT v.e164, m.name, m.email FROM verified_test_phone v JOIN member m ON m.id = v.member_id
          WHERE v.workspace_id = $1 AND v.member_id = $2 AND v.verified_at IS NOT NULL ORDER BY v.created_at LIMIT 1`, [ctx.workspaceId, ctx.actor.id]);
        if (!me) throw new Error('verify your own phone first (an agent\'s test panel: "Call my phone"); only a verified phone can be a test contact');
        rows.push(testRow(pack, me.name?.trim() || me.email.split('@')[0], me.e164));
        testMemberId = ctx.actor.id ?? null; testRowNumber = rows.length + 1;      // + 1 for the header row
      }
      const existing = await many<{ id: string }>(ctx.q, "SELECT id FROM intake_source WHERE workspace_id = $1 AND name = $2 AND kind = 'csv' LIMIT 1", [ctx.workspaceId, `Sample: ${pack.label}`]);
      const up = await receivePart(ctx.q, ctx.workspaceId, { ...(existing[0] ? { sourceId: existing[0].id } : {}), filename: `Sample: ${pack.label}`, text: packCsv(pack.headers, rows), final: true });
      if (testMemberId) await ctx.q.query('UPDATE intake_upload SET test_member_id = $2 WHERE id = $1', [up.uploadId, testMemberId]);
      return { uploadId: up.uploadId, sourceId: up.sourceId, pack: { id: pack.id, label: pack.label, templateId: pack.templateId }, rows: rows.length, testRow: testRowNumber };
    },
  }));
}
