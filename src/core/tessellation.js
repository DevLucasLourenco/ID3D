// Conversao das tesselacoes PRC (triangulos, leques e tiras indexados) em triangulos soltos.

export function countWireVertices(t) {
  var n = 0, i = 0, w = t.wireIndex;
  while (i < w.length) { var c = w[i] & 0x3fffffff; n += c; i += c + 1; }
  return n;
}
// Numero de vertices (pontos) descritos por uma face, para o array de cores por vertice.
export function countFaceVertices(f) {
  var n = 0;
  walkFace(f, null, function (cnt) { n += cnt; });
  return n;
}

// Percorre as entidades trianguladas de uma face. emit(kind, nPoints, hasNormalPerPoint, textured)
var KINDS = ['poly', 'tri', 'fan', 'strip'];
export function walkFace(f, onEntity, onCount) {
  var s = f.sizesTri, si = 0;
  for (var bit = 0; bit < 16; bit++) {
    if (!(f.flags & (1 << bit))) continue;
    var kind = KINDS[bit & 3], oneNormal = !!(bit & 4), textured = bit >= 8;
    var n = s[si++];
    if (kind === 'tri') {
      if (onCount) onCount(3 * n);
      if (onEntity) for (var k = 0; k < n; k++) onEntity('tri', 3, oneNormal, textured, false);
    } else {
      for (var j = 0; j < n; j++) {
        var raw = s[si++], cnt = raw & 0x3fffffff, single = !!(raw & 0x40000000);
        if (onCount) onCount(cnt);
        if (onEntity) onEntity(kind, cnt, oneNormal, textured, single);
      }
    }
  }
}

// Converte uma tesselacao TESS_3D em arrays nao indexados (posicao + normal por vertice de triangulo).
export function triangulate(t) {
  var pos = [], nor = [], co = t.coords, no = t.normals, ix = t.triIndex;
  var hasNormals = no.length > 0;
  function push(pi, ni) {
    pos.push(co[pi], co[pi + 1], co[pi + 2]);
    if (hasNormals && ni >= 0) nor.push(no[ni], no[ni + 1], no[ni + 2]); else nor.push(0, 0, 0);
  }
  var faceRanges = [];
  for (var fi = 0; fi < t.faces.length; fi++) {
    var f = t.faces[fi], p = f.startTri, tex = f.texIdx, start = pos.length / 3;
    walkFace(f, function (kind, cnt, oneNormal, textured, single) {
      var P = new Array(cnt), N = new Array(cnt), i, shared = -1;
      // normal unica: tri*OneNormal sempre; fan/strip OneNormal quando marcado como "single"
      var sharedNormal = oneNormal && (kind === 'tri' || kind === 'poly' || single);
      if (sharedNormal) shared = ix[p++];
      for (i = 0; i < cnt; i++) {
        if (sharedNormal) N[i] = shared;
        else if (oneNormal) N[i] = ix[p++];          // uma normal por ponto, mas antes do ponto
        else N[i] = ix[p++];
        if (textured) p += tex;
        P[i] = ix[p++];
      }
      if (kind === 'tri') { for (i = 0; i < 3; i++) push(P[i], N[i]); }
      else if (kind === 'fan' || kind === 'poly') {
        for (i = 1; i + 1 < cnt; i++) { push(P[0], N[0]); push(P[i], N[i]); push(P[i + 1], N[i + 1]); }
      } else {
        for (i = 0; i + 2 < cnt; i++) {
          if (i & 1) { push(P[i + 1], N[i + 1]); push(P[i], N[i]); push(P[i + 2], N[i + 2]); }
          else { push(P[i], N[i]); push(P[i + 1], N[i + 1]); push(P[i + 2], N[i + 2]); }
        }
      }
    });
    faceRanges.push([start, pos.length / 3 - start]);
  }
  return { positions: new Float64Array(pos), normals: hasNormals ? new Float32Array(nor) : null, faceRanges: faceRanges };
}
