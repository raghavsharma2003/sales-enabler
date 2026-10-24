// "Start from a sample": synthetic lists shaped for each starter agent, loaded as its own chunk. A sample goes through the
// same column matching, verdicts and receipt as a file. "Add me as a test contact" puts your own verified phone in the list,
// so a campaign on staging rings you.
import { useState } from 'react';
import { useApp, useData } from '../store.tsx';
import { Link } from '../router.tsx';
import { Async, Btn, Card, CardHead, SelectField, Toggle } from '../ui.tsx';
import { agentNames, importMap, sampleLoad, samplePacks } from '../data.ts';
import { count } from '../format.ts';
import type { ImportPreview } from '../types.ts';
import { ImportReview } from './import-review.tsx';

export default function SampleImport() {
  const { toast } = useApp();
  const packs = useData('sample-packs', samplePacks);
  const agents = useData('import-agents', agentNames);
  const [packId, setPackId] = useState('');
  const [agentId, setAgentId] = useState('');
  const [me, setMe] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState<{ rows: number; testRow: number | null } | null>(null);
  const [pv, setPv] = useState<ImportPreview | null>(null);
  const check = async () => {
    setBusy(true); setPv(null);
    try { const r = await sampleLoad(packId, me); setLoaded(r); setPv(await importMap(r.uploadId, '', undefined, agentId || undefined)); }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not load that sample.', 'bad'); }
    setBusy(false);
  };
  return (
    <div className="stack">
      <Async q={packs} what="Sample lists" tool="source.sample.list" rows={2}>{d => {
        const pack = d.packs.find(p => p.id === packId);
        return (
          <Card><CardHead title="1. Choose a sample list" sub="Made-up people with made-up numbers (90000 000xx), shaped like a real list for each starter agent: due dates, amounts and ids, mixed languages, a duplicate and an opt-out or two. It goes through the same check and receipt as your own file." />
            <div className="formgrid">
              <SelectField label="Sample list" value={packId} onChange={e => { setPackId(e.target.value); setPv(null); setLoaded(null); }} hint={pack ? `${pack.about} ${count(pack.rows)} rows: ${pack.columns.join(', ')}.` : undefined}>
                <option value="">Choose a sample</option>{d.packs.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</SelectField>
              <Async q={agents} what="Agents" tool="agent.list" rows={1}>{as => (
                <SelectField label="Which agent will call them? (optional)" value={agentId} onChange={e => { setAgentId(e.target.value); setPv(null); }}
                  hint="We check the list has every detail she says from each person's record, before anything is saved.">
                  <option value="">Decide later</option>{as.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</SelectField>)}</Async>
            </div>
            <div style={{ marginTop: 12 }}>{d.testPhone
              ? <Toggle checked={me} onChange={v => { setMe(v); setPv(null); }} label="Add me as a test contact" hint={`Your verified phone (${d.testPhone}) joins the list and is marked as your test contact, so a campaign can ring you to hear it.`} />
              : <p className="hint">To be called yourself, verify your phone first: open an agent's test panel and choose to call your phone. <Link to="/agents">Go to Agents</Link></p>}</div>
            <div className="row" style={{ marginTop: 12 }}>{packId ? <Btn kind="primary" busy={busy} onClick={() => void check()}>Check this sample</Btn> : <Btn disabled fix={null} reason="Choose a sample list first.">Check this sample</Btn>}</div>
            {loaded && <p className="hint" role="status">Loaded {count(loaded.rows)} rows.{loaded.testRow ? ` Row ${loaded.testRow} is you: it is saved as your test contact.` : ''}</p>}
          </Card>
        );
      }}</Async>
      {pv && <ImportReview pv={pv} setPv={setPv} srcText="" agentId={agentId} saveSub="Saves the sample contacts and an audience. It does not call anyone." onSaved={() => { setPv(null); setLoaded(null); toast('Sample list saved.', 'ok'); }} />}
    </div>
  );
}
