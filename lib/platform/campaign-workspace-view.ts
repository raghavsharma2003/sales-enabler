import type { PlatformRecord } from './contracts';
import { readCampaignSetup, type CampaignPhase, type CampaignSetupFields } from './campaign-workflow';
import type { CampaignIntent } from '../business/contracts';

export const campaignPhases: { id: CampaignPhase; label: string }[] = [
  { id: 'intent', label: 'Intent' }, { id: 'audience', label: 'Audience' },
  { id: 'agent_content', label: 'Agent & content' }, { id: 'review', label: 'Review' },
  { id: 'run', label: 'Run' }, { id: 'results', label: 'Results' },
];
export type CampaignRoute = { campaignId?: string; phase?: CampaignPhase; offeringId?: string; planId?: string; newDraft?: boolean };
export function parseCampaignRoute(focusId?: string): CampaignRoute {
  if (!focusId) return {};
  if (focusId === 'new') return { newDraft: true };
  if (focusId.startsWith('offering:')) return { newDraft: true, offeringId: focusId.slice(9) };
  if (focusId.startsWith('plan:')) return { planId: focusId.slice(5) };
  if (focusId.startsWith('campaign-plan:')) return { planId: focusId };
  const separator = focusId.lastIndexOf('~');
  const suffix = focusId.slice(separator + 1);
  if (separator > 0 && campaignPhases.some(item => item.id === suffix)) return { campaignId: focusId.slice(0, separator), phase: suffix as CampaignPhase };
  return { campaignId: focusId };
}
export const campaignFocus = (id: string, phase: CampaignPhase) => `${id}~${phase}`;
export const campaignNavigationNeedsSave = (record: PlatformRecord | undefined, dirty: boolean) => !record || dirty;
/** Textarea editing may temporarily include blank rows; do not persist invalid column labels. */
export function campaignEditorPatch(fields: CampaignSetupFields): CampaignSetupFields {
  return { ...fields,
    ...(fields.outcome ? { outcome: { ...fields.outcome, evidenceRequired: fields.outcome.evidenceRequired.map(item => item.trim()).filter(Boolean) } } : {}),
    ...(fields.reviewColumns ? { reviewColumns: fields.reviewColumns.filter(column => column.label.trim()).map(column => ({ ...column, label: column.label.trim() })) } : {}),
  };
}
export const newCampaignFields = (offeringId = ''): CampaignSetupFields => ({ name: '', kind: 'sales', goal: '', offeringId, outcome: { label: '', evidenceRequired: [] }, audienceRationale: '', contactIds: [], channel: 'browser', objective: '', message: '', signalIds: [], reviewColumns: [], sourceIds: [] });
const text = (value: unknown) => typeof value === 'string' ? value : '';
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
export function campaignEditorFields(record: PlatformRecord): CampaignSetupFields {
  const setup = readCampaignSetup(record);
  if (setup) return structuredClone(setup.fields);
  const data = record.data;
  const archivedFields = readCampaignSetup({ status: 'setup', data: data.setupDraft })?.fields;
  const intent = data.explicitIntentV1 as CampaignIntent | undefined;
  return {
    name: text(data.name), kind: data.kind === 'feedback' ? 'feedback' : 'sales', goal: text(archivedFields?.goal) || text(data.goal) || text(data.objective),
    offeringId: intent?.offering?.id || '', outcome: intent?.outcome || { label: '', evidenceRequired: [] },
    audienceRationale: intent?.audienceRationale || '', reviewColumns: intent?.reviewColumns || [], signalIds: intent?.signalAnchors?.map(item => item.id) || [],
    sourceIds: strings(archivedFields?.sourceIds ?? data.sourceIds),
    contactIds: strings(data.contactIds), channel: data.channel === 'email' || data.channel === 'manual_email' ? data.channel : 'browser',
    emailConnectionId: text(data.emailConnectionId), agentReleaseId: text(data.agentReleaseId), subject: text(data.subject),
    objective: text(data.objective), message: text(data.message), callBrief: text(data.callBrief), successCriteria: text(data.successCriteria), journeySteps: strings(data.journeySteps),
  };
}
export function initialCampaignPhase(record?: PlatformRecord, requested?: CampaignPhase): CampaignPhase {
  if (requested) return requested;
  if (!record) return 'intent';
  return readCampaignSetup(record)?.phase || (record.status === 'draft' ? 'review' : ['completed', 'cancelled'].includes(record.status) ? 'results' : 'run');
}
export function legacyCampaignPatch(fields: CampaignSetupFields) {
  return { name: fields.name || '', kind: fields.kind, objective: fields.objective || '', channel: fields.channel, emailConnectionId: fields.emailConnectionId || '', agentReleaseId: fields.agentReleaseId || '', subject: fields.subject || '', message: fields.message || '', contactIds: fields.contactIds || [] };
}
