// Leitor do fluxo de bits do PRC: inteiros de tamanho variavel, strings e doubles comprimidos.

import { doubleTable } from './prc-double-table.js';

var dv8 = new DataView(new ArrayBuffer(8));
var utf8 = new TextDecoder('utf-8');

export function BitReader(u8) { this.d = u8; this.p = 0; this.end = u8.length * 8; }
BitReader.prototype = {
  bit: function () {
    if (this.p >= this.end) throw new Error('fim inesperado dos dados do PRC');
    var b = (this.d[this.p >> 3] >> (7 - (this.p & 7))) & 1; this.p++; return b;
  },
  bits: function (n) { var v = 0; for (var i = 0; i < n; i++) v = v * 2 + this.bit(); return v; },
  byte: function () {
    if (this.p + 8 > this.end) throw new Error('fim inesperado dos dados do PRC');
    var i = this.p >> 3, o = this.p & 7; this.p += 8;
    return o === 0 ? this.d[i] : ((this.d[i] << o) | (this.d[i + 1] >> (8 - o))) & 0xff;
  },
  uint: function () {
    var v = 0, m = 1;
    while (this.bit()) { v += this.byte() * m; m *= 256; }
    return v;
  },
  int: function () {
    var v = 0, m = 1, last = 0;
    while (this.bit()) { last = this.byte(); v += last * m; m *= 256; }
    if (m > 1 && (last & 0x80)) v -= m;
    return v;
  },
  string: function () {
    if (!this.bit()) return '';
    var n = this.uint();
    if (n > (this.end - this.p) / 8) throw new Error('texto PRC inválido');
    var b = new Uint8Array(n);
    for (var i = 0; i < n; i++) b[i] = this.byte();
    return utf8.decode(b);
  },
  double: function () {
    var T = doubleTable(), code = 0, nb = 0, e;
    for (;;) {
      code = code * 2 + this.bit(); nb++;
      e = T.get(nb * 4194304 + code);
      if (e) break;
      if (nb > 22) throw new Error('double PRC inválido');
    }
    if (e.isDouble && e.upper === 0 && e.lower === 0) return 0;
    var neg = this.bit();
    var upper = e.upper, lower = e.lower;
    if (!e.isDouble && this.bit()) {
      var by = new Uint8Array(8);
      by[7] = (upper >>> 24) & 0xff;
      by[6] = ((upper >>> 16) & 0xf0) | this.bits(4);
      var i = 5;
      while (i >= 0) {
        if (this.bit()) { by[i--] = this.byte(); }
        else {
          var d = this.bits(3);
          if (d === 0) { for (; i >= 0; i--) by[i] = by[i + 1]; }
          else if (d === 6) { for (; i >= 1; i--) by[i] = by[i + 1]; by[0] = this.byte(); i = -1; }
          else { by[i] = by[i + d]; i--; }
        }
      }
      upper = ((by[7] << 24) | (by[6] << 16) | (by[5] << 8) | by[4]) >>> 0;
      lower = ((by[3] << 24) | (by[2] << 16) | (by[1] << 8) | by[0]) >>> 0;
    }
    dv8.setUint32(0, (upper | (neg ? 0x80000000 : 0)) >>> 0);
    dv8.setUint32(4, lower);
    return dv8.getFloat64(0);
  }
};
