import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BitReader } from '../src/core/bit-reader.js';
import { BitWriter } from '../scripts/lib/prc-writer.mjs';

const reader = (w) => new BitReader(w.toBytes());

test('bits e bytes desalinhados', () => {
  const w = new BitWriter().bit(1).byte(0xa5).bits(5, 3).bit(0).byte(0xff);
  const r = reader(w);
  assert.equal(r.bit(), 1);
  assert.equal(r.byte(), 0xa5);
  assert.equal(r.bits(3), 5);
  assert.equal(r.bit(), 0);
  assert.equal(r.byte(), 0xff);
});

test('inteiros sem sinal de tamanho variavel', () => {
  const values = [0, 1, 127, 128, 255, 256, 65535, 65536, 305, 0x7fffffff, 0xffffffff];
  const w = new BitWriter();
  values.forEach((v) => w.uint(v));
  const r = reader(w);
  assert.deepEqual(values.map(() => r.uint()), values);
});

test('inteiros com sinal de tamanho variavel', () => {
  const values = [0, 1, -1, 127, 128, -128, -129, 255, 256, -32768, 8137, 2147483647, -2147483648];
  const w = new BitWriter();
  values.forEach((v) => w.int(v));
  const r = reader(w);
  assert.deepEqual(values.map(() => r.int()), values);
});

test('strings UTF-8, inclusive vazia', () => {
  const values = ['', 'XV-001', '4"-AG-001', 'Válvula 90° – ação', ''];
  const w = new BitWriter();
  values.forEach((v) => w.string(v));
  const r = reader(w);
  assert.deepEqual(values.map(() => r.string()), values);
});

test('doubles: valores frequentes e casos de borda', () => {
  const values = [0, -0, 1, -1, 0.5, 2, 10, 100, 0.1, -0.1, 1 / 3, Math.PI, -Math.E, 1e-9, 1e12, 123.4567, 76.5432,
    0.25098039215686274, 2000, 25.8419, 1.5, 3, 255, 1e300, 5e-324, 123456789.125, 0.7071067811865476];
  const w = new BitWriter();
  values.forEach((v) => w.double(v));
  const r = reader(w);
  for (const v of values) assert.equal(r.double(), v === 0 ? 0 : v);
});

test('doubles: ida e volta com valores pseudoaleatorios', () => {
  let seed = 987654321;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const values = [];
  for (let i = 0; i < 4000; i++) {
    const kind = i % 4;
    if (kind === 0) values.push((rnd() - 0.5) * 1000);                        // coordenadas tipicas
    else if (kind === 1) values.push(Math.round(rnd() * 2000 - 1000) / 8);     // mantissas com bytes repetidos
    else if (kind === 2) values.push(Math.fround((rnd() - 0.5) * 500));        // floats promovidos a double
    else values.push((rnd() - 0.5) * 10 ** Math.round(rnd() * 40 - 20));       // expoentes variados
  }
  const w = new BitWriter();
  values.forEach((v) => w.double(v));
  const r = reader(w);
  for (const v of values) assert.equal(r.double(), v === 0 ? 0 : v);
  assert.ok(r.p <= r.end && r.end - r.p < 8, 'todos os bits foram consumidos');
});

test('leitura alem do fim falha em vez de devolver lixo', () => {
  const r = new BitReader(new Uint8Array([0xff]));
  r.byte();
  assert.throws(() => r.bit(), /fim do bitstream/);
});
