// Geradores de malhas simples (caixa, tronco de cone, trecho de toro) no formato de
// tesselacao que o gravador PRC espera: coordenadas, normais e triangulos indexados.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l); };

// Dois vetores unitarios perpendiculares a um eixo.
function frame(axis) {
  const w = norm(axis), ref = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(ref, w));
  return { u, v: cross(w, u), w };
}

export class Mesh {
  constructor() { this.coords = []; this.normals = []; this.triIndex = []; }
  point(p) { this.coords.push(...p); return this.coords.length - 3; }
  normal(n) { this.normals.push(...norm(n)); return this.normals.length - 3; }
  // cada vertice de triangulo e um par (indice da normal, indice do ponto)
  tri(a, b, c) { this.triIndex.push(a.n, a.p, b.n, b.p, c.n, c.p); return this; }
  quad(a, b, c, d) { return this.tri(a, b, c).tri(a, c, d); }
  get triangles() { return this.triIndex.length / 6; }

  box(min, max) {
    const corner = (i) => [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]];
    const faces = [[[-1, 0, 0], [0, 4, 6, 2]], [[1, 0, 0], [1, 3, 7, 5]], [[0, -1, 0], [0, 1, 5, 4]],
      [[0, 1, 0], [2, 6, 7, 3]], [[0, 0, -1], [0, 2, 3, 1]], [[0, 0, 1], [4, 5, 7, 6]]];
    for (const [n, idx] of faces) {
      const ni = this.normal(n), v = idx.map((i) => ({ n: ni, p: this.point(corner(i)) }));
      this.quad(...v);
    }
    return this;
  }

  // Tronco de cone de p0 (raio r0) a p1 (raio r1); com r0 = r1 e um cilindro.
  frustum(p0, p1, r0, r1 = r0, { segments = 24, caps = true } = {}) {
    const axis = sub(p1, p0), { u, v, w } = frame(axis), len = Math.hypot(...axis), slope = (r0 - r1) / len;
    const ring = (center, r) => Array.from({ length: segments }, (_, i) => {
      const a = (i / segments) * 2 * Math.PI, dir = add(mul(u, Math.cos(a)), mul(v, Math.sin(a)));
      return { n: this.normal(add(dir, mul(w, slope))), p: this.point(add(center, mul(dir, r))) };
    });
    const a = ring(p0, r0), b = ring(p1, r1);
    for (let i = 0; i < segments; i++) { const j = (i + 1) % segments; this.quad(a[i], a[j], b[j], b[i]); }
    if (caps) {
      const cap = (pts, n, flip) => {
        const ni = this.normal(n), list = pts.map((q) => ({ n: ni, p: q.p }));
        for (let i = 1; i + 1 < segments; i++) flip ? this.tri(list[0], list[i + 1], list[i]) : this.tri(list[0], list[i], list[i + 1]);
      };
      if (r0 > 0) cap(a, mul(w, -1), true);
      if (r1 > 0) cap(b, w, false);
    }
    return this;
  }

  // Trecho de toro: linha de centro c + R(cos t * u + sin t * v), t de t0 a t1, tubo de raio r.
  torus(c, u, v, R, r, { t0 = 0, t1 = Math.PI / 2, steps = 12, segments = 20 } = {}) {
    const w = cross(u, v), rings = [];
    for (let s = 0; s <= steps; s++) {
      const t = t0 + ((t1 - t0) * s) / steps, radial = add(mul(u, Math.cos(t)), mul(v, Math.sin(t))), center = add(c, mul(radial, R));
      rings.push(Array.from({ length: segments }, (_, i) => {
        const a = (i / segments) * 2 * Math.PI, dir = add(mul(radial, Math.cos(a)), mul(w, Math.sin(a)));
        return { n: this.normal(dir), p: this.point(add(center, mul(dir, r))) };
      }));
    }
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < segments; i++) { const j = (i + 1) % segments; this.quad(rings[s][i], rings[s + 1][i], rings[s + 1][j], rings[s][j]); }
    }
    return this;
  }

  // Tesselacao PRC: uma face so com triangulos (flag 0x2), opcionalmente com estilo proprio.
  toTess(style) {
    return { coords: this.coords, normals: this.normals, triIndex: this.triIndex, faces: [{ flags: 2, start: 0, sizes: [this.triangles], style }] };
  }
}
