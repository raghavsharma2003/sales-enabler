// Intake webhook secrets move into the workspace vault (open.2026-10-21.intake-hook-secret-vault). Each existing
// intake_source.hook_secret is sealed exactly as server/modules/workspace/crypto.ts seal() does (AES-256-GCM under
// VP_SECRET_KEY, purpose 'intake-hook', bound to the workspace), then the plaintext column is dropped, in one transaction.
// A rotation keeps the previous secret for an overlap window (hook_secret_prev_*), so live senders do not break.
// With no plaintext rows, no key is needed. With rows and no valid key, the migration stops and changes nothing.
import { createCipheriv, randomBytes } from 'node:crypto';

function key() {
  const raw = process.env.VP_SECRET_KEY ?? '';
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const b = raw ? Buffer.from(raw, 'base64') : Buffer.alloc(0);
  if (b.length === 32) return b;
  throw new Error('intake webhook secrets exist and must be encrypted: set VP_SECRET_KEY (32 bytes, hex or base64) and run the migration again');
}

export function sealWith(k, workspaceId, purpose, plaintext) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  c.setAAD(Buffer.from(`${workspaceId}|${purpose}`));
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export default async function migrate(client) {
  await client.query(`ALTER TABLE intake_source
    ADD COLUMN hook_secret_ciphertext text,
    ADD COLUMN hook_secret_prev_ciphertext text,
    ADD COLUMN hook_secret_prev_until timestamptz,
    ADD COLUMN hook_secret_rotated_at timestamptz`);
  const rows = (await client.query('SELECT id, workspace_id, hook_secret FROM intake_source WHERE hook_secret IS NOT NULL')).rows;
  if (rows.length) {
    const k = key();
    for (const r of rows) await client.query('UPDATE intake_source SET hook_secret_ciphertext = $2 WHERE id = $1', [r.id, sealWith(k, r.workspace_id, 'intake-hook', r.hook_secret)]);
  }
  await client.query('ALTER TABLE intake_source DROP COLUMN hook_secret');
}
