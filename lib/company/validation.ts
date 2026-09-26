import { HttpError } from '../server/http';
import type { CompanyProfileValues } from './contracts';

const MAX_LOGO_BYTES = 256 * 1024;
const MAX_LOGO_DIMENSION = 2048;
const MIN_LOGO_DIMENSION = 16;

function text(input: Record<string, unknown>, key: string, max: number, required = false): string {
  const value = input[key];
  if ((value === undefined || value === null || value === '') && !required) return '';
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new HttpError(400, `${key} must be text between 1 and ${max} characters.`);
  return value.trim();
}

function dimensions(bytes: Buffer, mime: string): { width: number; height: number } | undefined {
  if (mime === 'image/png' && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (mime === 'image/jpeg' && bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      if (offset + 4 > bytes.length) return undefined;
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) return undefined;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
    return undefined;
  }
  if (mime === 'image/webp' && bytes.length >= 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const kind = bytes.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
    if (kind === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const packed = bytes.readUInt32LE(21);
      return { width: (packed & 0x3fff) + 1, height: ((packed >> 14) & 0x3fff) + 1 };
    }
  }
  return undefined;
}

export function validateLogoDataUri(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.length > 360_000) throw new HttpError(400, 'Logo must be a PNG, JPEG, or WebP image up to 256 KB.');
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/]+={0,2})$/i.exec(value);
  if (!match) throw new HttpError(400, 'Logo must be a PNG, JPEG, or WebP image. SVG and remote image URLs are not accepted.');
  let bytes: Buffer;
  try { bytes = Buffer.from(match[2], 'base64'); } catch { throw new HttpError(400, 'Logo data is not valid base64.'); }
  if (!bytes.length || bytes.length > MAX_LOGO_BYTES || bytes.toString('base64') !== match[2]) throw new HttpError(400, 'Logo must be a PNG, JPEG, or WebP image up to 256 KB.');
  const size = dimensions(bytes, match[1].toLowerCase());
  if (!size) throw new HttpError(400, 'Logo file contents do not match a supported PNG, JPEG, or WebP image.');
  if (size.width < MIN_LOGO_DIMENSION || size.height < MIN_LOGO_DIMENSION || size.width > MAX_LOGO_DIMENSION || size.height > MAX_LOGO_DIMENSION) throw new HttpError(400, `Logo dimensions must be between ${MIN_LOGO_DIMENSION} and ${MAX_LOGO_DIMENSION} pixels.`);
  return `data:${match[1].toLowerCase()};base64,${match[2]}`;
}

export function parseCompanyProfile(input: Record<string, unknown>): CompanyProfileValues {
  const name = text(input, 'name', 120, true);
  const publicDisplayName = text(input, 'publicDisplayName', 120, true);
  const website = text(input, 'website', 2048);
  if (website) {
    let url: URL;
    try { url = new URL(website); } catch { throw new HttpError(400, 'Website must be a complete HTTPS URL.'); }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw new HttpError(400, 'Website must be a complete HTTPS URL without embedded credentials.');
  }
  const timezone = text(input, 'timezone', 100, true);
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); } catch { throw new HttpError(400, 'Choose a valid IANA timezone.'); }
  if (!Array.isArray(input.languages) || input.languages.length < 1 || input.languages.length > 8) throw new HttpError(400, 'Choose between 1 and 8 company languages.');
  const languages = input.languages.map((value, index) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 50) throw new HttpError(400, `Language ${index + 1} must be between 1 and 50 characters.`);
    return value.trim();
  });
  if (new Set(languages.map(value => value.toLocaleLowerCase())).size !== languages.length) throw new HttpError(400, 'Company languages must be unique.');
  const brandAccent = text(input, 'brandAccent', 7, true).toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(brandAccent)) throw new HttpError(400, 'Brand accent must be a six-digit hex color such as #5148ce.');
  const logoDataUri = validateLogoDataUri(input.logoDataUri);
  return {
    name,
    publicDisplayName,
    website,
    description: text(input, 'description', 5000),
    industry: text(input, 'industry', 120),
    country: text(input, 'country', 100, true),
    timezone,
    languages,
    brandAccent,
    ...(logoDataUri ? { logoDataUri } : {}),
  };
}
