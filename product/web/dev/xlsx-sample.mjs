// A minimal synthetic .xlsx (first sheet, shared strings; formula cells carry a cached value) for the import screen's
// browser flow and screenshots. Built here so no binary fixture lives in the repo.
import zlib from 'node:zlib';

export function xlsxFile(rows) {
  const strings = [], idx = new Map(), sst = v => { if (!idx.has(v)) { idx.set(v, strings.length); strings.push(v); } return idx.get(v); };
  const esc = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const colName = i => String.fromCharCode(65 + i);
  const body = rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((c, ci) => { const ref = colName(ci) + (ri + 1);
    if (typeof c === 'number') return `<c r="${ref}"><v>${c}</v></c>`;
    if (c && typeof c === 'object') return `<c r="${ref}" t="str"><f>${esc(c.f)}</f><v>${esc(c.v)}</v></c>`;
    return `<c r="${ref}" t="s"><v>${sst(c)}</v></c>`; }).join('') + '</row>').join('');
  const X = t => Buffer.from('<?xml version="1.0" encoding="UTF-8"?>' + t);
  const files = [
    ['[Content_Types].xml', X('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')],
    ['xl/workbook.xml', X('<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="EMI list" sheetId="1" r:id="rId1"/></sheets></workbook>')],
    ['xl/_rels/workbook.xml.rels', X('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')],
    ['xl/sharedStrings.xml', X(`<sst>${strings.map(v => `<si><t>${esc(v)}</t></si>`).join('')}</sst>`)],
    ['xl/worksheets/sheet1.xml', X(`<worksheet><sheetData>${body}</sheetData></worksheet>`)],
  ];
  const parts = [], central = []; let off = 0;
  for (const [n, data] of files) {
    const name = Buffer.from(n), z = zlib.deflateRawSync(data), crc = zlib.crc32(data) >>> 0;
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 8); l.writeUInt32LE(crc, 14); l.writeUInt32LE(z.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(name.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(z.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(off, 42);
    parts.push(l, name, z); central.push(c, name); off += 30 + name.length + z.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}


/** The EMI list both the flow and the screenshots use (synthetic; one Devanagari number, one formula cell). */
export const EMI_ROWS = [
  ['Borrower name', 'Mobile', 'EMI Amount', 'Due date'],
  ['Kavita Nair', '९००००३०१०१', 4250, '05/12/2026'],
  ['Arjun Malhotra', { f: '"90000"&"30102"', v: '9000030102' }, 6100, '07/12/2026'],
];
