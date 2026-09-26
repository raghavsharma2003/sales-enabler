import { HttpError } from '../server/http';

const MAX_TEXT_CHARS = 240_000;
const MAX_PDF_PAGES = 30;
const MAX_DOCX_FILES = 200;
const MAX_DOCX_UNCOMPRESSED_BYTES = 4_000_000;

function checkDocxArchive(bytes: Buffer): void {
  // Inspect central-directory sizes before Mammoth inflates any XML or media.
  let eocd = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65_557); at--) {
    if (bytes.readUInt32LE(at) === 0x06054b50) { eocd = at; break; }
  }
  if (eocd < 0) throw new HttpError(415, 'Invalid DOCX archive.');
  const entries = bytes.readUInt16LE(eocd + 10), directoryBytes = bytes.readUInt32LE(eocd + 12), directoryOffset = bytes.readUInt32LE(eocd + 16);
  if (entries > MAX_DOCX_FILES || entries === 0xffff || directoryOffset === 0xffffffff || directoryOffset + directoryBytes > eocd) throw new HttpError(413, 'DOCX archive exceeds parser limits.');
  let at = directoryOffset, total = 0, hasDocument = false;
  for (let index = 0; index < entries; index++) {
    if (at + 46 > eocd || bytes.readUInt32LE(at) !== 0x02014b50) throw new HttpError(415, 'Invalid DOCX directory.');
    const flags = bytes.readUInt16LE(at + 8), compression = bytes.readUInt16LE(at + 10), compressed = bytes.readUInt32LE(at + 20), uncompressed = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28), extraLength = bytes.readUInt16LE(at + 30), commentLength = bytes.readUInt16LE(at + 32);
    if (flags & 1 || ![0, 8].includes(compression) || compressed === 0xffffffff || uncompressed === 0xffffffff) throw new HttpError(415, 'Encrypted or unsupported DOCX archive.');
    if (at + 46 + nameLength + extraLength + commentLength > eocd) throw new HttpError(415, 'Invalid DOCX directory.');
    const name = bytes.toString('utf8', at + 46, at + 46 + nameLength);
    if (name === 'word/document.xml') hasDocument = true;
    total += uncompressed;
    if (total > MAX_DOCX_UNCOMPRESSED_BYTES) throw new HttpError(413, 'DOCX expanded content exceeds the 4 MB limit.');
    at += 46 + nameLength + extraLength + commentLength;
  }
  if (!hasDocument) throw new HttpError(415, 'DOCX document text is missing.');
}

export async function extractBinaryText(bytes: Buffer, format: 'pdf' | 'docx'): Promise<string> {
  if (bytes.length > 524_288) throw new HttpError(413, 'File exceeds the 512 KB limit.');
  if (format === 'docx') {
    checkDocxArchive(bytes);
    const mammoth = await import('mammoth');
    let result: Awaited<ReturnType<typeof mammoth.extractRawText>>;
    try { result = await mammoth.extractRawText({ buffer: bytes }); }
    catch { throw new HttpError(415, 'Could not read this DOCX file.'); }
    if (!result.value.trim()) throw new HttpError(422, 'No readable text found in the DOCX.');
    if (result.value.length > MAX_TEXT_CHARS) throw new HttpError(413, 'Extracted text exceeds the 240,000 character limit.');
    return result.value;
  }
  if (!bytes.subarray(0, 1024).toString('latin1').includes('%PDF-')) throw new HttpError(415, 'Invalid PDF file.');
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes), isEvalSupported: false });
  try {
    const info = await parser.getInfo();
    if (info.total > MAX_PDF_PAGES) throw new HttpError(413, `PDF has more than ${MAX_PDF_PAGES} pages. Split it before uploading.`);
    const result = await parser.getText({ first: MAX_PDF_PAGES, parseHyperlinks: false });
    if (!result.text.trim()) throw new HttpError(422, 'No readable PDF text found. This may be a scanned document and needs OCR.');
    if (result.text.length > MAX_TEXT_CHARS) throw new HttpError(413, 'Extracted text exceeds the 240,000 character limit.');
    return result.text;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(415, 'Could not read this PDF file.');
  } finally { await parser.destroy(); }
}
