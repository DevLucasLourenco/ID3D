// API publica do nucleo: bytes de um PDF 3D (ou de um .prc) -> cena pronta para renderizar.

import { extractFromPDF } from './pdf.js';
import { parsePRC } from './prc-reader.js';
import { buildScene } from './scene.js';

// Ponto de entrada: bytes de um PDF (ou de um .prc puro) -> cena pronta para renderizar.
// Impressao digital do modelo (16 digitos hexadecimais), calculada sobre os bytes do PRC.
// Serve para associar dados externos (como anexos) a um modelo; nao e criptografica.
export function fingerprint(u8) {
  var h1 = 0x811c9dc5 ^ u8.length, h2 = 0x01000193;
  for (var i = 0; i < u8.length; i++) {
    h1 = Math.imul(h1 ^ u8[i], 0x01000193);
    h2 = Math.imul(h2 + u8[i], 0x85ebca6b) ^ (h2 >>> 13);
  }
  return ('0000000' + (h1 >>> 0).toString(16)).slice(-8) + ('0000000' + (h2 >>> 0).toString(16)).slice(-8);
}

export function load(u8) {
  var ex;
  if (u8[0] === 0x50 && u8[1] === 0x52 && u8[2] === 0x43) ex = { format: 'PRC', data: u8, views: [], info: {} };
  else ex = extractFromPDF(u8);
  if (ex.format !== 'PRC') throw new Error('Este PDF usa o formato ' + ex.format + ', que este visualizador ainda não decodifica (apenas PRC).');
  var prc = parsePRC(ex.data);
  var scene = buildScene(prc);
  scene.views = ex.views; scene.info = ex.info; scene.prcVersion = prc.version; scene.prcBytes = ex.data.length;
  scene.modelId = fingerprint(ex.data);
  return scene;
}

export { extractFromPDF, parsePRC, buildScene };
export { inflate } from './inflate.js';
export { normalMismatch, creaseNormals } from './normals.js';
