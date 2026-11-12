// Monta a arvore de nos (conjuntos, pecas e malhas) a partir do PRC lido, resolvendo
// transformacoes, cores e referencias entre file structures.

import { T, uuidKey } from './prc-types.js';
import { triangulate } from './tessellation.js';

function mul(a, b) {
  var o = new Array(16);
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
var IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// Resolve estilo -> {color:[r,g,b], opacity}
export function resolveStyle(fs, styleIndex) {
  var g = fs.globals, s = g.styles[styleIndex];
  if (!s) return null;
  var res = { color: null, opacity: 1 };
  // indices de cor no PRC apontam para o array de componentes (3 por cor)
  function col(i) { return i >= 0 ? g.colors[Math.floor(i / 3)] : undefined; }
  if (s.transparency !== undefined) res.opacity = s.transparency / 255;
  if (s.isMaterial) {
    var m = g.materials[s.colorMaterial];
    while (m && m.generic !== undefined) m = g.materials[m.generic];
    if (m) {
      var c = col(m.diffuse) || col(m.ambient);
      if (c) res.color = c.slice();
      if (m.diffuseAlpha !== undefined && m.diffuseAlpha < 1) res.opacity = Math.min(res.opacity, m.diffuseAlpha);
      var sp = col(m.specular); if (sp) res.specular = sp.slice();
      var em = col(m.emissive); if (em) res.emissive = em.slice();
      res.shininess = m.shininess;
    }
  } else if (col(s.colorMaterial)) res.color = col(s.colorMaterial).slice();
  return res;
}

// Constroi a arvore de nos {name, children, matrix (mundo), mesh?}
export function buildScene(prc) {
  var meshCache = new Map(), stats = { triangles: 0, meshes: 0, nodes: 0 };
  function meshFor(fs, ti) {
    var key = fs.index + ':' + ti;
    if (!meshCache.has(key)) {
      var t = fs.tess[ti];
      meshCache.set(key, t && t.type === T.TESS_3D ? triangulate(t) : null);
    }
    return meshCache.get(key);
  }
  function inherit(parent, fs, ent) {
    // heranca de cor: o estilo proprio vale, salvo se o pai impuser (SonHeritColor = 0x08 no pai)
    var st = ent.style >= 0 ? resolveStyle(fs, ent.style) : null;
    if (parent && parent.force) return parent;
    var out = st && st.color ? st : (parent || st);
    if (out && ent.behaviour & 0x08) { out = Object.assign({}, out); out.force = true; }
    return out;
  }
  function visible(ent) { return !!(ent.behaviour & 0x01) && !(ent.behaviour & 0x2000); }

  function riNode(fs, ri, world, style) {
    var st = inherit(style, fs, ri), m = world;
    if (ri.localCS >= 0 && fs.globals.coordinateSystems[ri.localCS]) m = mul(world, fs.globals.coordinateSystems[ri.localCS].matrix);
    var node = { name: ri.name || '', kind: 'item', children: [], hidden: !visible(ri) };
    stats.nodes++;
    if (ri.type === T.RI_Set) {
      for (var i = 0; i < ri.items.length; i++) node.children.push(riNode(fs, ri.items[i], m, st));
    } else if ((ri.type === T.RI_PolyBrepModel || ri.type === T.RI_BrepModel) && ri.tess >= 0) {
      var mesh = meshFor(fs, ri.tess);
      if (mesh && mesh.positions.length) {
        node.mesh = mesh; node.matrix = m;
        var def = st && st.color ? st.color : [0.75, 0.75, 0.78];
        node.color = def;
        node.opacity = st ? st.opacity : 1;
        // estilo por face (line_attributes da face = indice do estilo + 1) tem precedencia
        var faces = fs.tess[ri.tess].faces, fcs = [], uniform = true, any = false;
        for (var fi = 0; fi < faces.length; fi++) {
          var la = faces[fi].lineAttributes, fst = la.length && la[0] > 0 ? resolveStyle(fs, la[0] - 1) : null;
          if (st && st.force) fst = null;
          fcs.push(fst);
          if (fst && fst.color) any = true;
          if (fi && String(fst && fst.color) !== String(fcs[0] && fcs[0].color)) uniform = false;
        }
        if (any && uniform) {
          node.color = fcs[0].color; node.opacity = fcs[0].opacity;
        } else if (any) {
          var vc = new Float32Array(mesh.positions.length);
          for (fi = 0; fi < faces.length; fi++) {
            var c = fcs[fi] && fcs[fi].color ? fcs[fi].color : def, rg = mesh.faceRanges[fi];
            for (var v = rg[0]; v < rg[0] + rg[1]; v++) { vc[v * 3] = c[0]; vc[v * 3 + 1] = c[1]; vc[v * 3 + 2] = c[2]; }
          }
          node.vertexColors = vc;
        }
        stats.meshes++; stats.triangles += mesh.positions.length / 9;
      }
    }
    return node;
  }
  function poNode(fs, index, world, style, depth) {
    var po = fs.tree.products[index];
    if (!po || depth > 200) return null;
    var st = inherit(style, fs, po);
    var m = po.matrix ? mul(world, po.matrix) : world;
    var node = { name: po.name || '', kind: 'product', children: [], hidden: !visible(po), attributes: po.attributes };
    stats.nodes++;
    var i, c;
    for (i = 0; i < po.sons.length; i++) { c = poNode(fs, po.sons[i], m, st, depth + 1); if (c) node.children.push(c); }
    if (po.part >= 0 && fs.tree.parts[po.part]) {
      var part = fs.tree.parts[po.part], pst = inherit(st, fs, part);
      for (i = 0; i < part.items.length; i++) node.children.push(riNode(fs, part.items[i], m, pst));
    }
    // prototipo / dados externos: outra ocorrencia de produto (eventualmente em outra file structure)
    [['prototype', 'prototypeFs'], ['external', 'externalFs']].forEach(function (k) {
      if (po[k[0]] < 0) return;
      var tfs = po[k[1]] ? prc.byUuid[uuidKey(po[k[1]])] : fs;
      if (!tfs) return;
      c = poNode(tfs, po[k[0]], m, st, depth + 1);
      if (!c) return;
      // funde o no referenciado neste (evita niveis redundantes na arvore)
      if (!node.name) node.name = c.name;
      node.children = node.children.concat(c.children);
      if (c.hidden) node.hidden = true;
    });
    return node;
  }
  var root = { name: prc.modelFile.name || 'Modelo', kind: 'product', children: [] };
  prc.modelFile.roots.forEach(function (rt) {
    var fs = prc.byUuid[uuidKey(rt.fs)];
    if (!fs) return;
    var n = poNode(fs, rt.index, IDENT, null, 0);
    if (n) root.children.push(n);
  });
  if (root.children.length === 1 && !root.children[0].mesh) root = root.children[0];
  return { root: root, stats: stats, unit: prc.modelFile.unit };
}
