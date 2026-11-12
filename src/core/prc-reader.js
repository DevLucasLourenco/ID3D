// Leitura das secoes de um arquivo PRC: globais (cores, estilos), arvore de produtos e
// pecas, tesselacoes e o model file que amarra as file structures.

import { inflate } from './inflate.js';
import { BitReader } from './bit-reader.js';
import { T, REFERENCEABLE, uuidKey } from './prc-types.js';
import { countFaceVertices, countWireVertices } from './tessellation.js';

// Contexto de leitura de uma secao: nome/graficos "correntes" sao reiniciados a cada secao.
export function SectionReader(u8) {
  this.r = new BitReader(u8);
  this.name = '';
  this.layer = -1; this.style = -1; this.behaviour = 1;
}
SectionReader.prototype = {
  expect: function (type, what) {
    var at = this.r.p, t = this.r.uint();
    if (t !== type) throw new Error('PRC: esperado ' + what + ' (' + type + '), lido ' + t + ' no bit ' + at);
  },
  userData: function () {
    var n = this.r.uint();
    if (n > this.r.end - this.r.p) throw new Error('PRC: user data inválido');
    this.r.p += n;
  },
  attributeEntry: function () {
    return this.r.bit() ? this.r.uint() : this.r.string();
  },
  attributes: function () {
    var r = this.r, n = r.uint(), out = [];
    for (var i = 0; i < n; i++) {
      this.expect(T.MISC_Attribute, 'Attribute');
      var a = { title: this.attributeEntry(), keys: [] };
      var nk = r.uint();
      for (var k = 0; k < nk; k++) {
        var key = { title: this.attributeEntry() }, type = r.uint();
        if (type === 1) key.value = r.int();
        else if (type === 2) key.value = r.double();
        else if (type === 3) key.value = r.uint();
        else if (type === 4) key.value = r.string();
        a.keys.push(key);
      }
      out.push(a);
    }
    return out;
  },
  nameField: function () {
    if (!this.r.bit()) this.name = this.r.string();
    return this.name;
  },
  base: function (type, o) {
    o = o || {};
    o.attributes = this.attributes();
    o.name = this.nameField();
    if (REFERENCEABLE[type]) { o.cadId = this.r.uint(); o.cadPersistentId = this.r.uint(); o.prcId = this.r.uint(); }
    return o;
  },
  graphics: function (o) {
    var r = this.r;
    if (!r.bit()) {
      this.layer = r.uint() - 1; this.style = r.uint() - 1;
      this.behaviour = r.byte(); this.behaviour |= r.byte() << 8;
    }
    o.layer = this.layer; o.style = this.style; o.behaviour = this.behaviour;
    return o;
  },
  vec3: function () { var r = this.r; return [r.double(), r.double(), r.double()]; },
  // Devolve matriz 4x4 em ordem column-major (como WebGL/three.js).
  transformation3d: function () {
    var r = this.r, type = r.uint(), m, i;
    if (type === T.MISC_GeneralTransformation) {
      m = new Array(16);
      for (i = 0; i < 16; i++) m[i] = r.double();
      return m;
    }
    if (type !== T.MISC_CartesianTransformation) throw new Error('PRC: transformação desconhecida ' + type);
    var b = r.byte(), o = [0, 0, 0], X = [1, 0, 0], Y = [0, 1, 0], Z = null, s = [1, 1, 1];
    if (b & 0x01) o = this.vec3();
    if (b & 0x20) { X = this.vec3(); Y = this.vec3(); Z = this.vec3(); }
    else if (b & 0x02) { X = this.vec3(); Y = this.vec3(); }
    if (!Z) {
      Z = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
      if (b & 0x04) Z = [-Z[0], -Z[1], -Z[2]];
    }
    if (b & 0x10) s = this.vec3();
    else if (b & 0x08) { var u = r.double(); s = [u, u, u]; }
    var h = [0, 0, 0, 1];
    if (b & 0x40) h = [r.double(), r.double(), r.double(), r.double()];
    return [X[0] * s[0], X[1] * s[0], X[2] * s[0], h[0],
      Y[0] * s[1], Y[1] * s[1], Y[2] * s[1], h[1],
      Z[0] * s[2], Z[1] * s[2], Z[2] * s[2], h[2],
      o[0], o[1], o[2], h[3]];
  },
  reference: function () {
    var r = this.r, t = r.uint(), o = { refType: t };
    if (t === T.MISC_ReferenceOnPRCBase) {
      o.type = r.uint();
      if (!r.bit()) o.fs = [r.uint(), r.uint(), r.uint(), r.uint()];
      o.id = r.uint();
    } else if (t === T.MISC_ReferenceOnTopology) {
      o.type = r.uint(); o.brepIndex = r.uint();
      var n = r.uint(); o.indices = [];
      for (var i = 0; i < n; i++) o.indices.push(r.uint());
    } else if (t !== 0) throw new Error('PRC: referência desconhecida ' + t);
    return o;
  },
  // ------------------------------------------------------------ itens de representacao
  riContent: function (type, o) {
    this.base(type, o); this.graphics(o);
    o.localCS = this.r.uint() - 1;
    o.tess = this.r.uint() - 1;
    return o;
  },
  representationItem: function () {
    var r = this.r, at = r.p, type = r.uint(), o = { type: type }, n, i;
    switch (type) {
      case T.RI_PolyBrepModel:
        this.riContent(type, o); o.closed = !!r.bit(); break;
      case T.RI_BrepModel:
        this.riContent(type, o);
        if (r.bit()) { o.context = r.uint() - 1; o.body = r.uint() - 1; }
        o.closed = !!r.bit(); break;
      case T.RI_Curve:
        this.riContent(type, o);
        if (r.bit()) { o.context = r.uint() - 1; o.body = r.uint() - 1; }
        break;
      case T.RI_PolyWire:
        this.riContent(type, o); break;
      case T.RI_PointSet:
        this.riContent(type, o);
        n = r.uint(); o.points = [];
        for (i = 0; i < n; i++) o.points.push(this.vec3());
        break;
      case T.RI_Set:
        this.riContent(type, o);
        n = r.uint(); o.items = [];
        for (i = 0; i < n; i++) o.items.push(this.representationItem());
        break;
      case T.RI_CoordinateSystem:
        this.riContent(type, o); o.matrix = this.transformation3d(); break;
      default:
        throw new Error('PRC: item de representação não suportado (tipo ' + type + ') no bit ' + at);
    }
    this.userData();
    return o;
  },
  markups: function () {
    var r = this.r;
    if (r.uint() || r.uint() || r.uint() || r.uint()) throw new Error('PRC: markups/anotações ainda não suportados');
  },
  partDefinition: function () {
    var r = this.r, o = { type: T.ASM_PartDefinition };
    this.expect(T.ASM_PartDefinition, 'PartDefinition');
    this.base(T.ASM_PartDefinition, o); this.graphics(o);
    o.bbox = [this.vec3(), this.vec3()];
    var n = r.uint(); o.items = [];
    for (var i = 0; i < n; i++) o.items.push(this.representationItem());
    this.markups();
    if (r.uint()) throw new Error('PRC: vistas em PartDefinition não suportadas');
    this.userData();
    return o;
  },
  productOccurrence: function () {
    var r = this.r, o = { type: T.ASM_ProductOccurence }, i, n;
    this.expect(T.ASM_ProductOccurence, 'ProductOccurrence');
    this.base(T.ASM_ProductOccurence, o); this.graphics(o);
    o.part = r.uint() - 1;
    o.prototype = r.uint() - 1;
    if (o.prototype >= 0 && !r.bit()) o.prototypeFs = [r.uint(), r.uint(), r.uint(), r.uint()];
    o.external = r.uint() - 1;
    if (o.external >= 0 && !r.bit()) o.externalFs = [r.uint(), r.uint(), r.uint(), r.uint()];
    n = r.uint(); o.sons = [];
    for (i = 0; i < n; i++) o.sons.push(r.uint());
    o.productBehaviour = r.byte();
    o.unitFromCAD = !!r.bit(); o.unit = r.double();
    o.infoFlags = r.byte();
    o.loadStatus = r.int();
    if (r.bit()) o.matrix = this.transformation3d();
    n = r.uint();
    if (n) throw new Error('PRC: referências em ProductOccurrence não suportadas');
    this.markups();
    if (r.uint()) throw new Error('PRC: vistas em ProductOccurrence não suportadas');
    if (r.bit()) throw new Error('PRC: filtro de entidades não suportado');
    if (r.uint()) throw new Error('PRC: filtros de exibição não suportados');
    if (r.uint()) throw new Error('PRC: parâmetros de cena não suportados');
    this.userData();
    return o;
  },
  // ------------------------------------------------------------ globais
  globals: function () {
    var r = this.r, g = {}, i, n;
    if (r.uint()) throw new Error('PRC: schemas não suportados');
    this.expect(T.ASM_FileStructureGlobals, 'FileStructureGlobals');
    this.base(T.ASM_FileStructureGlobals, g);
    n = r.uint(); g.referenced = [];
    for (i = 0; i < n; i++) g.referenced.push([r.uint(), r.uint(), r.uint(), r.uint()]);
    g.chordRatio = r.double(); g.angle = r.double();
    g.defaultFont = r.string();
    n = r.uint(); g.fonts = [];
    for (i = 0; i < n; i++) {
      var f = { name: r.string(), charset: r.uint(), keys: [] }, nk = r.uint();
      for (var k = 0; k < nk; k++) f.keys.push([r.uint() - 1, r.byte()]);
      g.fonts.push(f);
    }
    n = r.uint(); g.colors = [];
    for (i = 0; i < n; i++) g.colors.push([r.double(), r.double(), r.double()]);
    n = r.uint(); g.pictures = [];
    for (i = 0; i < n; i++) {
      this.expect(T.GRAPH_Picture, 'Picture');
      var p = this.base(T.GRAPH_Picture);
      p.format = r.int(); p.file = r.uint() - 1; p.w = r.uint(); p.h = r.uint();
      g.pictures.push(p);
    }
    n = r.uint();
    if (n) throw new Error('PRC: definições de textura não suportadas');
    n = r.uint(); g.materials = [];
    for (i = 0; i < n; i++) {
      var at = r.p, mt = r.uint(), m;
      if (mt === T.GRAPH_Material) {
        m = this.base(mt);
        m.ambient = r.uint() - 1; m.diffuse = r.uint() - 1; m.emissive = r.uint() - 1; m.specular = r.uint() - 1;
        m.shininess = r.double(); m.ambientAlpha = r.double(); m.diffuseAlpha = r.double();
        m.emissiveAlpha = r.double(); m.specularAlpha = r.double();
      } else if (mt === T.GRAPH_TextureApplication) {
        m = this.base(mt);
        m.generic = r.uint() - 1; m.textureDef = r.uint() - 1; m.next = r.uint() - 1; m.uv = r.uint() - 1;
      } else throw new Error('PRC: material desconhecido ' + mt + ' no bit ' + at);
      g.materials.push(m);
    }
    n = r.uint(); g.linePatterns = [];
    for (i = 0; i < n; i++) {
      this.expect(T.GRAPH_LinePattern, 'LinePattern');
      var lp = this.base(T.GRAPH_LinePattern), nl = r.uint();
      lp.lengths = [];
      for (var q = 0; q < nl; q++) lp.lengths.push(r.double());
      lp.phase = r.double(); lp.real = r.bit();
      g.linePatterns.push(lp);
    }
    n = r.uint(); g.styles = [];
    for (i = 0; i < n; i++) {
      this.expect(T.GRAPH_Style, 'Style');
      var s = this.base(T.GRAPH_Style);
      s.lineWidth = r.double();
      s.isVPicture = !!r.bit(); s.pattern = r.uint() - 1;
      s.isMaterial = !!r.bit(); s.colorMaterial = r.uint() - 1;
      if (r.bit()) s.transparency = r.byte();
      if (r.bit()) s.additional1 = r.byte();
      if (r.bit()) s.additional2 = r.byte();
      if (r.bit()) s.additional3 = r.byte();
      g.styles.push(s);
    }
    n = r.uint();
    if (n) throw new Error('PRC: padrões de preenchimento não suportados');
    n = r.uint(); g.coordinateSystems = [];
    for (i = 0; i < n; i++) g.coordinateSystems.push(this.representationItem());
    this.userData();
    return g;
  },
  // ------------------------------------------------------------ arvore
  tree: function () {
    var r = this.r, t = {}, i, n;
    this.expect(T.ASM_FileStructureTree, 'FileStructureTree');
    this.base(T.ASM_FileStructureTree, t);
    n = r.uint(); t.parts = [];
    for (i = 0; i < n; i++) t.parts.push(this.partDefinition());
    n = r.uint(); t.products = [];
    for (i = 0; i < n; i++) t.products.push(this.productOccurrence());
    this.expect(T.ASM_FileStructure, 'FileStructure');
    this.base(T.ASM_FileStructure);
    t.nextIndex = r.uint();
    t.rootProduct = r.uint() - 1;
    return t;
  },
  // ------------------------------------------------------------ tesselacao
  arrayRGBA: function (count, rgba) {
    var r = this.r, n = rgba ? 4 : 3, out = new Uint8Array(count * n), i, j;
    for (j = 0; j < n; j++) out[j] = r.byte();
    for (i = 1; i < count; i++) {
      if (r.bit()) for (j = 0; j < n; j++) out[i * n + j] = out[(i - 1) * n + j];
      else for (j = 0; j < n; j++) out[i * n + j] = r.byte();
    }
    return out;
  },
  doubles: function () {
    var r = this.r, n = r.uint();
    if (n > r.end - r.p) throw new Error('PRC: contagem inválida');
    var a = new Float64Array(n);
    for (var i = 0; i < n; i++) a[i] = r.double();
    return a;
  },
  uints: function () {
    var r = this.r, n = r.uint();
    if (n > r.end - r.p) throw new Error('PRC: contagem inválida');
    var a = new Uint32Array(n);
    for (var i = 0; i < n; i++) a[i] = r.uint();
    return a;
  },
  tessFace: function () {
    var r = this.r, f = {};
    this.expect(T.TESS_Face, 'TessFace');
    f.lineAttributes = this.uints();
    f.startWire = r.uint();
    f.sizesWire = this.uints();
    f.flags = r.uint();
    f.startTri = r.uint();
    f.sizesTri = this.uints();
    f.texIdx = r.uint();
    if (r.bit()) {
      f.rgba = !!r.bit();
      if (r.bit()) throw new Error('PRC: cores de vértice otimizadas não suportadas');
      f.colors = this.arrayRGBA(countFaceVertices(f), f.rgba);
    }
    if (f.lineAttributes.length) f.behaviour = r.uint();
    return f;
  },
  tessellation: function () {
    var r = this.r, at = r.p, type = r.uint(), t = { type: type }, i, n;
    if (type === T.TESS_3D) {
      t.calculated = !!r.bit();
      t.coords = this.doubles();
      t.hasFaces = !!r.bit(); t.hasLoops = !!r.bit();
      if (r.bit()) { r.byte(); t.creaseAngle = r.double(); }
      t.normals = this.doubles();
      t.wireIndex = this.uints();
      t.triIndex = this.uints();
      n = r.uint(); t.faces = [];
      for (i = 0; i < n; i++) t.faces.push(this.tessFace());
      t.texCoords = this.doubles();
    } else if (type === T.TESS_3D_Wire) {
      t.calculated = !!r.bit();
      t.coords = this.doubles();
      t.wireIndex = this.uints();
      if (r.bit()) {
        t.rgba = !!r.bit(); t.segmentColor = !!r.bit();
        if (r.bit()) throw new Error('PRC: cores de vértice otimizadas não suportadas');
        t.colors = this.arrayRGBA(countWireVertices(t), t.rgba);
      }
    } else if (type === T.TESS_Markup) {
      t.calculated = !!r.bit();
      t.coords = this.doubles();
      t.codes = this.uints();
      n = r.uint(); t.texts = [];
      for (i = 0; i < n; i++) t.texts.push(r.string());
      t.label = r.string(); t.behaviour = r.byte();
    } else if (type === T.TESS_3D_Compressed) {
      throw new Error('PRC: tesselação altamente comprimida (TESS_3D_Compressed) não suportada');
    } else throw new Error('PRC: tesselação desconhecida ' + type + ' no bit ' + at);
    return t;
  },
  tessSection: function () {
    var r = this.r, out = [];
    this.expect(T.ASM_FileStructureTessellation, 'FileStructureTessellation');
    this.base(T.ASM_FileStructureTessellation);
    var n = r.uint();
    for (var i = 0; i < n; i++) out.push(this.tessellation());
    return out;
  },
  modelFile: function () {
    var r = this.r, m = {};
    if (r.uint()) throw new Error('PRC: schemas não suportados');
    this.expect(T.ASM_ModelFile, 'ModelFile');
    this.base(T.ASM_ModelFile, m);
    m.unitFromCAD = !!r.bit(); m.unit = r.double();
    var n = r.uint(); m.roots = [];
    for (var i = 0; i < n; i++) {
      m.roots.push({ fs: [r.uint(), r.uint(), r.uint(), r.uint()], index: r.uint() - 1, active: !!r.bit(), fileIndex: r.uint() });
    }
    return m;
  }
};

