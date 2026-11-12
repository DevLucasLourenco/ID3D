// Visualizador: cena three.js, camera, arvore de componentes, selecao, corte e medicao.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { load, normalMismatch, creaseNormals } from '../core/index.js';

(function main() {
  var $ = function (s) { return document.querySelector(s); };
  var V3 = THREE.Vector3;
  var rad = THREE.MathUtils.degToRad, deg = THREE.MathUtils.radToDeg;

  // ------------------------------------------------------------------ estado
  var S = {
    w: 1, h: 1, dirty: true, tween: null,
    root: null, nodes: [], meshNodes: [], pickList: [],
    center: new V3(), box: new THREE.Box3(), radius: 1, worldUp: new V3(0, 0, 1),
    baseFov: 45, viewSize: 1, views: [],
    selected: null, mode: 'solid',
    section: { on: false, axis: 'z', t: 0.5, flip: false },
    measure: { on: false, pts: [] }
  };
  var HILITE = new THREE.Color(0xffb020);
  // As cores do PRC estao em sRGB; o three.js trabalha internamente em espaco linear.
  function srgb(c) { return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); }
  function srgbToLinear(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }

  // ------------------------------------------------------------------ renderer / cena
  var view = $('#view'), canvas = $('#gl');
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  } catch (e) {
    showError('Este navegador não conseguiu iniciar o WebGL (aceleração gráfica desativada?).');
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.localClippingEnabled = true;

  var scene = new THREE.Scene();
  var hemi = new THREE.HemisphereLight(0xffffff, 0x4a4f5a, 1.9);
  var head = new THREE.DirectionalLight(0xffffff, 1.9);
  scene.add(hemi, head, head.target);
  var modelRoot = new THREE.Group();
  scene.add(modelRoot);

  var persp = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
  var ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  var camera = persp, controls = null;

  // plano de corte: sempre presente nos materiais; "desligado" = plano no infinito
  var clipPlane = new THREE.Plane(new V3(0, 0, -1), 1e30);
  var clipPlanes = [clipPlane];

  // eixos (triade) no canto
  var triadScene = new THREE.Scene(), triadCam = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 20);
  (function () {
    var cols = [0xe5484d, 0x30a46c, 0x3e7bfa], names = ['X', 'Y', 'Z'];
    for (var i = 0; i < 3; i++) {
      var d = new V3(); d.setComponent(i, 1);
      triadScene.add(new THREE.ArrowHelper(d, new V3(), 1, cols[i], 0.28, 0.16));
      var c = document.createElement('canvas'); c.width = c.height = 64;
      var g = c.getContext('2d'); g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#' + cols[i].toString(16).padStart(6, '0'); g.fillText(names[i], 32, 34);
      var tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      sp.position.copy(d).multiplyScalar(1.28); sp.scale.setScalar(0.42);
      triadScene.add(sp);
    }
  })();

  // medicao
  var measureGroup = new THREE.Group(); scene.add(measureGroup);
  var measureLineMat = new THREE.LineBasicMaterial({ color: 0xffb020, depthTest: false, transparent: true });
  var measurePtMat = new THREE.PointsMaterial({ color: 0xffb020, size: 9, sizeAttenuation: false, depthTest: false, transparent: true });

  // ------------------------------------------------------------------ materiais
  var matCache = new Map();
  var edgeMat = new THREE.LineBasicMaterial({ color: 0x14181f, clippingPlanes: clipPlanes });
  function getMaterial(color, opacity, vertexColors, hilite) {
    var hex = vertexColors ? 'vc' : srgb(color).getHexString();
    var key = hex + '|' + opacity.toFixed(3) + '|' + (hilite ? 1 : 0);
    var m = matCache.get(key);
    if (!m) {
      var c = vertexColors ? new THREE.Color(1, 1, 1) : srgb(color);
      m = new THREE.MeshPhongMaterial({
        color: c, specular: 0x1c1c1c, shininess: 28, side: THREE.DoubleSide, vertexColors: !!vertexColors,
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: clipPlanes
      });
      if (hilite) { m.color.lerp(HILITE, 0.62); m.emissive.copy(HILITE).multiplyScalar(0.22); }
      m.userData.baseOpacity = opacity;
      styleMaterial(m);
      matCache.set(key, m);
    }
    return m;
  }
  function styleMaterial(m) {
    var o = m.userData.baseOpacity, x = S.mode === 'xray';
    m.opacity = x ? Math.min(o, 0.28) : o;
    m.transparent = m.opacity < 1;
    m.depthWrite = !m.transparent;
    m.needsUpdate = true;
  }

  // ------------------------------------------------------------------ camera
  function resize() {
    var w = Math.max(1, view.clientWidth), h = Math.max(1, view.clientHeight);
    if (w === S.w && h === S.h) return;
    S.w = w; S.h = h;
    renderer.setSize(w, h, false);
    updateProjection();
    S.dirty = true;
  }
  function updateProjection() {
    var aspect = S.w / S.h, t = Math.tan(rad(S.baseFov) / 2);
    persp.fov = deg(2 * Math.atan(aspect >= 1 ? t : t / aspect));   // baseFov vale para a menor dimensao
    persp.aspect = aspect;
    var half = S.viewSize / 2, hh = aspect >= 1 ? half : half / aspect, hw = hh * aspect;
    ortho.left = -hw; ortho.right = hw; ortho.top = hh; ortho.bottom = -hh;
    persp.updateProjectionMatrix(); ortho.updateProjectionMatrix();
  }
  function updateClipRange() {
    var d = camera.position.length(), R = S.radius * 1.6;   // modelo recentrado na origem
    if (camera === persp) {
      persp.near = Math.max((d - R) * 0.9, S.radius * 2e-3, 1e-7);
      persp.far = d + R;
    } else { ortho.near = d - R; ortho.far = d + R; }
    camera.updateProjectionMatrix();
  }
  function setOrtho(on) {
    if (on === (camera === ortho) || !controls) return;
    var dir = camera.position.clone().sub(controls.target), dist = dir.length(), t = Math.tan(rad(S.baseFov) / 2);
    dir.normalize();
    if (on) {
      S.viewSize = 2 * dist * t; ortho.zoom = 1;
      ortho.position.copy(camera.position); ortho.quaternion.copy(camera.quaternion);
      camera = ortho;
    } else {
      var e = S.viewSize / ortho.zoom;
      persp.position.copy(controls.target).addScaledVector(dir, e / (2 * t));
      persp.quaternion.copy(camera.quaternion);
      camera = persp;
    }
    controls.object = camera;
    updateProjection(); controls.update();
    syncProjButtons(); S.dirty = true;
  }
  function syncProjButtons() {
    document.querySelectorAll('#segProj button').forEach(function (b) { b.classList.toggle('on', (b.dataset.v === 'ortho') === (camera === ortho)); });
  }

  // Leva a camera para (direcao, alvo, distancia), com transicao suave.
  function goTo(o) {
    if (!controls) return;
    var fwd = o.fwd.clone().normalize(), s = fwd.dot(S.worldUp);
    // vistas de topo/base: inclina minimamente para fixar qual lado fica "para cima" na tela
    if (Math.abs(s) > 0.9995 && o.up) fwd.addScaledVector(o.up, -Math.sign(s) * 2e-3).normalize();
    if (o.fov) { S.baseFov = Math.min(120, Math.max(5, o.fov)); updateProjection(); }
    if (o.ortho !== undefined) setOrtho(o.ortho);
    var dist = o.dist, size = o.viewSize;
    if (camera === ortho && !size) size = 2 * dist * Math.tan(rad(S.baseFov) / 2);
    var pos1 = o.target.clone().addScaledVector(fwd, -dist), t1 = o.target.clone();
    var off0 = camera.position.clone().sub(controls.target), len0 = off0.length() || 1, len1 = dist;
    var d0 = off0.clone().normalize(), d1 = fwd.clone().negate();
    var q = new THREE.Quaternion().setFromUnitVectors(d0, d1), qi = new THREE.Quaternion(), qt = new THREE.Quaternion();
    var t0 = controls.target.clone(), e0 = S.viewSize / ortho.zoom, start = performance.now(), dur = o.instant ? 0 : 380;
    S.tween = function (now) {
      var k = dur ? Math.min(1, (now - start) / dur) : 1, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      if (k >= 1) { camera.position.copy(pos1); controls.target.copy(t1); }
      else {
        qt.copy(qi).slerp(q, e);
        controls.target.lerpVectors(t0, t1, e);
        camera.position.copy(d0).applyQuaternion(qt).multiplyScalar(len0 + (len1 - len0) * e).add(controls.target);
      }
      if (camera === ortho) { S.viewSize = e0 + (size - e0) * e; ortho.zoom = 1; updateProjection(); }
      controls.update();
      S.dirty = true;
      if (k >= 1) S.tween = null;
    };
  }
  function fitBox(box, instant) {
    if (!controls || box.isEmpty()) return;
    var sph = box.getBoundingSphere(new THREE.Sphere()), R = Math.max(sph.radius, S.radius * 1e-4, 1e-9);
    var fwd = controls.target.clone().sub(camera.position).normalize();
    goTo({ fwd: fwd, target: sph.center, dist: R / Math.sin(rad(S.baseFov) / 2) * 1.04, viewSize: 2 * R * 1.08, instant: instant });
  }
  function applyView(v, instant) {
    if (!v) return;
    if (v.std) {
      var sph = S.box.getBoundingSphere(new THREE.Sphere());
      goTo({ fwd: v.fwd, up: v.up, target: sph.center, dist: sph.radius / Math.sin(rad(S.baseFov) / 2) * 1.04, viewSize: 2 * sph.radius * 1.08, ortho: !!v.ortho, instant: instant });
      return;
    }
    var c = v.c2w, fwd = new V3(c[6], c[7], c[8]).normalize(), up = new V3(c[3], c[4], c[5]).normalize();
    var pos = new V3(c[9] - S.center.x, c[10] - S.center.y, c[11] - S.center.z);
    var co = v.co > 0 ? v.co : Math.max(pos.length(), S.radius);
    var target = pos.clone().addScaledVector(fwd, co);
    if (!v.ortho) {
      // vista em perspectiva gravada longe demais do modelo: mantem direcao e abertura, mas enquadra
      var sp = S.box.getBoundingSphere(new THREE.Sphere()), f = Math.min(120, Math.max(5, v.fov || S.baseFov));
      var fitDist = sp.radius / Math.sin(rad(f) / 2) * 1.04;
      if (pos.distanceTo(sp.center) > fitDist * 1.5) { target = sp.center; co = fitDist; }
    }
    goTo({
      fwd: fwd, up: up, target: target, dist: co, ortho: !!v.ortho,
      viewSize: v.ortho && v.os > 0 ? 1 / v.os : 0, fov: !v.ortho && v.fov ? v.fov : 0, instant: instant
    });
  }

  // ------------------------------------------------------------------ modelo
  function clearModel() {
    S.meshNodes.forEach(function (n) {
      n.three.geometry.dispose();
      if (n.edges) n.edges.geometry.dispose();
    });
    while (modelRoot.children.length) modelRoot.remove(modelRoot.children[0]);
    matCache.forEach(function (m) { m.dispose(); }); matCache.clear();
    S.root = null; S.nodes = []; S.meshNodes = []; S.pickList = []; S.selected = null;
    clearMeasure();
    if (controls) { controls.dispose(); controls = null; }
    $('#tree').textContent = ''; $('#info').hidden = true;
  }

  function detectUp(views) {
    var up = new V3(0, 0, 1);
    for (var i = 0; i < views.length; i++) {
      var c = views[i].c2w, f = new V3(c[6], c[7], c[8]), u = new V3(c[3], c[4], c[5]);
      // usa a primeira vista que nao seja de topo/base em nenhum eixo
      var ax = [Math.abs(u.x), Math.abs(u.y), Math.abs(u.z)], k = ax.indexOf(Math.max.apply(null, ax));
      if (Math.abs(f.getComponent(k)) > 0.9) continue;
      up.set(0, 0, 0).setComponent(k, Math.sign(u.getComponent(k)) || 1);
      break;
    }
    return up;
  }

  function buildModel(sc, fileName) {
    clearModel();
    S.root = sc.root; S.views = sc.views.slice();
    var id = 0;
    (function walk(n, parent) {
      n.id = id++; n.parent = parent; n.visible = !n.hidden; S.nodes.push(n);
      if (n.mesh) S.meshNodes.push(n);
      var g = 0;
      n.children.forEach(function (c) {
        if (!c.name) c.label = c.mesh ? 'Geometria ' + (++g) : (c.kind === 'product' ? 'Conjunto sem nome' : 'Grupo sem nome');
        walk(c, n);
      });
    })(S.root, null);
    if (!S.root.name) S.root.label = fileName || 'Modelo';
    if (!S.meshNodes.length) { showError('O arquivo foi lido, mas não contém geometria triangulada para exibir.'); return; }

    // caixa envolvente em precisao dupla, para recentrar o modelo na origem
    var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    S.meshNodes.forEach(function (n) {
      var p = n.mesh.positions, m = n.matrix;
      for (var i = 0; i < p.length; i += 3) {
        var x = p[i], y = p[i + 1], z = p[i + 2];
        var wx = m[0] * x + m[4] * y + m[8] * z + m[12], wy = m[1] * x + m[5] * y + m[9] * z + m[13], wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        if (wx < mn[0]) mn[0] = wx; if (wx > mx[0]) mx[0] = wx;
        if (wy < mn[1]) mn[1] = wy; if (wy > mx[1]) mx[1] = wy;
        if (wz < mn[2]) mn[2] = wz; if (wz > mx[2]) mx[2] = wz;
      }
    });
    S.center.set((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2);
    S.box.min.set(mn[0], mn[1], mn[2]).sub(S.center); S.box.max.set(mx[0], mx[1], mx[2]).sub(S.center);
    S.radius = Math.max(S.box.getBoundingSphere(new THREE.Sphere()).radius, 1e-9);

    var cx = S.center.x, cy = S.center.y, cz = S.center.z, nm = new THREE.Matrix3(), m4 = new THREE.Matrix4(), tris = 0, recalculated = 0;
    S.meshNodes.forEach(function (n) {
      var p = n.mesh.positions, m = n.matrix, out = new Float32Array(p.length), i;
      for (i = 0; i < p.length; i += 3) {
        var x = p[i], y = p[i + 1], z = p[i + 2];
        out[i] = m[0] * x + m[4] * y + m[8] * z + m[12] - cx;
        out[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13] - cy;
        out[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14] - cz;
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(out, 3));
      var no = null;
      if (n.mesh.normals) {
        no = new Float32Array(n.mesh.normals);
        m4.fromArray(m); nm.getNormalMatrix(m4);
        var e = nm.elements;
        for (i = 0; i < no.length; i += 3) {
          var a = no[i], b = no[i + 1], c = no[i + 2];
          var X = e[0] * a + e[3] * b + e[6] * c, Y = e[1] * a + e[4] * b + e[7] * c, Z = e[2] * a + e[5] * b + e[8] * c;
          var l = Math.sqrt(X * X + Y * Y + Z * Z) || 1;
          no[i] = X / l; no[i + 1] = Y / l; no[i + 2] = Z / l;
        }
        // alguns exportadores gravam normais que nao acompanham a geometria: nesse caso sao descartadas
        if (normalMismatch(out, no) > 0.02) { no = null; recalculated++; }
      }
      if (no) {
        // deixa o sentido de cada triangulo coerente com as normais gravadas (senao a face
        // "de tras" recebe a normal invertida e a peca aparece escura)
        var vc = n.vertexColors ? new Float32Array(n.vertexColors) : null, k, sw;
        for (i = 0; i + 8 < out.length; i += 9) {
          var ux = out[i + 3] - out[i], uy = out[i + 4] - out[i + 1], uz = out[i + 5] - out[i + 2];
          var vx = out[i + 6] - out[i], vy = out[i + 7] - out[i + 1], vz = out[i + 8] - out[i + 2];
          var gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
          var sx = no[i] + no[i + 3] + no[i + 6], sy = no[i + 1] + no[i + 4] + no[i + 7], sz = no[i + 2] + no[i + 5] + no[i + 8];
          if (gx * sx + gy * sy + gz * sz < 0) {
            for (k = 3; k < 6; k++) {
              sw = out[i + k]; out[i + k] = out[i + k + 3]; out[i + k + 3] = sw;
              sw = no[i + k]; no[i + k] = no[i + k + 3]; no[i + k + 3] = sw;
              if (vc) { sw = vc[i + k]; vc[i + k] = vc[i + k + 3]; vc[i + k + 3] = sw; }
            }
          }
        }
        if (vc) n.vertexColors = vc;
      } else no = creaseNormals(out, 45);
      g.setAttribute('normal', new THREE.BufferAttribute(no, 3));
      if (n.vertexColors) {
        var lin = new Float32Array(n.vertexColors.length);
        for (i = 0; i < lin.length; i++) lin[i] = srgbToLinear(n.vertexColors[i]);
        g.setAttribute('color', new THREE.BufferAttribute(lin, 3));
      }
      g.computeBoundingBox(); g.computeBoundingSphere();
      var mesh = new THREE.Mesh(g, getMaterial(n.color, n.opacity, !!n.vertexColors, false));
      mesh.matrixAutoUpdate = false; mesh.userData.node = n;
      n.three = mesh; modelRoot.add(mesh);
      tris += p.length / 9;
    });

    // orientacao e controles
    S.worldUp.copy(detectUp(S.views));
    persp.up.copy(S.worldUp); ortho.up.copy(S.worldUp); hemi.position.copy(S.worldUp);
    camera = persp; S.baseFov = 45; S.viewSize = S.radius * 2.2; ortho.zoom = 1;
    persp.position.set(1, -1, 0.8).multiplyScalar(S.radius * 3); persp.lookAt(0, 0, 0);
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.14; controls.screenSpacePanning = true;
    controls.rotateSpeed = 0.9; controls.zoomSpeed = 1.1; controls.zoomToCursor = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    controls.minDistance = S.radius * 2e-3; controls.maxDistance = S.radius * 60;
    controls.minZoom = 0.02; controls.maxZoom = 500;
    controls.addEventListener('change', function () { S.dirty = true; });
    controls.addEventListener('start', function () { S.tween = null; });
    updateProjection(); syncProjButtons();

    // vistas: as do PDF ou, na falta, um conjunto padrao
    if (!S.views.length) S.views = standardViews();
    var sel = $('#selView'); sel.textContent = '';
    S.views.forEach(function (v, i) { var o = document.createElement('option'); o.value = i; o.textContent = v.name; sel.appendChild(o); });
    applyView(S.views[0], true);

    S.section.on = false; $('#btnSection').classList.remove('on'); $('#secPanel').hidden = true; updateSection();
    setMode(S.mode);
    applyVisibility();
    buildTree();
    $('#empty').hidden = true; $('#error').hidden = true;
    $('#docTitle').textContent = sc.info.title || fileName || 'ID3D';
    $('#docSub').textContent = [sc.info.subject, fileName].filter(Boolean).join(' · ');
    document.title = (sc.info.title || fileName || 'Modelo') + ' – ID3D';
    $('#stats').textContent = S.meshNodes.length.toLocaleString('pt-BR') + ' peças · ' + Math.round(tris).toLocaleString('pt-BR') + ' triângulos';
    $('#search').value = ''; runSearch();
    S.recalculatedNormals = recalculated;
    S.dirty = true;
  }

  function standardViews() {
    var z = S.worldUp.clone(), x = Math.abs(z.x) > 0.5 ? new V3(0, 1, 0) : new V3(1, 0, 0), y = new V3().crossVectors(z, x).normalize();
    function v(a, b, c) { return new V3().addScaledVector(x, a).addScaledVector(y, b).addScaledVector(z, c).normalize(); }
    return [
      { std: 1, name: 'Isométrica', fwd: v(-1, 1, -0.75), up: z },
      { std: 1, name: 'Frente', fwd: v(0, 1, 0), up: z, ortho: 1 },
      { std: 1, name: 'Trás', fwd: v(0, -1, 0), up: z, ortho: 1 },
      { std: 1, name: 'Topo', fwd: v(0, 0, -1), up: v(0, 1, 0), ortho: 1 },
      { std: 1, name: 'Base', fwd: v(0, 0, 1), up: v(0, 1, 0), ortho: 1 },
      { std: 1, name: 'Direita', fwd: v(-1, 0, 0), up: z, ortho: 1 },
      { std: 1, name: 'Esquerda', fwd: v(1, 0, 0), up: z, ortho: 1 }
    ];
  }

  // ------------------------------------------------------------------ visibilidade / modos
  function applyVisibility() {
    var wire = S.mode === 'wire', edges = wire || S.mode === 'edges';
    S.pickList = [];
    (function walk(n, eff) {
      eff = eff && n.visible;
      if (n.three) {
        n.three.visible = eff && !wire;
        if (n.edges) n.edges.visible = eff && edges;
        if (eff) S.pickList.push(n.three);
      }
      if (n.cb) n.cb.checked = n.visible;
      if (n.rowEl) n.rowEl.classList.toggle('off', !n.visible);
      for (var i = 0; i < n.children.length; i++) walk(n.children[i], eff);
    })(S.root, true);
    S.dirty = true;
  }
  function ensureEdges() {
    S.meshNodes.forEach(function (n) {
      if (n.edges) return;
      n.edges = new THREE.LineSegments(new THREE.EdgesGeometry(n.three.geometry, 24), edgeMat);
      n.edges.matrixAutoUpdate = false;
      modelRoot.add(n.edges);
    });
  }
  function setMode(mode) {
    S.mode = mode; $('#selMode').value = mode;
    if (mode === 'edges' || mode === 'wire') ensureEdges();
    matCache.forEach(styleMaterial);
    updateEdgeColor();
    if (S.root) applyVisibility();
  }
  function updateEdgeColor() {
    var light = document.documentElement.dataset.theme === 'light';
    edgeMat.color.set(S.mode === 'wire' ? (light ? 0x27303d : 0xc9d3e2) : 0x12161c);
    S.dirty = true;
  }
  function subtree(n, fn) { fn(n); for (var i = 0; i < n.children.length; i++) subtree(n.children[i], fn); }
  function showAll() { S.nodes.forEach(function (n) { n.visible = true; }); applyVisibility(); }
  function isolate(n) {
    S.nodes.forEach(function (x) { x.visible = false; });
    subtree(n, function (x) { x.visible = true; });
    for (var p = n.parent; p; p = p.parent) p.visible = true;
    applyVisibility();
  }
  function nodeBox(n) {
    var b = new THREE.Box3();
    subtree(n, function (x) { if (x.three) b.union(x.three.geometry.boundingBox); });
    return b;
  }

  // ------------------------------------------------------------------ selecao
  function select(n, reveal) {
    if (S.selected) subtree(S.selected, function (x) {
      if (x.three) x.three.material = getMaterial(x.color, x.opacity, !!x.vertexColors, false);
      if (x.rowEl) x.rowEl.classList.remove('sel');
    });
    S.selected = n;
    if (n) {
      subtree(n, function (x) { if (x.three) x.three.material = getMaterial(x.color, x.opacity, false, true); });
      if (reveal) revealInTree(n);
      if (n.rowEl) n.rowEl.classList.add('sel');
    }
    updateInfo(); S.dirty = true;
  }
  function label(n) { return n.name || n.label || 'Sem nome'; }
  function fmt(v) {
    var a = Math.abs(v);
    return v.toLocaleString('pt-BR', { maximumFractionDigits: a >= 1000 ? 1 : a >= 10 ? 2 : 3, minimumFractionDigits: 0 });
  }
  function updateInfo() {
    var n = S.selected, el = $('#info');
    if (!n) { el.hidden = true; return; }
    el.hidden = false;
    $('#infoName').textContent = label(n);
    var path = []; for (var p = n.parent; p; p = p.parent) path.unshift(label(p));
    $('#infoPath').textContent = path.join(' › ');
    var b = nodeBox(n), dl = $('#infoData'), tris = 0, parts = 0;
    subtree(n, function (x) { if (x.three) { parts++; tris += x.three.geometry.attributes.position.count / 3; } });
    dl.textContent = '';
    function add(k, v) { var dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; dl.appendChild(dt); dl.appendChild(dd); }
    if (!b.isEmpty()) {
      var sz = b.getSize(new V3()), c = b.getCenter(new V3()).add(S.center);
      add('Dimensões', fmt(sz.x) + ' × ' + fmt(sz.y) + ' × ' + fmt(sz.z));
      add('Centro', fmt(c.x) + ' ; ' + fmt(c.y) + ' ; ' + fmt(c.z));
    }
    add('Geometria', parts.toLocaleString('pt-BR') + (parts === 1 ? ' peça · ' : ' peças · ') + tris.toLocaleString('pt-BR') + ' triângulos');
    (n.attributes || []).forEach(function (a) {
      a.keys.forEach(function (k) { if (k.value !== undefined) add(String(k.title || a.title), String(k.value)); });
    });
  }

  // ------------------------------------------------------------------ arvore
  function makeRow(n) {
    var wrap = document.createElement('div'); wrap.className = 'tn';
    var row = document.createElement('div'); row.className = 'trow'; row.title = label(n);
    var tw = document.createElement('button'); tw.className = 'tw' + (n.children.length ? '' : ' leaf'); tw.textContent = '▸'; tw.tabIndex = -1;
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = n.visible; cb.title = 'Mostrar / ocultar';
    var nm = document.createElement('span'); nm.className = 'nm' + (n.name ? '' : ' dim'); nm.textContent = label(n);
    row.appendChild(tw); row.appendChild(cb);
    if (n.mesh) {
      var sw = document.createElement('span'); sw.className = 'sw';
      sw.style.background = n.vertexColors ? 'linear-gradient(135deg,#e5484d,#3e7bfa)' : 'rgb(' + n.color.map(function (v) { return Math.round(v * 255); }).join(',') + ')';
      row.appendChild(sw);
    }
    row.appendChild(nm);
    var kids = document.createElement('div'); kids.className = 'kids'; kids.hidden = true;
    wrap.appendChild(row); wrap.appendChild(kids);
    n.rowEl = row; n.kidsEl = kids; n.twEl = tw; n.cb = cb;
    row.classList.toggle('off', !n.visible);
    if (n === S.selected) row.classList.add('sel');
    tw.addEventListener('click', function (e) { e.stopPropagation(); expand(n, kids.hidden); });
    cb.addEventListener('click', function (e) { e.stopPropagation(); });
    cb.addEventListener('change', function () {
      n.visible = cb.checked;
      if (n.visible) for (var p = n.parent; p; p = p.parent) p.visible = true;
      applyVisibility();
    });
    row.addEventListener('click', function () { select(n === S.selected ? null : n, false); });
    row.addEventListener('dblclick', function () { select(n, false); var b = nodeBox(n); if (!b.isEmpty()) fitBox(b); });
    return wrap;
  }
  function expand(n, open) {
    if (!n.kidsEl || !n.children.length) return;
    if (open && !n.kidsDone) {
      var f = document.createDocumentFragment();
      n.children.forEach(function (c) { f.appendChild(makeRow(c)); });
      n.kidsEl.appendChild(f); n.kidsDone = true;
    }
    n.kidsEl.hidden = !open; n.twEl.textContent = open ? '▾' : '▸';
  }
  function buildTree() {
    var t = $('#tree'); t.textContent = '';
    S.nodes.forEach(function (n) { n.rowEl = n.kidsEl = n.twEl = n.cb = null; n.kidsDone = false; });
    t.appendChild(makeRow(S.root));
    expand(S.root, true);
    if (S.root.children.length <= 12) S.root.children.forEach(function (c) { if (c.kind === 'product') expand(c, true); });
  }
  function revealInTree(n) {
    var chain = []; for (var p = n.parent; p; p = p.parent) chain.unshift(p);
    chain.forEach(function (p) { expand(p, true); });
    if (n.rowEl && !$('#tree').hidden) n.rowEl.scrollIntoView({ block: 'nearest' });
  }
  function runSearch() {
    var q = $('#search').value.trim().toLowerCase(), res = $('#results'), tree = $('#tree');
    if (!q || !S.root) { res.hidden = true; tree.hidden = false; return; }
    tree.hidden = true; res.hidden = false; res.textContent = '';
    var found = 0;
    for (var i = 0; i < S.nodes.length && found < 300; i++) {
      var n = S.nodes[i];
      if (label(n).toLowerCase().indexOf(q) < 0) continue;
      found++;
      var d = document.createElement('div'); d.className = 'res'; d.textContent = label(n);
      var sm = document.createElement('small'), path = [];
      for (var p = n.parent; p; p = p.parent) path.unshift(label(p));
      sm.textContent = path.join(' › '); d.appendChild(sm);
      (function (node) {
        d.addEventListener('click', function () { select(node, true); var b = nodeBox(node); if (!b.isEmpty()) fitBox(b); });
      })(n);
      res.appendChild(d);
    }
    if (!found) { var e = document.createElement('div'); e.className = 'none'; e.textContent = 'Nenhum componente encontrado.'; res.appendChild(e); }
  }

  // ------------------------------------------------------------------ picking
  var raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(ev) {
    if (!S.root) return null;
    var r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(ndc, camera);
    var hits = raycaster.intersectObjects(S.pickList, false);
    for (var i = 0; i < hits.length; i++) if (clipPlane.distanceToPoint(hits[i].point) >= 0) return hits[i];
    return null;
  }
  function snapVertex(hit, ev) {
    var pos = hit.object.geometry.attributes.position, r = canvas.getBoundingClientRect(), best = null, bd = 12;
    [hit.face.a, hit.face.b, hit.face.c].forEach(function (i) {
      var v = new V3().fromBufferAttribute(pos, i), s = v.clone().project(camera);
      var d = Math.hypot((s.x + 1) / 2 * r.width + r.left - ev.clientX, (1 - s.y) / 2 * r.height + r.top - ev.clientY);
      if (d < bd) { bd = d; best = v; }
    });
    return best || hit.point.clone();
  }
  var down = null;
  canvas.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY, b: e.button }; });
  canvas.addEventListener('pointerup', function (e) {
    if (!down || down.b !== 0 || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) { down = null; return; }
    down = null;
    var hit = pick(e);
    if (S.measure.on) { if (hit) addMeasurePoint(snapVertex(hit, e)); return; }
    if (!hit) { select(null); return; }
    var n = hit.object.userData.node;
    while (n && !n.name && n.parent) n = n.parent;       // seleciona o componente nomeado mais proximo
    select(n === S.selected ? null : n, true);
  });
  canvas.addEventListener('dblclick', function (e) {
    var hit = pick(e);
    if (!hit || !controls || S.measure.on) return;
    // recentra a orbita no ponto clicado, sem mudar a direcao de visao
    var fwd = controls.target.clone().sub(camera.position), dist = fwd.length();
    goTo({ fwd: fwd, target: hit.point.clone(), dist: dist, viewSize: S.viewSize / ortho.zoom });
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  // ------------------------------------------------------------------ medicao
  function clearMeasure() {
    S.measure.pts = [];
    while (measureGroup.children.length) { var c = measureGroup.children[0]; c.geometry.dispose(); measureGroup.remove(c); }
    $('#measureLabel').hidden = true; S.dirty = true;
  }
  function addMeasurePoint(p) {
    if (S.measure.pts.length >= 2) clearMeasure();
    S.measure.pts.push(p);
    while (measureGroup.children.length) { var c = measureGroup.children[0]; c.geometry.dispose(); measureGroup.remove(c); }
    var g = new THREE.BufferGeometry().setFromPoints(S.measure.pts);
    var pts = new THREE.Points(g, measurePtMat); pts.renderOrder = 10; measureGroup.add(pts);
    if (S.measure.pts.length === 2) {
      var ln = new THREE.Line(g.clone(), measureLineMat); ln.renderOrder = 9; measureGroup.add(ln);
      var a = S.measure.pts[0], b = S.measure.pts[1];
      $('#measureLabel').textContent = fmt(a.distanceTo(b)) + '   (ΔX ' + fmt(Math.abs(b.x - a.x)) + ' · ΔY ' + fmt(Math.abs(b.y - a.y)) + ' · ΔZ ' + fmt(Math.abs(b.z - a.z)) + ')';
    }
    updateHint(); S.dirty = true;
  }
  function setMeasure(on) {
    S.measure.on = on; $('#btnMeasure').classList.toggle('on', on); view.classList.toggle('measuring', on);
    if (!on) clearMeasure();
    updateHint();
  }
  function updateHint() {
    var h = 'Arrastar: girar · Botão direito ou do meio: mover · Rolagem: zoom · Clique: selecionar · Duplo clique: centralizar';
    if (S.measure.on) h = S.measure.pts.length === 1 ? 'Medir: clique no segundo ponto · Esc cancela' : 'Medir: clique em dois pontos do modelo (encaixa em vértices próximos) · Esc encerra';
    $('#hint').textContent = S.root ? h : '';
  }

  // ------------------------------------------------------------------ corte
  function updateSection() {
    var s = S.section, i = 'xyz'.indexOf(s.axis);
    if (!s.on || !S.root) { clipPlane.normal.set(0, 0, -1); clipPlane.constant = 1e30; S.dirty = true; return; }
    var mn = S.box.min.getComponent(i), mx = S.box.max.getComponent(i), p = mn + (mx - mn) * s.t;
    clipPlane.normal.set(0, 0, 0).setComponent(i, s.flip ? 1 : -1);
    clipPlane.constant = s.flip ? -p : p;
    $('#secVal').textContent = s.axis.toUpperCase() + ' = ' + fmt(p + S.center.getComponent(i));
    S.dirty = true;
  }

  // ------------------------------------------------------------------ render
  var tmp = new V3(), tmp2 = new V3();
  function render() {
    updateClipRange();
    camera.updateMatrixWorld();
    var dist = controls ? camera.position.distanceTo(controls.target) : 1;
    tmp.set(-0.45, 0.6, 1).normalize().transformDirection(camera.matrixWorld);
    head.position.copy(camera.position).addScaledVector(tmp, dist);
    if (controls) head.target.position.copy(controls.target);
    renderer.setViewport(0, 0, S.w, S.h);
    renderer.clear();
    renderer.render(scene, camera);
    // triade
    renderer.clearDepth();
    var sz = Math.min(104, Math.round(Math.min(S.w, S.h) * 0.24));
    renderer.setViewport(6, 6, sz, sz);
    camera.getWorldDirection(tmp2);
    triadCam.position.copy(tmp2).multiplyScalar(-6); triadCam.up.copy(camera.up); triadCam.lookAt(0, 0, 0);
    triadCam.quaternion.copy(camera.quaternion); triadCam.updateMatrixWorld();
    renderer.render(triadScene, triadCam);
    // rotulo da medicao
    var ml = $('#measureLabel');
    if (S.measure.pts.length === 2) {
      tmp.addVectors(S.measure.pts[0], S.measure.pts[1]).multiplyScalar(0.5).project(camera);
      ml.hidden = false;
      ml.style.left = ((tmp.x + 1) / 2 * S.w) + 'px'; ml.style.top = ((1 - tmp.y) / 2 * S.h) + 'px';
    } else ml.hidden = true;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    resize();
    if (S.tween) S.tween(now);
    else if (controls) controls.update();
    if (S.dirty) { S.dirty = false; render(); }
  }

  // ------------------------------------------------------------------ arquivos
  function showError(msg) {
    $('#errorMsg').textContent = msg; $('#error').hidden = false;
  }
  function loadBytes(u8, name) {
    var sc;
    try { sc = load(u8); }
    catch (e) { if (window.console) console.error(e); showError(String(e && e.message || e)); return false; }
    try { buildModel(sc, name); }
    catch (e2) { if (window.console) console.error(e2); showError('Falha ao montar a cena: ' + String(e2 && e2.message || e2)); return false; }
    updateHint();
    return true;
  }
  function loadFile(f) {
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () { loadBytes(new Uint8Array(rd.result), f.name); };
    rd.onerror = function () { showError('Não foi possível ler o arquivo.'); };
    rd.readAsArrayBuffer(f);
  }
  $('#file').addEventListener('change', function () { loadFile(this.files[0]); this.value = ''; });
  $('#btnOpen').addEventListener('click', function () { $('#file').click(); });
  $('#btnOpen2').addEventListener('click', function () { $('#file').click(); });
  var dragN = 0;
  window.addEventListener('dragenter', function (e) { e.preventDefault(); dragN++; $('#drop').hidden = false; });
  window.addEventListener('dragleave', function () { if (--dragN <= 0) { dragN = 0; $('#drop').hidden = true; } });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) {
    e.preventDefault(); dragN = 0; $('#drop').hidden = true;
    if (e.dataTransfer && e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]);
  });

  // ------------------------------------------------------------------ interface
  $('#selView').addEventListener('change', function () { applyView(S.views[+this.value]); });
  $('#btnFit').addEventListener('click', fitCurrent);
  function fitCurrent() {
    if (!S.root) return;
    var b = S.selected ? nodeBox(S.selected) : new THREE.Box3();
    if (b.isEmpty()) { S.pickList.forEach(function (m) { b.union(m.geometry.boundingBox); }); }
    if (b.isEmpty()) b.copy(S.box);
    fitBox(b);
  }
  $('#segProj').addEventListener('click', function (e) { var v = e.target.dataset.v; if (v) setOrtho(v === 'ortho'); });
  $('#selMode').addEventListener('change', function () { setMode(this.value); });
  $('#btnSection').addEventListener('click', function () {
    S.section.on = !S.section.on; this.classList.toggle('on', S.section.on); $('#secPanel').hidden = !S.section.on; updateSection();
  });
  $('#segAxis').addEventListener('click', function (e) {
    var v = e.target.dataset.v; if (!v) return;
    S.section.axis = v;
    this.querySelectorAll('button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
    updateSection();
  });
  $('#secPos').addEventListener('input', function () { S.section.t = this.value / 1000; updateSection(); });
  $('#secFlip').addEventListener('change', function () { S.section.flip = this.checked; updateSection(); });
  $('#btnMeasure').addEventListener('click', function () { setMeasure(!S.measure.on); });
  $('#btnShowAll').addEventListener('click', showAll);
  $('#btnZoomSel').addEventListener('click', fitCurrent);
  $('#btnIsolate').addEventListener('click', function () { if (S.selected) isolate(S.selected); });
  $('#btnHide').addEventListener('click', function () { if (S.selected) { S.selected.visible = false; applyVisibility(); } });
  $('#btnErrClose').addEventListener('click', function () { $('#error').hidden = true; });
  $('#search').addEventListener('input', runSearch);
  $('#btnSide').addEventListener('click', function () { $('#app').classList.toggle('noSide'); });
  $('#btnTheme').addEventListener('click', function () {
    var t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('id3d-theme', t); } catch (e) { /* sem armazenamento */ }
    updateEdgeColor();
  });
  try { var th = localStorage.getItem('id3d-theme'); if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th; } catch (e) { /* sem armazenamento */ }
  if (window.matchMedia('(max-width: 760px)').matches) $('#app').classList.add('noSide');

  window.addEventListener('keydown', function (e) {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (k === 'f') fitCurrent();
    else if (k === 'm') setMeasure(!S.measure.on);
    else if (k === 'h' && S.selected) { S.selected.visible = false; applyVisibility(); }
    else if (k === 'i' && S.selected) isolate(S.selected);
    else if (k === 'a') showAll();
    else if (k === 'escape') { if (S.measure.on) setMeasure(false); else select(null); }
  });

  // ------------------------------------------------------------------ inicio
  resize();
  requestAnimationFrame(frame);
  var emb = document.getElementById('embedded-pdf');
  if (emb) {
    var bin = atob(emb.textContent.trim()), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    if (!loadBytes(u8, emb.dataset.name || '')) $('#empty').hidden = false;
  } else $('#empty').hidden = false;
  updateHint();

  // acesso para depuracao no console
  window.ID3D = { state: S, loadBytes: loadBytes, applyView: applyView, fit: fitCurrent };
})();
