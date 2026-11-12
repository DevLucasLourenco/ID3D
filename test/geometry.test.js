import { test } from 'node:test';
import assert from 'node:assert/strict';
import { triangulate, countFaceVertices, countWireVertices } from '../src/core/tessellation.js';
import { normalMismatch, creaseNormals } from '../src/core/normals.js';
import { Mesh } from '../scripts/lib/shapes.mjs';

// quadrado no plano z = 0: pontos 0..3 (indices multiplicados por 3), uma normal +z
const SQUARE = { coords: new Float64Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), normals: new Float64Array([0, 0, 1]) };
const tess = (triIndex, face) => ({ ...SQUARE, triIndex: new Uint32Array(triIndex), faces: [{ startTri: 0, texIdx: 0, lineAttributes: [], ...face }] });
const points = (mesh) => Array.from(mesh.positions);

test('triangulos soltos: (normal, ponto) por vertice', () => {
  const m = triangulate(tess([0, 0, 0, 3, 0, 6, 0, 0, 0, 6, 0, 9], { flags: 0x2, sizesTri: [2] }));
  assert.deepEqual(points(m), [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]);
  assert.deepEqual(Array.from(m.normals).slice(0, 3), [0, 0, 1]);
  assert.deepEqual(m.faceRanges, [[0, 6]]);
});

test('leque de triangulos', () => {
  const m = triangulate(tess([0, 0, 0, 3, 0, 6, 0, 9], { flags: 0x4, sizesTri: [1, 4] }));
  assert.deepEqual(points(m), [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0]);
});

test('tira de triangulos mantem o sentido alternando os vertices', () => {
  const m = triangulate(tess([0, 0, 0, 3, 0, 9, 0, 6], { flags: 0x8, sizesTri: [1, 4] }));
  assert.deepEqual(points(m), [0, 0, 0, 1, 0, 0, 0, 1, 0, /* 2o triangulo invertido */ 0, 1, 0, 1, 0, 0, 1, 1, 0]);
});

test('triangulos com uma normal por triangulo', () => {
  const m = triangulate(tess([0, 0, 3, 6], { flags: 0x20, sizesTri: [1] }));
  assert.deepEqual(points(m), [0, 0, 0, 1, 0, 0, 1, 1, 0]);
  assert.deepEqual(Array.from(m.normals), [0, 0, 1, 0, 0, 1, 0, 0, 1]);
});

test('entidades mistas seguem a ordem dos bits do flag', () => {
  // 1 triangulo solto (0x2) seguido de 1 leque de 3 pontos (0x4)
  const face = { flags: 0x2 | 0x4, sizesTri: [1, 1, 3] };
  const m = triangulate(tess([0, 0, 0, 3, 0, 6, 0, 0, 0, 6, 0, 9], face));
  assert.equal(m.positions.length, 18);
  assert.equal(countFaceVertices(face), 6);
});

test('contagem de vertices de arame', () => {
  assert.equal(countWireVertices({ wireIndex: new Uint32Array([2, 0, 3, 3, 0, 3, 6]) }), 5);
});

test('normalMismatch: normais coerentes x normais giradas', () => {
  const cyl = triangulate(asTess(new Mesh().frustum([0, 0, 0], [0, 0, 1], 0.5)));
  assert.equal(normalMismatch(cyl.positions, cyl.normals), 0);
  // gira as normais 90 graus em torno do eixo: laterais passam a discordar da geometria
  const rotated = new Float32Array(cyl.normals.length);
  for (let i = 0; i < rotated.length; i += 3) { rotated[i] = -cyl.normals[i + 1]; rotated[i + 1] = cyl.normals[i]; rotated[i + 2] = cyl.normals[i + 2]; }
  assert.ok(normalMismatch(cyl.positions, rotated) > 0.3);
});

test('creaseNormals: cubo fica facetado, cilindro fica suave', () => {
  const box = triangulate(asTess(new Mesh().box([0, 0, 0], [1, 2, 3])));
  const n = creaseNormals(box.positions, 45);
  for (let i = 0; i < n.length; i += 3) {
    const axis = [Math.abs(n[i]), Math.abs(n[i + 1]), Math.abs(n[i + 2])].sort();
    assert.ok(axis[2] > 0.999 && axis[1] < 1e-3, 'normal de face do cubo alinhada a um eixo');
  }

  const cyl = triangulate(asTess(new Mesh().frustum([0, 0, 0], [0, 0, 1], 0.5, 0.5, { caps: false })));
  const smooth = creaseNormals(cyl.positions, 45);
  for (let i = 0; i < smooth.length; i += 3) {
    const x = cyl.positions[i], y = cyl.positions[i + 1], r = Math.hypot(x, y);
    const dot = (smooth[i] * x + smooth[i + 1] * y) / r;
    assert.ok(dot > 0.999, 'normal radial no cilindro');
    assert.ok(Math.abs(smooth[i + 2]) < 1e-6);
  }
});

function asTess(mesh) {
  const t = mesh.toTess();
  return {
    coords: Float64Array.from(t.coords), normals: Float64Array.from(t.normals), triIndex: Uint32Array.from(t.triIndex),
    faces: t.faces.map((f) => ({ flags: f.flags, startTri: f.start, sizesTri: f.sizes, texIdx: 0, lineAttributes: [] })),
  };
}
