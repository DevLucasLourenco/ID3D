// API publica do nucleo: bytes de um PDF 3D (ou de um .prc) -> cena pronta para renderizar.

import { extractFromPDF } from './pdf.js';
import { parsePRC } from './prc-reader.js';
import { buildScene } from './scene.js';

// Ponto de entrada: bytes de um PDF (ou de um .prc puro) -> cena pronta para renderizar.
export function load(u8) {
  var ex;
  if (u8[0] === 0x50 && u8[1] === 0x52 && u8[2] === 0x43) ex = { format: 'PRC', data: u8, views: [], info: {} };
  else ex = extractFromPDF(u8);
  if (ex.format !== 'PRC') throw new Error('Este PDF usa o formato ' + ex.format + ', que este visualizador ainda não decodifica (apenas PRC).');
  var prc, scene;
  try {
    prc = parsePRC(ex.data);
    scene = buildScene(prc);
  } catch (e) {
    // Erros do proprio leitor ja vem com mensagem em portugues. Qualquer outro (RangeError,
    // TypeError...) e o motor JavaScript tropecando em dados invalidos: a mensagem dele
    // viria em ingles e nao ajudaria quem esta usando o visualizador.
    if (e && e.constructor === Error) throw e;
    throw new Error('O modelo 3D deste arquivo parece estar corrompido ou incompleto.', { cause: e });
  }
  scene.views = ex.views; scene.info = ex.info; scene.prcVersion = prc.version; scene.prcBytes = ex.data.length;
  return scene;
}

export { extractFromPDF, parsePRC, buildScene };
export { inflate } from './inflate.js';
export { normalMismatch, creaseNormals } from './normals.js';
