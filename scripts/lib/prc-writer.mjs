// Gravador minimo de arquivos PRC, espelho do leitor em src/core. Existe para gerar modelos
// sinteticos (testes e exemplo publico); cobre so o subconjunto do formato que o leitor entende.

import { deflateSync } from 'node:zlib';
import { doubleTable } from '../../src/core/prc-double-table.js';
import { T, REFERENCEABLE } from '../../src/core/prc-types.js';

const PRC_VERSION = 8137;

// expoente IEEE -> entradas da tabela de doubles, na ordem original
let BY_EXPONENT = null;
function byExponent() {
  if (BY_EXPONENT) return BY_EXPONENT;
  BY_EXPONENT = new Map();
  for (const [key, e] of doubleTable()) {
    const exponent = (e.upper >>> 20) & 0x7ff;
    if (!BY_EXPONENT.has(exponent)) BY_EXPONENT.set(exponent, []);
    BY_EXPONENT.get(exponent).push({ ...e, bits: Math.floor(key / 4194304), code: key % 4194304 });
  }
  return BY_EXPONENT;
}

export class BitWriter {
  constructor() { this.bytes = []; this.n = 0; }
  bit(b) {
    const i = this.n >> 3;
    if (i >= this.bytes.length) this.bytes.push(0);
    if (b) this.bytes[i] |= 0x80 >> (this.n & 7);
    this.n++;
    return this;
  }
  bits(v, count) { for (let i = count - 1; i >= 0; i--) this.bit(Math.floor(v / 2 ** i) % 2); return this; }
  byte(v) { return this.bits(v & 0xff, 8); }
  uint(v) {
    while (v !== 0) { this.bit(1); this.byte(v % 256); v = Math.floor(v / 256); }
    return this.bit(0);
  }
  int(v) {
    let last = 0;
    while (!((v === 0 && (last & 0x80) === 0) || (v === -1 && (last & 0x80) !== 0))) {
      this.bit(1); last = v & 0xff; this.byte(last); v >>= 8;
    }
    return this.bit(0);
  }
  string(s) {
    if (!s) return this.bit(0);
    const b = Buffer.from(s, 'utf8');
    this.bit(1).uint(b.length);
    for (const x of b) this.byte(x);
    return this;
  }
  // Mesmo algoritmo do gravador de referencia (codigo de Huffman do expoente + mantissa comprimida).
  double(v) {
    const dv = new DataView(new ArrayBuffer(8));
    dv.setFloat64(0, v, true);
    const b = new Uint8Array(dv.buffer), upper = dv.getUint32(4, true), lower = dv.getUint32(0, true);
    const group = byExponent().get((upper >>> 20) & 0x7ff);
    if (!group) throw new Error('double fora da tabela PRC: ' + v);
    const entry = group.find((e) => !e.isDouble || (e.upper === (upper & 0x7fffffff) && e.lower === lower));
    this.bits(entry.code, entry.bits);
    if (v === 0) return this;
    this.bit(upper >>> 31);
    if (entry.isDouble) return this;
    if ((upper & 0xfffff) === 0 && lower === 0) return this.bit(0);
    this.bit(1).bits(b[6] & 0x0f, 4);
    const saveAtEnd = b[0] !== b[1];
    let stop = 1;
    while (stop < 7 && b[stop] === b[stop + 1]) stop++;
    const backref = (pb) => { for (let j = pb + 1; j <= 5; j++) if (b[j] === b[pb]) return j - pb; return 0; };
    const emit = (pb, d) => (d ? this.bit(0).bits(d, 3) : this.bit(1).byte(b[pb]));
    for (let pb = 5; pb >= stop; pb--) emit(pb, pb === 5 ? 0 : backref(pb));
    if (stop > 1) {
      if (saveAtEnd) this.bit(0).bits(6, 3).byte(b[0]);
      else this.bit(0).bits(0, 3);
    } else emit(0, backref(0));
    return this;
  }
  toBytes() { return Uint8Array.from(this.bytes); }
}

