import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpError } from '../lib/server/http';
import { accentForeground, exportPublicBrand } from '../lib/company/contracts';
import { validateLogoDataUri } from '../lib/company/validation';

function png(width: number, height: number): string {
  const bytes = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  bytes.writeUInt32BE(13, 8); Buffer.from('IHDR').copy(bytes, 12);
  bytes.writeUInt32BE(width, 16); bytes.writeUInt32BE(height, 20);
  return `data:image/png;base64,${bytes.toString('base64')}`;
}
const rejected = (pattern: RegExp) => (error: unknown) => error instanceof HttpError && error.status === 400 && pattern.test(error.message);

test('logo validation accepts bounded raster magic and rejects SVG, remote URLs, spoofed MIME and unsafe dimensions', () => {
  assert.equal(validateLogoDataUri(png(64, 64)), png(64, 64));
  assert.throws(() => validateLogoDataUri('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), rejected(/PNG, JPEG, or WebP/));
  assert.throws(() => validateLogoDataUri('https://example.test/logo.png'), rejected(/PNG, JPEG, or WebP/));
  assert.throws(() => validateLogoDataUri(`data:image/png;base64,${Buffer.from('not a png').toString('base64')}`), rejected(/contents/));
  assert.throws(() => validateLogoDataUri(png(8, 64)), rejected(/dimensions/));
  assert.throws(() => validateLogoDataUri(png(4096, 64)), rejected(/dimensions/));
  assert.throws(() => validateLogoDataUri(`data:image/png;base64,${Buffer.alloc(256 * 1024 + 1).toString('base64')}`), rejected(/256 KB/));
});

test('public brand export has explicit unverified metadata, accessible foreground and no private profile fields', () => {
  const profile = { name: 'Private legal name', publicDisplayName: 'Public Acme', website: 'https://acme.example', description: 'Private founder description', industry: 'Advisory', country: 'India', timezone: 'Asia/Kolkata', languages: ['English'], brandAccent: '#fff200', logoDataUri: png(64, 64) };
  const brand = exportPublicBrand(profile);
  assert.deepEqual({ name: brand.name, accent: brand.accent, onAccent: brand.onAccent, verification: brand.verification }, { name: 'Public Acme', accent: '#fff200', onAccent: '#242634', verification: 'workspace_profile_unverified' });
  assert.equal(JSON.stringify(brand).includes(profile.description), false);
  assert.equal(JSON.stringify(brand).includes(profile.website), false);
  assert.equal(accentForeground('#111111'), '#ffffff');
});
