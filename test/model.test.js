import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, parsePRC, buildScene, extractFromPDF } from '../src/core/index.js';
import { normalMismatch } from '../src/core/normals.js';
import { writePRC } from '../scripts/lib/prc-writer.mjs';
import { wrapPDF } from '../scripts/lib/pdf-writer.mjs';
import { sampleModel } from '../scripts/lib/sample-model.mjs';

const { model, views, title, subject } = sampleModel();
const prcBytes = writePRC(model);
const pdfBytes = wrapPDF(prcBytes, { views, title, subject });

const find = (node, name) => (node.name === name ? node : node.children.map((c) => find(c, name)).find(Boolean));
const meshes = (node, out = []) => { if (node.mesh) out.push(node); node.children.forEach((c) => meshes(c, out)); return out; };
const close = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('PRC: estrutura lida confere com o modelo gravado', () => {
  const prc = parsePRC(prcBytes);
  assert.equal(prc.version, 8137);
  assert.equal(prc.fileStructures.length, 3);
  const [equip, line, root] = prc.fileStructures;
  assert.deepEqual(equip.tree.products.map((p) => p.name), ['Base', 'V-101', 'V-102', 'Equipamentos']);
  assert.equal(equip.tree.rootProduct, 3);
  assert.equal(equip.globals.colors.length, 3);
  assert.equal(equip.globals.styles.length, 3);
  assert.equal(line.tess.length, 10);
  assert.equal(line.tree.parts[0].items[0].items.length, 4);
  assert.deepEqual(root.tree.products[0].prototypeFs, equip.uuid);
  assert.deepEqual(prc.modelFile.roots[0].fs, root.uuid);
  assert.equal(prc.modelFile.name, 'Skid de exemplo');
});

test('cena: arvore, nomes e referencias entre file structures', () => {
  const scene = buildScene(parsePRC(prcBytes));
  assert.equal(scene.root.name, 'Skid de exemplo');
  assert.deepEqual(scene.root.children.map((c) => c.name), ['Equipamentos', 'Linha 4"-AG-001']);
  assert.deepEqual(find(scene.root, 'XV-001').children.map((c) => c.name), ['Corpo', 'Haste', 'Volante']);
  assert.ok(find(scene.root, 'Curva 90° (1)'), 'nomes UTF-8 preservados');
  assert.equal(scene.stats.meshes, 17);
  assert.equal(scene.stats.triangles, meshes(scene.root).reduce((s, n) => s + n.mesh.positions.length / 9, 0));
});

test('cena: transformacoes de instancia e cores por face', () => {
  const scene = buildScene(parsePRC(prcBytes));
  const v101 = find(scene.root, 'V-101'), v102 = find(scene.root, 'V-102');
  const shell1 = find(v101, 'Costado'), shell2 = find(v102, 'Costado');
  assert.equal(shell1.mesh, shell2.mesh, 'a mesma tesselacao e compartilhada pelas duas instancias');
  assert.deepEqual(shell1.matrix.slice(12, 15), [0.8, 0.8, 0.12]);
  assert.deepEqual(shell2.matrix.slice(12, 15), [2.4, 0.8, 0.12]);

  const color = (name) => find(scene.root, name).color;
  assert.ok(color('Volante').every((v, i) => close(v, [0.95, 0.78, 0.1][i])));
  assert.ok(color('Corpo').every((v, i) => close(v, [0.75, 0.2, 0.18][i])));
  assert.ok(color('Chapa').every((v, i) => close(v, [0.3, 0.32, 0.36][i])));
});

test('cena: geometria dentro dos limites esperados e normais coerentes', () => {
  const scene = buildScene(parsePRC(prcBytes));
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const n of meshes(scene.root)) {
    assert.equal(normalMismatch(n.mesh.positions, n.mesh.normals), 0, n.name);
    const p = n.mesh.positions, m = n.matrix;
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const w = m[k] * p[i] + m[4 + k] * p[i + 1] + m[8 + k] * p[i + 2] + m[12 + k];
        min[k] = Math.min(min[k], w); max[k] = Math.max(max[k], w);
      }
    }
  }
  assert.ok(close(min[0], 0) && close(min[1], 0) && close(min[2], 0));
  assert.ok(close(max[0], 3.2) && close(max[1], 1.6));
  assert.ok(max[2] > 3.05 && max[2] < 3.08, 'topo do volante da valvula');
});

test('PDF: extrai o stream PRC, as vistas e os metadados', () => {
  const ex = extractFromPDF(pdfBytes);
  assert.equal(ex.format, 'PRC');
  assert.deepEqual(Array.from(ex.data), Array.from(prcBytes));
  assert.deepEqual(ex.views.map((v) => v.name), ['Perspectiva', 'Frente', 'Topo', 'Lateral']);
  assert.equal(ex.views[0].ortho, false);
  assert.equal(ex.views[0].fov, 40);
  assert.equal(ex.views[1].ortho, true);
  assert.ok(ex.views[1].os > 0);
  assert.equal(ex.views[2].c2w.length, 12);
  assert.equal(ex.info.title, 'Skid de exemplo');
  assert.equal(ex.info.subject, 'Modelo sintético gerado pelo ID3D', 'texto UTF-16 do PDF decodificado');
});

test('load: aceita PDF e PRC puro', () => {
  const fromPdf = load(pdfBytes), fromPrc = load(prcBytes);
  assert.equal(fromPdf.stats.triangles, fromPrc.stats.triangles);
  assert.equal(fromPdf.views.length, 4);
  assert.equal(fromPrc.views.length, 0);
});

test('load: mensagens claras para arquivos que nao servem', () => {
  const enc = (s) => new TextEncoder().encode(s);
  assert.throws(() => load(enc('isto nao e um pdf')), /não parece ser um PDF/);
  assert.throws(() => load(enc('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n')), /Nenhum modelo 3D/);
  assert.throws(() => load(enc('%PDF-1.7\ntrailer << /Encrypt 5 0 R >>\n')), /criptografado/);
  assert.throws(() => load(enc('%PDF-1.7\n1 0 obj\n<< /Type /3D /Subtype /U3D /Length 4 >>\nstream\nU3D\0\nendstream\nendobj\n')), /U3D/);
});

test('PRC corrompido falha com erro em vez de travar', () => {
  const broken = prcBytes.slice();
  for (let i = 400; i < 460; i++) broken[i] ^= 0x5a;
  assert.throws(() => parsePRC(broken));
  assert.throws(() => parsePRC(prcBytes.subarray(0, 300)), /cabeçalho inválido|truncado|fim inesperado/);
});

test('load: erros chegam ao usuario em portugues, nunca a mensagem crua do motor JavaScript', () => {
  const enc = (s) => new TextEncoder().encode(s);
  const inputs = [enc('PRC' + 'x'.repeat(400)), prcBytes.subarray(0, 300), prcBytes.subarray(0, prcBytes.length - 40)];
  for (let seed = 1; seed <= 40; seed++) {
    const broken = prcBytes.slice();
    let x = seed * 2654435761;
    for (let k = 0; k < 12; k++) { x = (x * 1103515245 + 12345) >>> 0; broken[x % broken.length] ^= 1 << (x % 8); }
    inputs.push(broken);
  }
  for (const bytes of inputs) {
    try { load(bytes); } catch (e) {
      assert.equal(e.constructor, Error, 'erro do proprio leitor');
      assert.doesNotMatch(e.message, /Invalid|undefined|not a|Cannot|out of|is not/, e.message);
    }
  }
});
