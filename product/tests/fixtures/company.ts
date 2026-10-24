// A synthetic company for the company-data tests: Nirmal Water Purifiers (fictional), Pune. A small website (with a
// robots.txt that keeps one folder private, an off-site link, a price and a date in prose, and a page that never
// answers), a one-page PDF brochure, and an offerings sheet as CSV and as .xlsx. No real business, number or person.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { crc32, deflateRawSync } from 'node:zlib';

const page = (title: string, body: string, links: string[] = []) => `<!doctype html><html><head><title>${title}</title><style>.x{}</style><script>var t=1</script></head>
<body><nav><a href="/">Home</a> <a href="/about">About</a> <a href="/service">Service</a> <a href="/plans">Plans</a></nav>
<main>${body}${links.map(l => `<p><a href="${l}">${l}</a></p>`).join('')}</main><footer>Copyright Nirmal Water Purifiers</footer></body></html>`;

export const SITE: Record<string, string> = {
  '/robots.txt': 'User-agent: *\nDisallow: /internal/\n\nUser-agent: OtherBot\nDisallow: /\n',
  '/': page('Nirmal Water Purifiers, Pune', `<h1>Clean water at home</h1><p>Nirmal Water Purifiers installs and services water purifiers for homes in Pune.
    We are a family business and we answer our own phones.</p><p>Every purifier comes with free installation by a trained technician.</p>`,
    ['/about', '/service', '/plans', '/internal/staff', 'https://elsewhere.example/partner', '/brochure.pdf', '/slow']),
  '/about': page('About us', `<p>Nirmal Water Purifiers has served Pune homes since 2009.</p>
    <p>We service purifiers across Pune, Pimpri and Chinchwad within 48 hours of a complaint.</p>
    <p>Filters should be changed every six months so the water stays clean and safe.</p>`),
  '/service': page('Service', `<p>Our helpline is open Monday to Saturday, from nine in the morning to seven in the evening.</p>
    <p>You can book a service visit on WhatsApp or by calling the helpline number on your bill.</p>`),
  '/plans': page('Plans', `<p>AquaPure Gold is now just ₹12,999 for a limited time only.</p><p>The offer is valid till 31 March for new customers in Pune.</p>
    <p>Every plan includes a free water quality test at your home during installation.</p>`),
  '/internal/staff': page('Staff only', '<p>Staff rota and internal notes that must never be read by a robot at all.</p>'),
};

/** The fixture website on 127.0.0.1 (tests set VP_FETCH_ALLOW_PRIVATE=1 to read it). /slow never answers. */
export async function startSite(): Promise<{ base: string; server: Server; hits: string[] }> {
  const hits: string[] = [];
  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0];
    hits.push(path);
    if (path === '/slow') return;                     // never answers: the per-page timeout must skip it
    const body = SITE[path];
    if (!body) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'content-type': path.endsWith('.txt') ? 'text/plain' : 'text/html; charset=utf-8' });
    res.end(body);
  });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok));
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server, hits };
}

/** A valid one-page PDF with the given lines of text (Helvetica, no compression). */
export function pdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, m => '\\' + m);
  const stream = 'BT /F1 12 Tf 72 720 Td ' + lines.map((l, i) => (i ? '0 -18 Td ' : '') + `(${esc(l)}) Tj`).join(' ') + ' ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

export const BROCHURE = pdf([
  'Nirmal Water Purifiers: care guide',
  'Every Nirmal purifier carries a warranty on parts and labour for the first year.',
  'A technician visits within two working days of a service request in Pune.',
]);

export const SHEET_ROWS = [
  ['Plan', 'Price', 'Valid until', 'Free services a year'],
  ['AquaPure Basic', '₹8,999', '31/03/2027', '2'],
  ['AquaPure Gold', '₹12,999', '31/03/2027', '4'],
];
export const SHEET_CSV = SHEET_ROWS.map(r => r.map(c => /[,"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(',')).join('\n') + '\n';

function zip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name), body = deflateRawSync(f.data), crc = crc32(f.data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(f.data.length, 22); local.writeUInt16LE(name.length, 26);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(body.length, 20); cd.writeUInt32LE(f.data.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(offset, 42);
    parts.push(local, name, body); central.push(cd, name);
    offset += 30 + name.length + body.length;
  }
  const cdBuf = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}

/** The same sheet as an .xlsx (inline strings). */
export function sheetXlsx(rows: string[][] = SHEET_ROWS): Buffer {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const col = (i: number) => String.fromCharCode(65 + i);
  const body = rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((c, ci) => `<c r="${col(ci)}${ri + 1}" t="inlineStr"><is><t>${esc(c)}</t></is></c>`).join('') + '</row>').join('');
  const X = (s: string) => Buffer.from('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + s);
  return zip([
    { name: '[Content_Types].xml', data: X('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>') },
    { name: '_rels/.rels', data: X('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: X('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Plans" sheetId="1" r:id="rId1"/></sheets></workbook>') },
    { name: 'xl/_rels/workbook.xml.rels', data: X('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>') },
    { name: 'xl/worksheets/sheet1.xml', data: X(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`) },
  ]);
}
