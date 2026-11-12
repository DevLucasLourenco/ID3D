// Embrulha um stream PRC em um PDF minimo com uma anotacao 3D e vistas salvas.

import { deflateSync } from 'node:zlib';

// Texto PDF: literal simples para ASCII, UTF-16BE com BOM para o resto.
function pdfText(s) {
  const ascii = /^[\x20-\x7e]*$/.test(s);
  const bytes = ascii ? Buffer.from(s, 'latin1') : Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(s, 'utf16le').swap16()]);
  let out = '(';
  for (const b of bytes) out += b === 0x28 || b === 0x29 || b === 0x5c ? '\\' + String.fromCharCode(b) : String.fromCharCode(b);
  return out + ')';
}
const num = (v) => (Math.abs(v) < 1e-9 ? '0' : Number(v.toFixed(6)).toString());

// views: [{ name, c2w: [12 numeros], co, ortho?, fov?, os? }]
export function wrapPDF(prc, { views = [], title = 'Modelo 3D', subject = '', width = 842, height = 595 } = {}) {
  const objects = [];                                   // objects[i] = corpo do objeto i+1
  const add = (body) => objects.push(body) && objects.length;
  const stream = deflateSync(Buffer.from(prc));

  const catalog = add(''), pages = add(''), page = add(''), annot = add(''), model = add('');
  const viewIds = views.map((v) => add(
    `<< /Type /3DView /XN ${pdfText(v.name)} /IN ${pdfText(v.name)} /MS /M /CO ${num(v.co)} ` +
    `/C2W [${v.c2w.map(num).join(' ')}] ` +
    (v.ortho ? `/P << /Subtype /O /OB /Min /OS ${num(v.os)} >>` : `/P << /Subtype /P /PS /Min /FOV ${num(v.fov ?? 45)} >>`) + ' >>'));
  const info = add(`<< /Title ${pdfText(title)} /Subject ${pdfText(subject)} /Creator (ID3D) >>`);
  const va = viewIds.map((id) => `${id} 0 R`).join(' ');

  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
  objects[pages - 1] = `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`;
  objects[page - 1] = `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${width} ${height}] /Annots [${annot} 0 R] >>`;
  objects[annot - 1] = `<< /Type /Annot /Subtype /3D /Rect [10 10 ${width - 10} ${height - 10}] /P ${page} 0 R /F 68 ` +
    `/Contents (3D Model) /3DA << /A /PO /D /PC /TB false /NP true >> /3DD ${model} 0 R` +
    (viewIds.length ? ` /3DV ${viewIds[0]} 0 R` : '') + ' >>';
  objects[model - 1] = { dict: `<< /Type /3D /Subtype /PRC /Filter /FlateDecode${va ? ` /VA [${va}]` : ''} /Length ${stream.length} >>`, stream };

  const parts = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')], offsets = [];
  let pos = parts[0].length;
  const push = (b) => { parts.push(b); pos += b.length; };
  objects.forEach((body, i) => {
    offsets.push(pos);
    if (typeof body === 'string') push(Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, 'latin1'));
    else {
      push(Buffer.from(`${i + 1} 0 obj\n${body.dict}\nstream\n`, 'latin1'));
      push(body.stream);
      push(Buffer.from('\nendstream\nendobj\n', 'latin1'));
    }
  });
  const xref = pos;
  let table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) table += String(o).padStart(10, '0') + ' 00000 n \n';
  push(Buffer.from(`${table}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`, 'latin1'));
  return new Uint8Array(Buffer.concat(parts));
}