// Uma secao comprimida: mantem o nome e os graficos "correntes", como o formato exige.
class Section extends BitWriter {
  constructor() { super(); this.name = ''; this.layer = -1; this.style = -1; this.behaviour = 1; }
  base(type, name = '', prcId = 0) {
    this.uint(0);                                   // atributos
    if (name === this.name) this.bit(1); else { this.bit(0).string(name); this.name = name; }
    if (REFERENCEABLE[type]) this.uint(0).uint(0).uint(prcId);
    return this;
  }
  graphics({ layer = -1, style = -1, behaviour = 1 } = {}) {
    if (layer === this.layer && style === this.style && behaviour === this.behaviour) return this.bit(1);
    this.bit(0).uint(layer + 1).uint(style + 1).byte(behaviour & 0xff).byte(behaviour >> 8);
    this.layer = layer; this.style = style; this.behaviour = behaviour;
    return this;
  }
  doubles(list) { for (const v of list) this.double(v); return this; }
  uints(list) { this.uint(list.length); for (const v of list) this.uint(v); return this; }
  userData() { return this.uint(0); }
  transformation(m) {
    if (Array.isArray(m)) return this.uint(T.MISC_GeneralTransformation).doubles(m);   // 16 valores, por colunas
    // forma cartesiana: { origin?, x?, y?, scale? }
    const behaviour = (m.origin ? 0x01 : 0) | (m.x ? 0x02 : 0) | (m.scale !== undefined ? 0x08 : 0);
    this.uint(T.MISC_CartesianTransformation).byte(behaviour);
    if (m.origin) this.doubles(m.origin);
    if (m.x) this.doubles(m.x).doubles(m.y);
    if (m.scale !== undefined) this.double(m.scale);
    return this;
  }
  compressed() { return deflateSync(Buffer.from(this.bytes)); }
}

function writeItem(s, item, ids) {
  const isSet = Array.isArray(item.items);
  const type = isSet ? T.RI_Set : T.RI_PolyBrepModel;
  s.uint(type).base(type, item.name, ids.next++).graphics(item)
    .uint((item.localCS ?? -1) + 1).uint(isSet ? 0 : (item.tess ?? -1) + 1);
  if (isSet) { s.uint(item.items.length); for (const child of item.items) writeItem(s, child, ids); }
  else s.bit(item.closed ? 1 : 0);
  s.userData();
}

function globalsSection(fs, referenced) {
  const s = new Section();
  s.uint(0).uint(T.ASM_FileStructureGlobals).base(T.ASM_FileStructureGlobals);
  s.uint(referenced.length);
  for (const uuid of referenced) for (const v of uuid) s.uint(v);
  s.double(2000).double(40).string('').uint(0);                 // tesselacao padrao, fonte, n. de fontes
  const colors = fs.colors || [];
  s.uint(colors.length);
  for (const c of colors) s.doubles(c);
  s.uint(0).uint(0).uint(0);                                    // imagens, texturas, materiais
  s.uint(1).uint(T.GRAPH_LinePattern).base(T.GRAPH_LinePattern).uint(0).double(0).bit(0);
  const styles = fs.styles || colors.map((_, i) => ({ color: i }));
  s.uint(styles.length);
  for (const st of styles) {
    s.uint(T.GRAPH_Style).base(T.GRAPH_Style).double(1).bit(0).uint(0).bit(0).uint(st.color * 3 + 1);
    if (st.transparency !== undefined) s.bit(1).byte(st.transparency); else s.bit(0);
    s.bit(0).bit(0).bit(0);
  }
  s.uint(0).uint(0);                                            // preenchimentos, sistemas de coordenadas
  return s.userData();
}

function treeSection(fs) {
  const s = new Section(), ids = { next: 1 };
  s.uint(T.ASM_FileStructureTree).base(T.ASM_FileStructureTree);
  const parts = fs.parts || [], products = fs.products || [];
  s.uint(parts.length);
  for (const part of parts) {
    s.uint(T.ASM_PartDefinition).base(T.ASM_PartDefinition, part.name, ids.next++).graphics(part);
    s.doubles(part.bbox || [0, 0, 0, 0, 0, 0]);
    s.uint(part.items.length);
    for (const item of part.items) writeItem(s, item, ids);
    s.uint(0).uint(0).uint(0).uint(0).uint(0).userData();        // markups e vistas
  }
  s.uint(products.length);
  for (const po of products) {
    s.uint(T.ASM_ProductOccurence).base(T.ASM_ProductOccurence, po.name, ids.next++).graphics(po);
    s.uint((po.part ?? -1) + 1);
    for (const key of ['prototype', 'external']) {
      const ref = po[key];
      if (!ref) { s.uint(0); continue; }
      s.uint(ref.index + 1);
      if (ref.fs) { s.bit(0); for (const v of ref.fs) s.uint(v); } else s.bit(1);
    }
    s.uints(po.sons || []);
    s.byte(0).bit(0).double(po.unit ?? 1).byte(0).int(0);        // comportamento e informacoes do produto
    if (po.location) s.bit(1).transformation(po.location); else s.bit(0);
    s.uint(0).uint(0).uint(0).uint(0).uint(0).uint(0).bit(0).uint(0).uint(0).userData();
  }
  s.uint(T.ASM_FileStructure).base(T.ASM_FileStructure).uint(ids.next).uint((fs.root ?? products.length - 1) + 1);
  return s.userData();
}

