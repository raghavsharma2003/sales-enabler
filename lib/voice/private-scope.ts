import { createHash } from 'node:crypto';
import type { AuthUser } from '../server/auth';
import { db, type Database } from '../server/db';
import { HttpError } from '../server/http';
import { rowData, type ToolRow } from './tools/authority';

/** Shared pre-allocation and in-call consent boundary for linked private calls. */
export async function assertPrivateVoiceContactScope(user: Pick<AuthUser, 'organizationId'>, contactId?: string, options: { database?: Database } = {}): Promise<void> {
  if (!contactId) return; // Unlinked internal company-knowledge tests remain available.
  const database = options.database ?? await db();
  const row = async (kind: string, id: string) => (await database.all('SELECT id,kind,status,data,created_at FROM entities WHERE organization_id = ? AND kind = ? AND id = ?', [user.organizationId, kind, id]))[0] as ToolRow | undefined;
  const contact = await row('contact', contactId);
  const profileId = createHash('sha256').update(JSON.stringify([user.organizationId, contactId])).digest('hex');
  const profile = await row('platform:customer_profile', `customer-profile:${profileId}`);
  const customer = contact && rowData(contact), profileData = profile && rowData(profile);
  if (!contact || customer!.optOut === true || customer!.doNotContact === true || customer!.consent === 'denied' || !profile || profile.status !== 'active' || profileData!.contactId !== contactId || profileData!.consent?.browser_voice?.granted !== true) {
    throw new HttpError(403, 'Browser voice consent is required for this contact. Review the customer privacy settings before starting a call.');
  }
}
