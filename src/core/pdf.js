// Localiza a anotacao 3D em um PDF e extrai o stream do modelo, as vistas salvas e os
// metadados do documento. Nao e um parser de PDF completo: cobre o que os PDFs 3D usam.

import { inflate } from './inflate.js';

function latin1(u8, a, b) {
  var s = '', CH = 0x8000;
  for (var i = a; i < b; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, Math.min(b, i + CH)));
  return s;
}
export function pdfString(raw) {
  // raw: conteudo entre parenteses (latin1, com escapes)
  var out = [], i = 0;
  while (i < raw.length) {
    var c = raw.charCodeAt(i++);
    if (c === 0x5c) {
      var e = raw[i++];
      if (e === 'n') out.push(10); else if (e === 'r') out.push(13); else if (e === 't') out.push(9);
      else if (e === 'b') out.push(8); else if (e === 'f') out.push(12);
      else if (e >= '0' && e <= '7') {
        var o = e; while (o.length < 3 && raw[i] >= '0' && raw[i] <= '7') o += raw[i++];
        out.push(parseInt(o, 8) & 255);
      } else if (e === '\r') { if (raw[i] === '\n') i++; } else if (e === '\n') { /* continuacao */ }
      else out.push(e.charCodeAt(0));
    } else out.push(c);
  }
  if (out[0] === 0xfe && out[1] === 0xff) {
    var s = '';
    for (i = 2; i + 1 < out.length; i += 2) s += String.fromCharCode((out[i] << 8) | out[i + 1]);
    return s;
  }
  return String.fromCharCode.apply(null, out);
}

export function extractFromPDF(u8) {
  var text = latin1(u8, 0, u8.length);
  if (text.slice(0, 1024).indexOf('%PDF-') < 0) throw new Error('O arquivo não parece ser um PDF.');
  var objRe = /(\d+)\s+(\d+)\s+obj\b/g, m, objs = {}, order = [];
  while ((m = objRe.exec(text))) { objs[m[1]] = m.index + m[0].length; order.push(+m[1]); }
  function objBody(num) {
    var s = objs[num]; if (s === undefined) return null;
    var st = text.indexOf('stream', s), en = text.indexOf('endobj', s);
    // dicionario vai ate "stream" (se houver, antes de endobj) ou ate endobj
    return { start: s, dict: text.slice(s, st >= 0 && (en < 0 || st < en) ? st : en), streamKw: st >= 0 && (en < 0 || st < en) ? st : -1 };
  }
  function streamBytes(num) {
    var b = objBody(num); if (!b || b.streamKw < 0) return null;
    var p = b.streamKw + 6;
    if (text[p] === '\r' && text[p + 1] === '\n') p += 2; else if (text[p] === '\n' || text[p] === '\r') p += 1;
    var len, lm = /\/Length\s+(\d+)(\s+(\d+)\s+R)?/.exec(b.dict);
    if (lm && !lm[2]) len = +lm[1];
    else if (lm && lm[2]) { var lb = objBody(lm[1]); if (lb) len = parseInt(lb.dict, 10); }
    if (!(len > 0) || text.slice(p + len, p + len + 20).indexOf('endstream') < 0) {
      var e = text.indexOf('endstream', p); if (e < 0) return null;
      len = e - p;
      while (len > 0 && (u8[p + len - 1] === 10 || u8[p + len - 1] === 13)) len--;
    }
    var raw = u8.subarray(p, p + len);
    if (/\/Filter\s*(\[\s*)?\/(FlateDecode|Fl)\b/.test(b.dict)) return inflate(raw, 0, raw.length);
    if (/\/Filter/.test(b.dict)) throw new Error('Filtro de stream PDF não suportado: ' + /\/Filter\s*[^/]*\/(\w+)/.exec(b.dict)[1]);
    return raw;
  }
  if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(text)) throw new Error('PDF criptografado ou protegido por senha: não é possível extrair o modelo.');
  var found = null, i;
  for (i = 0; i < order.length && !found; i++) {
    var b = objBody(order[i]);
    if (b.streamKw < 0) continue;
    var sm = /\/Subtype\s*\/(PRC|U3D)\b/.exec(b.dict);
    if (sm && /\/Type\s*\/3D\b/.test(b.dict)) found = { num: order[i], format: sm[1], dict: b.dict };
  }
  if (!found) throw new Error('Nenhum modelo 3D (anotação /3D com stream PRC ou U3D) foi encontrado neste PDF.');
  // vistas salvas
  var views = [], seen = {};
  var va = /\/VA\s*\[([^\]]*)\]/.exec(found.dict);
  var refs = va ? (va[1].match(/\d+\s+\d+\s+R/g) || []).map(function (r) { return parseInt(r, 10); }) : [];
  refs.forEach(function (num) {
    if (seen[num]) return; seen[num] = 1;
    var b = objBody(num); if (!b) return;
    var d = b.dict, v = {};
    var nm = /\/XN\s*\(((?:\\.|[^\\)])*)\)/.exec(d) || /\/IN\s*\(((?:\\.|[^\\)])*)\)/.exec(d);
    v.name = nm ? pdfString(nm[1]) : 'Vista ' + (views.length + 1);
    var c2w = /\/C2W\s*\[([^\]]*)\]/.exec(d);
    if (!c2w) return;
    v.c2w = c2w[1].trim().split(/\s+/).map(Number);
    if (v.c2w.length !== 12 || v.c2w.some(isNaN)) return;
    var co = /\/CO\s+([-\d.eE+]+)/.exec(d); v.co = co ? +co[1] : 0;
    var pr = /\/P\s*<<([^>]*)>>/.exec(d);
    if (pr) {
      v.ortho = /\/Subtype\s*\/O\b/.test(pr[1]);
      var fov = /\/FOV\s+([-\d.eE+]+)/.exec(pr[1]); if (fov) v.fov = +fov[1];
      var os = /\/OS\s+([-\d.eE+]+)/.exec(pr[1]); if (os) v.os = +os[1];
    }
    var bg = /\/BG\s*<<[^>]*\/C\s*\[([^\]]*)\]/.exec(d);
    if (bg) v.background = bg[1].trim().split(/\s+/).map(Number);
    views.push(v);
  });
  var info = {};
  ['Title', 'Author', 'Subject', 'Creator'].forEach(function (k) {
    var r = new RegExp('/' + k + '\\s*\\(((?:\\\\.|[^\\\\)])*)\\)').exec(text);
    if (r) info[k.toLowerCase()] = pdfString(r[1]);
  });
  return { format: found.format, data: streamBytes(found.num), views: views, info: info };
}