function tessSection(fs) {
  const s = new Section(), list = fs.tess || [];
  s.uint(T.ASM_FileStructureTessellation).base(T.ASM_FileStructureTessellation).uint(list.length);
  for (const t of list) {
    const normals = t.normals || [];
    s.uint(T.TESS_3D).bit(1).uint(t.coords.length).doubles(t.coords).bit(1).bit(0);
    if (normals.length) s.bit(0); else s.bit(1).byte(0).double(t.creaseAngle ?? 25.8419);
    s.uint(normals.length).doubles(normals).uint(0).uints(t.triIndex);
    s.uint(t.faces.length);
    for (const f of t.faces) {
      const la = f.style === undefined ? [] : [f.style + 1];
      s.uint(T.TESS_Face).uints(la).uint(0).uint(0).uint(f.flags).uint(f.start).uints(f.sizes).uint(0).bit(0);
      if (la.length) s.uint(1);
    }
    s.uint(0);                                                  // coordenadas de textura
  }
  return s.userData();
}

function emptySection(type) {
  const s = new Section();
  return s.uint(type).base(type).uint(0).userData();
}

function u32(...values) {
  const b = Buffer.alloc(4 * values.length);
  values.forEach((v, i) => b.writeUInt32LE(v >>> 0, i * 4));
  return b;
}
const startHeader = (uuid) => Buffer.concat([Buffer.from('PRC'), u32(PRC_VERSION, PRC_VERSION), u32(...uuid), u32(0, 0, 0, 0)]);

// model = { name?, unit?, root: { fs: indice, index }, fileStructures: [{ uuid?, colors, styles?, parts, products, tess }] }
export function writePRC(model) {
  const structures = model.fileStructures.map((fs, i) => ({ ...fs, uuid: fs.uuid || [0x49443344, 0x1000 + i, 0x2000 + i, 0x3000 + i] }));
  const chunks = structures.map((fs) => {
    // file structures citadas por prototipos/dados externos dos produtos desta
    const referenced = [];
    for (const po of fs.products || []) {
      for (const ref of [po.prototype, po.external]) {
        if (ref && ref.fs && !referenced.some((u) => u.join() === ref.fs.join())) referenced.push(ref.fs);
      }
    }
    return [
      Buffer.concat([startHeader(fs.uuid), u32(0)]),
      globalsSection(fs, referenced).compressed(), treeSection(fs).compressed(), tessSection(fs).compressed(),
      emptySection(T.ASM_FileStructureGeometry).compressed(), emptySection(T.ASM_FileStructureExtraGeometry).compressed(),
    ];
  });

  const root = model.root || { fs: structures.length - 1 };
  const rootFs = structures[root.fs];
  const mf = new Section();
  mf.uint(0).uint(T.ASM_ModelFile).base(T.ASM_ModelFile, model.name || '').bit(1).double(model.unit ?? 1).uint(1);
  for (const v of rootFs.uuid) mf.uint(v);
  mf.uint((root.index ?? (rootFs.products.length - 1)) + 1).bit(1).uint(0).userData();
  const modelFile = mf.compressed();

  const headerSize = 3 + 8 + 32 + 4 + structures.length * (16 + 8 + 24) + 12;
  let offset = headerSize;
  const infos = chunks.map((parts, i) => {
    const offsets = parts.map((p) => { const o = offset; offset += p.length; return o; });
    return Buffer.concat([u32(...structures[i].uuid), u32(0, 6), u32(...offsets)]);
  });
  const modelOffset = offset, fileSize = offset + modelFile.length;
  const out = Buffer.concat([
    startHeader(rootFs.uuid), u32(structures.length), ...infos, u32(modelOffset, fileSize, 0),
    ...chunks.flat(), modelFile,
  ]);
  if (out.length !== fileSize) throw new Error('tamanho do PRC inconsistente');
  return new Uint8Array(out);
}
