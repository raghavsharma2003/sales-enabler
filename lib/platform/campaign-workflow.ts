/** Browser-safe contract for one durable campaign throughout setup and execution. */
import type { CampaignIntent, ReviewColumn } from '../business/contracts';
import type { PlanCitation, SourceAnchor } from '../campaign-planning/engine';
export type CampaignPhase = 'intent' | 'audience' | 'agent_content' | 'review' | 'run' | 'results';
export type CampaignSetupPhase = Exclude<CampaignPhase, 'run' | 'results'>;
export type CampaignSetupFields = {
  name?: string; kind?: 'sales' | 'feedback'; goal?: string; offeringId?: string;
  outcome?: { label: string; evidenceRequired: string[] }; signalIds?: string[];
  audienceRationale?: string; reviewColumns?: ReviewColumn[]; contactIds?: string[];
  channel?: 'browser' | 'manual_email' | 'email'; emailConnectionId?: string; agentReleaseId?: string;
  subject?: string; message?: string; objective?: string; callBrief?: string; successCriteria?: string;
  journeySteps?: string[]; sourceIds?: string[];
};
export type AcceptedCampaignPlan = { planId: string; planRevision: number; requestDigest: string; runId: string; explicitIntentV1: CampaignIntent; sourceAnchors: Omit<SourceAnchor, 'content'>[]; citations: PlanCitation[]; acceptedAt: string; acceptedBy: string };
export type CampaignSetupData = { schemaVersion: 1; phase: CampaignSetupPhase; fields: CampaignSetupFields; name?: string; ownerId: string; requestDigest: string; acceptedPlan?: AcceptedCampaignPlan };
type RecordLike = { status: string; data: unknown };
export function isCampaignSetup(record: RecordLike): record is RecordLike & { data: CampaignSetupData } { return record.status === 'setup' && !!record.data && (record.data as CampaignSetupData).schemaVersion === 1; }
export function readCampaignSetup(record: RecordLike) { return isCampaignSetup(record) ? record.data : undefined; }
export function campaignDisplayName(record: RecordLike) { return (isCampaignSetup(record) ? record.data.fields.name : (record.data as { name?: string })?.name) || 'Untitled campaign'; }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const invalid = (key: string): never => { throw new Error(`Invalid campaign setup field: ${key}.`); };
const text = (v: unknown, n: number, key: string) => typeof v === 'string' && v.length <= n ? v.trim() : invalid(key);
const list = (v: unknown, n: number, max: number, key: string) => Array.isArray(v) && v.length <= n ? [...new Set(v.map(x => text(x, max, key)))].filter(Boolean) : invalid(key);
export function parseCampaignSetupPatch(value: unknown): CampaignSetupFields {
  if (!object(value)) return invalid('patch');
  const result: Record<string, unknown> = {};
  const limits: Record<string, number> = { name:160,goal:1000,offeringId:100,audienceRationale:2000,emailConnectionId:100,agentReleaseId:100,subject:240,message:5000,objective:1000,callBrief:3000,successCriteria:1000 };
  const arrays: Record<string, [number,number]> = { signalIds:[20,100],contactIds:[500,100],sourceIds:[3,100],journeySteps:[6,300] };
  for (const [key,v] of Object.entries(value)) {
    if (Object.hasOwn(limits,key)) result[key] = text(v,limits[key],key);
    else if (Object.hasOwn(arrays,key)) result[key] = list(v,...arrays[key],key);
    else if (key === 'kind' && typeof v === 'string' && ['sales','feedback'].includes(v)) result[key] = v;
    else if (key === 'channel' && typeof v === 'string' && ['browser','manual_email','email'].includes(v)) result[key] = v;
    else if (key === 'outcome' && object(v) && Object.keys(v).every(k => ['label','evidenceRequired'].includes(k))) result[key] = { label:text(v.label,240,key),evidenceRequired:list(v.evidenceRequired,8,400,key) };
    else if (key === 'reviewColumns' && Array.isArray(v) && v.length <= 12) {
      const seen = new Set<string>();
      result[key] = v.map(c => {
        if (!object(c) || Object.keys(c).some(k => !['key','label','type','options'].includes(k))) return invalid(key);
        const name = text(c.key,60,key), label = text(c.label,120,key);
        if (!/^[a-z][a-z0-9_]{0,59}$/.test(name) || ['constructor','prototype','__proto__'].includes(name) || seen.has(name) || !label || typeof c.type !== 'string' || !['text','boolean','number','date','enum'].includes(c.type)) return invalid(key);
        seen.add(name);
        if (c.type !== 'enum' && c.options !== undefined) return invalid(key);
        const options = c.type === 'enum' ? list(c.options,20,120,key) : undefined;
        if (options && !options.length) return invalid(key);
        return { key:name,label,type:c.type,...(options ? {options} : {}) };
      });
    } else return invalid(key);
  }
  return result as CampaignSetupFields;
}
export function mergeCampaignSetup(data: CampaignSetupData, patch: CampaignSetupFields, phase = data.phase): CampaignSetupData {
  // Operational bindings are checked live at finalize/launch and are not inputs
  // to generation. Selecting the release or mailbox must retain its AI receipt.
  const changed = Object.entries(patch).some(([key,value]) => !['agentReleaseId','emailConnectionId'].includes(key) && JSON.stringify(data.fields[key as keyof CampaignSetupFields]) !== JSON.stringify(value));
  const fields = { ...data.fields, ...patch };
  const { acceptedPlan, ...rest } = data;
  return { ...rest, fields, name:fields.name, phase, ...(!changed && acceptedPlan ? { acceptedPlan } : {}) };
}
export function campaignSetupReadiness(fields: CampaignSetupFields) {
  const intent: string[] = [], audience: string[] = [], agent_content: string[] = [];
  for (const [key,label] of [['kind','Choose sales or feedback.'],['goal','Describe the campaign goal.'],['offeringId','Choose a reviewed product or service.']] as const) if (!fields[key]) intent.push(label);
  if (!fields.outcome?.label) intent.push('Name the desired outcome.');
  if (!fields.outcome?.evidenceRequired.length) intent.push('Specify evidence required for the outcome.');
  if (!fields.contactIds?.length) audience.push('Select at least one contact.');
  if (!fields.audienceRationale) audience.push('Explain why this audience is relevant.');
  if (!fields.name) agent_content.push('Name the campaign.');
  if (!fields.channel) agent_content.push('Choose a channel.');
  if (!fields.objective) agent_content.push('Describe the conversation objective.');
  if (!fields.message) agent_content.push('Write the opening message.');
  if (fields.channel === 'browser' && !fields.agentReleaseId) agent_content.push('Choose an active agent release.');
  if (fields.channel && fields.channel !== 'browser' && !fields.subject) agent_content.push('Add an email subject.');
  if (fields.channel === 'email' && !fields.emailConnectionId) agent_content.push('Choose a connected mailbox.');
  const review = [...intent,...audience,...agent_content];
  return { intent,audience,agent_content,review,ready:!review.length };
}
export function toCampaignDraftInput(fields: CampaignSetupFields) {
  const check = campaignSetupReadiness(fields); if (!check.ready) throw new Error(check.review.join(' '));
  return { name:fields.name!,kind:fields.kind!,objective:fields.objective!,channel:fields.channel!,emailConnectionId:fields.emailConnectionId,agentReleaseId:fields.agentReleaseId || '',subject:fields.subject || '',message:fields.message!,contactIds:fields.contactIds!,callBrief:fields.callBrief,successCriteria:fields.successCriteria,journeySteps:fields.journeySteps };
}
