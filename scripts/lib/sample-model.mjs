// Modelo sintetico usado nos testes e no exemplo publico: uma base com dois vasos e uma
// linha de tubulacao com valvula. Nao representa nenhuma instalacao real.

import { Mesh } from './shapes.mjs';

const UUID_EQUIP = [0x49443344, 0x45515550, 1, 1];
const UUID_LINE = [0x49443344, 0x4c494e48, 2, 2];
const UUID_ROOT = [0x49443344, 0x524f4f54, 3, 3];

function equipment() {
  const base = new Mesh().box([0, 0, 0], [3.2, 1.6, 0.12]);
  const shell = new Mesh().frustum([0, 0, 0.5], [0, 0, 1.9], 0.4, 0.4, { segments: 32, caps: false });
  const heads = new Mesh()
    .frustum([0, 0, 0.38], [0, 0, 0.5], 0.2, 0.4, { segments: 32 })
    .frustum([0, 0, 1.9], [0, 0, 2.02], 0.4, 0.2, { segments: 32 });
  const legs = new Mesh();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 2 * Math.PI, x = 0.3 * Math.cos(a), y = 0.3 * Math.sin(a);
    legs.frustum([x, y, 0], [x, y, 0.47], 0.03, 0.03, { segments: 12 });
  }
  return {
    uuid: UUID_EQUIP,
    colors: [[0.55, 0.58, 0.62], [0.3, 0.32, 0.36], [0.36, 0.55, 0.48]],
    tess: [base.toTess(1), shell.toTess(2), heads.toTess(2), legs.toTess(0)],
    parts: [
      { name: 'Base', bbox: [0, 0, 0, 3.2, 1.6, 0.12], items: [{ name: 'Chapa', tess: 0, closed: true }] },
      { name: 'Vaso', bbox: [-0.4, -0.4, 0, 0.4, 0.4, 2.02], items: [{ name: 'Costado', tess: 1 }, { name: 'Tampos', tess: 2 }, { name: 'Pernas', tess: 3 }] },
    ],
    products: [
      { name: 'Base', part: 0 },
      { name: 'V-101', part: 1, location: { origin: [0.8, 0.8, 0.12] } },
      { name: 'V-102', part: 1, location: { origin: [2.4, 0.8, 0.12] } },
      { name: 'Equipamentos', sons: [0, 1, 2] },
    ],
  };
}

function pipeline() {
  const r = 0.057, R = 0.3, y = 0.8, top = 2.14;
  const pipe = (a, b) => new Mesh().frustum(a, b, r, r, { caps: false });
  const run1 = pipe([0.8, y, top], [0.8, y, 2.5]);
  const run2 = pipe([1.1, y, 2.8], [1.45, y, 2.8]);
  const run3 = pipe([1.75, y, 2.8], [2.1, y, 2.8]);
  const run4 = pipe([2.4, y, 2.5], [2.4, y, top]);
  const elbow1 = new Mesh().torus([1.1, y, 2.5], [-1, 0, 0], [0, 0, 1], R, r);
  const elbow2 = new Mesh().torus([2.1, y, 2.5], [0, 0, 1], [1, 0, 0], R, r);
  const flanges = new Mesh()
    .frustum([0.8, y, top], [0.8, y, top + 0.04], 0.11)
    .frustum([2.4, y, top], [2.4, y, top + 0.04], 0.11)
    .frustum([1.45, y, 2.8], [1.49, y, 2.8], 0.11)
    .frustum([1.71, y, 2.8], [1.75, y, 2.8], 0.11);
  const body = new Mesh()
    .frustum([1.49, y, 2.8], [1.6, y, 2.8], r, 0.1)
    .frustum([1.6, y, 2.8], [1.71, y, 2.8], 0.1, r);
  const stem = new Mesh().frustum([1.6, y, 2.8], [1.6, y, 3.05], 0.02, 0.02, { segments: 12 });
  const wheel = new Mesh().torus([1.6, y, 3.05], [1, 0, 0], [0, 1, 0], 0.12, 0.015, { t1: 2 * Math.PI, steps: 28, segments: 8 });
  return {
    uuid: UUID_LINE,
    colors: [[0.56, 0.62, 0.75], [0.51, 0.55, 0.63], [0.95, 0.78, 0.1], [0.75, 0.2, 0.18]],
    tess: [run1, run2, run3, run4].map((m) => m.toTess(0)).concat(
      [elbow1.toTess(0), elbow2.toTess(0), flanges.toTess(1), body.toTess(3), stem.toTess(1), wheel.toTess(2)]),
    parts: [{
      name: 'Linha', bbox: [0.69, 0.66, top, 2.51, 0.94, 3.07],
      items: [
        { name: 'Tubo', items: [{ name: 'Trecho 1', tess: 0 }, { name: 'Trecho 2', tess: 1 }, { name: 'Trecho 3', tess: 2 }, { name: 'Trecho 4', tess: 3 }] },
        { name: 'Curva 90° (1)', tess: 4 },
        { name: 'Curva 90° (2)', tess: 5 },
        { name: 'Flanges', tess: 6 },
        { name: 'XV-001', items: [{ name: 'Corpo', tess: 7 }, { name: 'Haste', tess: 8 }, { name: 'Volante', tess: 9 }] },
      ],
    }],
    products: [{ name: 'Linha 4"-AG-001', part: 0 }],
  };
}

// Matriz camera-para-mundo no formato do PDF (/C2W): eixo x, "para cima", direcao de visao, posicao.
function view(name, fwd, up, center, radius, ortho) {
  const len = Math.hypot(...fwd), f = fwd.map((v) => v / len);
  const dot = up[0] * f[0] + up[1] * f[1] + up[2] * f[2];
  let u = up.map((v, i) => v - dot * f[i]);
  const ul = Math.hypot(...u);
  u = u.map((v) => v / ul);
  const x = [u[1] * f[2] - u[2] * f[1], u[2] * f[0] - u[0] * f[2], u[0] * f[1] - u[1] * f[0]];
  const fov = 40, co = ortho ? radius * 4 : (radius / Math.sin((fov * Math.PI) / 360)) * 1.05;
  const pos = center.map((c, i) => c - f[i] * co);
  return { name, c2w: [...x, ...u, ...f, ...pos], co, ortho, fov, os: 1 / (2 * radius * 1.1) };
}

export function sampleModel() {
  const model = {
    name: 'Skid de exemplo',
    unit: 1,
    root: { fs: 2, index: 2 },
    fileStructures: [equipment(), pipeline(), {
      uuid: UUID_ROOT,
      products: [
        { prototype: { fs: UUID_EQUIP, index: 3 } },
        { prototype: { fs: UUID_LINE, index: 0 } },
        { name: 'Skid de exemplo', sons: [0, 1] },
      ],
    }],
  };
  const center = [1.6, 0.8, 1.54], radius = 2.4;
  const views = [
    view('Perspectiva', [0.55, 0.75, -0.36], [0, 0, 1], center, radius, false),
    view('Frente', [0, 1, 0], [0, 0, 1], center, radius, true),
    view('Topo', [0, 0, -1], [0, 1, 0], center, radius, true),
    view('Lateral', [-1, 0, 0], [0, 0, 1], center, radius, true),
  ];
  return { model, views, title: 'Skid de exemplo', subject: 'Modelo sintético gerado pelo ID3D' };
}