function u32(d, p) { return (d[p] | (d[p + 1] << 8) | (d[p + 2] << 16) | (d[p + 3] << 24)) >>> 0; }

export function parsePRC(d) {
  if (d[0] !== 0x50 || d[1] !== 0x52 || d[2] !== 0x43) throw new Error('não e um stream PRC');
  var p = 3, i, j;
  var version = u32(d, p); p += 8 + 32;
  var nfs = u32(d, p); p += 4;
  var infos = [];
  for (i = 0; i < nfs; i++) {
    var uuid = [u32(d, p), u32(d, p + 4), u32(d, p + 8), u32(d, p + 12)]; p += 20;
    var no = u32(d, p); p += 4;
    var offs = [];
    for (j = 0; j < no; j++, p += 4) offs.push(u32(d, p));
    infos.push({ uuid: uuid, offsets: offs });
  }
  var modelOffset = u32(d, p), fileEnd = u32(d, p + 4);
  var out = { version: version, fileStructures: [], byUuid: {} };
  for (i = 0; i < nfs; i++) {
    var o = infos[i].offsets, fs = { uuid: infos[i].uuid, index: i };
    fs.globals = new SectionReader(inflate(d, o[1], o[2])).globals();
    fs.tree = new SectionReader(inflate(d, o[2], o[3])).tree();
    fs.tess = new SectionReader(inflate(d, o[3], o[4])).tessSection();
    out.fileStructures.push(fs);
    out.byUuid[uuidKey(fs.uuid)] = fs;
  }
  out.modelFile = new SectionReader(inflate(d, modelOffset, Math.min(fileEnd, d.length))).modelFile();
  return out;
}
