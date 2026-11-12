// Descompressao zlib/deflate (RFC 1950/1951) em JavaScript puro.
// E sincrona e ignora bytes extras apos o fim do stream, o que simplifica a leitura
// dos streams FlateDecode do PDF e das secoes comprimidas do PRC.

var LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
var LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
var DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
var DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
var CLORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function huff(lengths, n) {
  var count = new Uint16Array(16), symbol = new Uint16Array(n), offs = new Uint16Array(16), i;
  for (i = 0; i < n; i++) count[lengths[i]]++;
  count[0] = 0;
  for (i = 1; i < 16; i++) offs[i] = offs[i - 1] + count[i - 1];
  for (i = 0; i < n; i++) if (lengths[i]) symbol[offs[lengths[i]]++] = i;
  return { count: count, symbol: symbol };
}
var FIXL = null, FIXD = null;

export function inflate(src, pos, end) {
  pos = pos || 0;
  if (end === undefined) end = src.length;
  if ((src[pos] & 0x0f) !== 8 || ((src[pos] << 8) | src[pos + 1]) % 31 !== 0) throw new Error('stream zlib inválido');
  pos += 2;
  var out = new Uint8Array(Math.max(1024, (end - pos) * 3)), op = 0, bb = 0, bc = 0;
  function grow(n) {
    if (op + n <= out.length) return;
    var t = new Uint8Array(Math.max(out.length * 2, op + n)); t.set(out.subarray(0, op)); out = t;
  }
  function bits(n) {
    while (bc < n) { if (pos >= end) throw new Error('fim inesperado do stream comprimido'); bb |= src[pos++] << bc; bc += 8; }
    var v = bb & ((1 << n) - 1); bb >>>= n; bc -= n; return v;
  }
  function sym(h) {
    var code = 0, first = 0, index = 0;
    for (var len = 1; len <= 15; len++) {
      code |= bits(1);
      var c = h.count[len];
      if (code - c < first) return h.symbol[index + (code - first)];
      index += c; first += c; first <<= 1; code <<= 1;
    }
    throw new Error('código Huffman inválido');
  }
  var last, i;
  do {
    last = bits(1);
    var type = bits(2);
    if (type === 0) {
      bb = 0; bc = 0;
      var len = src[pos] | (src[pos + 1] << 8); pos += 4;
      grow(len); out.set(src.subarray(pos, pos + len), op); op += len; pos += len;
    } else if (type === 1 || type === 2) {
      var hl, hd;
      if (type === 1) {
        if (!FIXL) {
          var l = new Uint8Array(288);
          for (i = 0; i < 144; i++) l[i] = 8; for (; i < 256; i++) l[i] = 9; for (; i < 280; i++) l[i] = 7; for (; i < 288; i++) l[i] = 8;
          FIXL = huff(l, 288);
          var d = new Uint8Array(30); for (i = 0; i < 30; i++) d[i] = 5; FIXD = huff(d, 30);
        }
        hl = FIXL; hd = FIXD;
      } else {
        var nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
        var lens = new Uint8Array(320);
        for (i = 0; i < ncode; i++) lens[CLORD[i]] = bits(3);
        var hc = huff(lens, 19);
        lens = new Uint8Array(320);
        i = 0;
        while (i < nlen + ndist) {
          var s = sym(hc);
          if (s < 16) lens[i++] = s;
          else {
            var prev = 0, rep;
            if (s === 16) { prev = lens[i - 1]; rep = 3 + bits(2); }
            else if (s === 17) rep = 3 + bits(3);
            else rep = 11 + bits(7);
            while (rep--) lens[i++] = prev;
          }
        }
        hl = huff(lens, nlen);
        hd = huff(lens.subarray(nlen), ndist);
      }
      for (;;) {
        var c = sym(hl);
        if (c < 256) { grow(1); out[op++] = c; }
        else if (c === 256) break;
        else {
          c -= 257;
          var ln = LBASE[c] + bits(LEXT[c]);
          var ds = sym(hd);
          var dist = DBASE[ds] + bits(DEXT[ds]);
          grow(ln);
          for (var k = 0; k < ln; k++, op++) out[op] = out[op - dist];
        }
      }
    } else throw new Error('bloco deflate inválido');
  } while (!last);
  return out.subarray(0, op);
}
