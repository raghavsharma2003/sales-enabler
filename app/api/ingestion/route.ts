import { requireUser, assertSameOrigin } from '@/lib/server/auth';
import { apiError, field, HttpError, json, readBody } from '@/lib/server/http';
import { createIngestionSource, listIngestionSources } from '@/lib/ingestion/engine';
import { extractBinaryText } from '@/lib/ingestion/extract';
import type { SourceFormat } from '@/lib/ingestion/contracts';

export const runtime = 'nodejs';

const EXTENSIONS: Record<string, SourceFormat> = { txt: 'txt', md: 'md', markdown: 'md', csv: 'csv', json: 'json', html: 'html', htm: 'html', eml: 'eml', pdf: 'pdf', docx: 'docx' };
const MAX_UPLOAD_BYTES = 524_288;

async function boundedBody(request: Request): Promise<Buffer> {
  if (Number(request.headers.get('content-length') || 0) > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Upload exceeds the 512 KB limit.');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, 'Upload body is required.');
  const chunks: Uint8Array[] = []; let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > MAX_UPLOAD_BYTES) { await reader.cancel(); throw new HttpError(413, 'Upload exceeds the 512 KB limit.'); }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks);
}

export async function GET(request: Request): Promise<Response> {
  try { return json({ sources: await listIngestionSources(await requireUser(request)) }); }
  catch (error) { return apiError(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const user = await requireUser(request);
    const contentType = request.headers.get('content-type')?.toLowerCase() || '';
    if (contentType.includes('multipart/form-data')) {
      const bytes = await boundedBody(request);
      let parsed: FormData;
      try { parsed = await new Request(request.url, { method: 'POST', headers: { 'content-type': request.headers.get('content-type') || '' }, body: new Uint8Array(bytes) }).formData(); }
      catch { throw new HttpError(400, 'Malformed multipart upload.'); }
      const file = parsed.get('file');
      if (!(file instanceof File)) throw new HttpError(400, 'A file is required.');
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      const format = EXTENSIONS[extension];
      if (!format) throw new HttpError(415, 'Upload .txt, .md, .csv, .json, .html, .eml, .pdf, or .docx.');
      if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'File exceeds the 512 KB limit.');
      const rawBytes = Buffer.from(await file.arrayBuffer());
      if (format !== 'pdf' && format !== 'docx' && rawBytes.includes(0)) throw new HttpError(415, 'File is not UTF-8 text.');
      let decoded: string;
      try { decoded = format === 'pdf' || format === 'docx' ? await extractBinaryText(rawBytes, format) : new TextDecoder('utf-8', { fatal: true }).decode(rawBytes); }
      catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(415, 'File is not valid UTF-8 text.'); }
      const titleValue = parsed.get('title');
      const title = typeof titleValue === 'string' && titleValue.trim() ? titleValue : file.name;
      return json({ source: await createIngestionSource(user, { title, text: decoded, kind: 'upload', format, filename: file.name, rawBytes }) }, 201);
    }
    const body = await readBody(request);
    const kind = body.kind;
    if (kind !== 'paste' && kind !== 'webhook') throw new HttpError(400, 'JSON sources must be paste or webhook.');
    const text = body.text;
    if (typeof text !== 'string' || !text.trim() || text.length > 240_000) throw new HttpError(400, 'text must be between 1 and 240,000 characters.');
    const format = body.format === undefined ? 'txt' : body.format;
    if (typeof format !== 'string' || !['txt', 'md', 'csv', 'json', 'html', 'eml'].includes(format)) throw new HttpError(415, 'Unsupported JSON source format.');
    return json({ source: await createIngestionSource(user, { title: field(body, 'title', 200), text, kind, format: format as SourceFormat }) }, 201);
  } catch (error) { return apiError(error); }
}
