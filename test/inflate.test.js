import { test } from 'node:test';
import assert from 'node:assert/strict';
import { constants, deflateSync } from 'node:zlib';
import { inflate } from '../src/core/inflate.js';

function sampleData(size) {
  const out = new Uint8Array(size);
  let seed = 12345;
  for (let i = 0; i < size; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    // mistura trechos repetitivos com ruido para exercitar literais e copias
    out[i] = i % 97 < 60 ? (i * 7) & 0xff : seed >>> 24;
  }
  return out;
}

const cases = [
  ['huffman dinamico', {}],
  ['huffman fixo', { strategy: constants.Z_FIXED }],
  ['blocos armazenados', { level: 0 }],
  ['compressao maxima', { level: 9 }],
];

for (const [name, options] of cases) {
  test(`inflate: ${name}`, () => {
    const data = sampleData(200_000);
    const packed = new Uint8Array(deflateSync(data, options));
    assert.deepEqual(inflate(packed, 0, packed.length), data);
  });
}

test('inflate: stream vazio e limites dentro de um buffer maior', () => {
  const empty = new Uint8Array(deflateSync(new Uint8Array(0)));
  assert.equal(inflate(empty).length, 0);

  const data = sampleData(5000), packed = deflateSync(data);
  const padded = new Uint8Array(packed.length + 20).fill(0xaa);
  padded.set(packed, 7);
  assert.deepEqual(inflate(padded, 7, 7 + packed.length), data);
  // bytes extras depois do fim do stream sao ignorados
  assert.deepEqual(inflate(padded, 7), data);
});

test('inflate: rejeita dados que nao sao zlib e streams truncados', () => {
  assert.throws(() => inflate(new Uint8Array([1, 2, 3, 4])), /zlib/);
  const packed = new Uint8Array(deflateSync(sampleData(5000)));
  assert.throws(() => inflate(packed.subarray(0, packed.length >> 1)));
});
