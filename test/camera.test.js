import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modoDeCamera, motivoDaFalha, nomeDaFoto } from '../src/viewer/camera.js';

const comCapture = { createElement: () => ({ capture: '' }) };
const semCapture = { createElement: () => ({}) };

test('camera: escolhe o caminho conforme o que o navegador libera', () => {
  const seguro = { mediaDevices: { getUserMedia() {} } };
  assert.equal(modoDeCamera(seguro, comCapture), 'interna', 'endereco seguro: camera dentro do ID3D');
  assert.equal(modoDeCamera(seguro, semCapture), 'interna');
  assert.equal(modoDeCamera({}, comCapture), 'nativa', 'http no tablet: aplicativo de camera do aparelho');
  assert.equal(modoDeCamera({ mediaDevices: {} }, comCapture), 'nativa');
  assert.equal(modoDeCamera({}, semCapture), 'indisponivel', 'http no computador: sem camera');
});

test('camera: nome da foto traz data e hora e a extensao certa', () => {
  const quando = new Date(2026, 10, 13, 9, 5, 7);
  assert.equal(nomeDaFoto(quando, 'image/jpeg'), 'Foto 2026-11-13 09.05.07.jpg');
  assert.equal(nomeDaFoto(quando, 'image/png', 'IMG_0001.PNG'), 'Foto 2026-11-13 09.05.07.png');
  assert.equal(nomeDaFoto(quando, '', 'captura.JPEG'), 'Foto 2026-11-13 09.05.07.jpeg', 'sem tipo: usa a extensao original');
  assert.equal(nomeDaFoto(quando, '', 'sem-extensao'), 'Foto 2026-11-13 09.05.07.jpg');
  assert.match(nomeDaFoto(new Date(NaN), 'image/jpeg'), /^Foto \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}\.jpg$/, 'data invalida: usa a hora atual');
});

test('camera: falhas viram mensagens em portugues', () => {
  assert.match(motivoDaFalha({ name: 'NotAllowedError' }), /bloqueado/);
  assert.match(motivoDaFalha({ name: 'NotFoundError' }), /Nenhuma câmera/);
  assert.match(motivoDaFalha({ name: 'NotReadableError' }), /em uso/);
  assert.match(motivoDaFalha(new Error('qualquer coisa')), /Não foi possível abrir a câmera/);
  assert.match(motivoDaFalha(null), /Não foi possível abrir a câmera/);
});
