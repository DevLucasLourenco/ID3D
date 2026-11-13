// Visualizador: cena three.js, camera ortografica, arvore de componentes, selecao, corte,
// medicao e a ligacao com os controles de tela e os anexos.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { load, normalMismatch, creaseNormals } from '../core/index.js';
import { hydrateIcons, icon } from './icons.js';
import { createNavPad } from './navpad.js';
import { createAttachments } from './attachments.js';
import * as api from './api.js';

(function main() {
  var $ = function (s) { return document.querySelector(s); };
  var V3 = THREE.Vector3;
  var app = $('#app'), view = $('#view'), canvas = $('#gl'), drawer = $('#drawer'), panel = $('#panel');
  hydrateIcons(document);

  var prefs = {
    get: function (k, d) { try { var v = localStorage.getItem('id3d-' + k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('id3d-' + k, v); } catch (e) { /* sem armazenamento */ } },
  };
  var coarse = window.matchMedia('(pointer: coarse)').matches;

  // ------------------------------------------------------------------ estado
  var S = {
    w: 1, h: 1, freeW: 1, dirty: true, tween: null, last: 0,
    root: null, nodes: [], meshNodes: [], pickList: [], byKey: new Map(), modelId: null, fileName: '',
    center: new V3(), box: new THREE.Box3(), radius: 1, camDist: 4, worldUp: new V3(0, 0, 1),
    viewSize: 1, shift: 0, shiftTarget: 0, triadX: 8, views: [], viewIndex: -1,
    selected: null, mode: 'solid',
    section: { on: false, axis: 'z', t: 0.5, flip: false },
    measure: { on: false, pts: [] },
  };
  var HILITE = new THREE.Color(0xffb020);
  // As cores do PRC estao em sRGB; o three.js trabalha internamente em espaco linear.
  function srgb(c) { return new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace); }
  function srgbToLinear(v) { return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  // ------------------------------------------------------------------ avisos
  var toastTimer = null;
  function toast(msg, sticky, ms) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    if (!sticky) toastTimer = setTimeout(function () { t.hidden = true; }, ms || 2600);
  }
  function showError(msg) { $('#errorMsg').textContent = msg; $('#error').hidden = false; $('#toast').hidden = true; }
  var hintTimer = null;
  function flashHint(text, keep) {
    var h = $('#hint');
    h.textContent = text; h.classList.toggle('show', !!text);
    clearTimeout(hintTimer);
    if (text && !keep) hintTimer = setTimeout(function () { h.classList.remove('show'); }, 7000);
  }

  // ------------------------------------------------------------------ renderer / cena
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

  // A projecao e sempre ortografica: sem distorcao de perspectiva, as medidas na tela sao comparaveis.
  var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000), controls = null;

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
  var measurePtMat = new THREE.PointsMaterial({ color: 0xffb020, size: 11, sizeAttenuation: false, depthTest: false, transparent: true });

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
        polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: clipPlanes,
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

  // ------------------------------------------------------------------ camera e area livre
  function resize() {
    var w = Math.max(1, view.clientWidth), h = Math.max(1, view.clientHeight);
    if (w === S.w && h === S.h) return;
    S.w = w; S.h = h;
    renderer.setSize(w, h, false);
    layoutChanged();
    S.shift = S.shiftTarget;
    updateProjection();
  }
  // Os paineis flutuam sobre o 3D: o modelo e centralizado na area que sobra entre eles.
  function layoutChanged() {
    var narrow = S.w <= 760, l = 0, r = 0;
    if (!drawer.hidden && !narrow) l = drawer.offsetWidth + 20;
    if (!panel.hidden && !narrow) r = panel.offsetWidth + 20;
    S.shiftTarget = (l - r) / 2;
    S.freeW = Math.max(160, S.w - l - r);
    S.triadX = l ? l + 4 : 8;
    app.classList.toggle('hasPanel', !panel.hidden);
    app.classList.toggle('hasDrawer', !drawer.hidden);
    // sem espaco entre os paineis, o quadro de controles sai da frente
    $('#navpad').classList.toggle('squeezed', !narrow && (l > 0 || r > 0) && S.freeW < 290);
    S.dirty = true;
  }
  function updateProjection() {
    var aspect = S.w / S.h, half = S.viewSize / 2;    // viewSize = extensao visivel na menor dimensao
    var hh = aspect >= 1 ? half : half / aspect, hw = hh * aspect;
    camera.left = -hw; camera.right = hw; camera.top = hh; camera.bottom = -hh;
    if (Math.abs(S.shift) > 0.5) camera.setViewOffset(S.w, S.h, -S.shift, 0, S.w, S.h);
    else if (camera.view && camera.view.enabled) camera.clearViewOffset();
    camera.updateProjectionMatrix();
    S.dirty = true;
  }
  // Extensao visivel para a caixa caber na area livre quando vista na direcao fwd, com margem.
  function fitSize(box, fwd, upHint) {
    var f = fwd.clone().normalize(), up = Math.abs(f.dot(S.worldUp)) > 0.9995 && upHint ? upHint : S.worldUp;
    var right = new V3().crossVectors(f, up).normalize(), u = new V3().crossVectors(right, f);
    var c = box.getCenter(new V3()), d = new V3(), hx = 0, hy = 0;
    for (var i = 0; i < 8; i++) {
      d.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
      hx = Math.max(hx, Math.abs(d.dot(right))); hy = Math.max(hy, Math.abs(d.dot(u)));
    }
    var eps = Math.max(S.radius * 1e-4, 1e-9), freeH = Math.max(120, S.h - 96);
    var scale = Math.min(S.freeW / (2 * Math.max(hx, eps)), freeH / (2 * Math.max(hy, eps))) / 1.16;
    return Math.min(S.w, S.h) / scale;
  }
  var tmp = new V3(), tmp2 = new V3();
  function updateClipRange() {
    camera.getWorldDirection(tmp2);
    var dc = -camera.position.dot(tmp2), R = S.radius * 1.7;    // modelo recentrado na origem
    camera.near = dc - R; camera.far = dc + R;
    camera.updateProjectionMatrix();
  }

  // Leva a camera para (direcao, alvo, extensao visivel), com transicao suave.
  function goTo(o) {
    if (!controls) return;
    var fwd = o.fwd.clone().normalize(), s = fwd.dot(S.worldUp);
    // vistas de topo/base: inclina minimamente para fixar qual lado fica "para cima" na tela
    if (Math.abs(s) > 0.9995 && o.up) fwd.addScaledVector(o.up, -Math.sign(s) * 2e-3).normalize();
    var t0 = controls.target.clone(), t1 = o.target.clone();
    var d0 = camera.position.clone().sub(controls.target).normalize(), d1 = fwd.clone().negate();
    var q = new THREE.Quaternion().setFromUnitVectors(d0, d1), qi = new THREE.Quaternion(), qt = new THREE.Quaternion();
    var e0 = S.viewSize / camera.zoom, e1 = o.size || e0, start = performance.now(), dur = o.instant ? 0 : 380;
    S.viewSize = e0; camera.zoom = 1;
    S.tween = function (now) {
      var k = dur ? Math.min(1, (now - start) / dur) : 1, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      controls.target.lerpVectors(t0, t1, e);
      if (k >= 1) camera.position.copy(t1).addScaledVector(d1, S.camDist);
      else camera.position.copy(d0).applyQuaternion(qt.copy(qi).slerp(q, e)).multiplyScalar(S.camDist).add(controls.target);
      S.viewSize = e0 + (e1 - e0) * e;
      updateProjection();
      controls.update();
      if (k >= 1) S.tween = null;
    };
  }
  function viewDir() { return controls.target.clone().sub(camera.position).normalize(); }
  function fitBox(box, instant) {
    if (!controls || box.isEmpty()) return;
    var fwd = viewDir();
    goTo({ fwd: fwd, target: box.getCenter(new V3()), size: fitSize(box, fwd), instant: instant });
  }
  function fitCurrent() {
    if (!S.root) return;
    var b = S.selected ? nodeBox(S.selected) : new THREE.Box3();
    if (b.isEmpty()) S.pickList.forEach(function (m) { b.union(m.geometry.boundingBox); });
    if (b.isEmpty()) b.copy(S.box);
    fitBox(b);
  }
  // As vistas definem a direcao; o enquadramento e sempre o do modelo inteiro.
  function applyView(i, instant) {
    var v = S.views[i];
    if (!v) return;
    S.viewIndex = i;
    document.querySelectorAll('#viewList .opt').forEach(function (b, k) { b.classList.toggle('on', k === i); });
    var fwd, up;
    if (v.std) { fwd = v.fwd; up = v.up; }
    else { fwd = new V3(v.c2w[6], v.c2w[7], v.c2w[8]); up = new V3(v.c2w[3], v.c2w[4], v.c2w[5]).normalize(); }
    goTo({ fwd: fwd, up: up, target: S.box.getCenter(new V3()), size: fitSize(S.box, fwd, up), instant: instant });
  }
  function viewLabel(v) {
    // vista em perspectiva do PDF: aqui ela vira uma isometrica (mesma direcao, sem perspectiva)
    return !v.std && !v.ortho && /^perspectiva$/i.test(v.name.trim()) ? 'Isométrica' : v.name;
  }

  // Movimentos dos botoes do quadro de controles (a seta indica para onde a camera vai).
  var sph = new THREE.Spherical(), qUp = new THREE.Quaternion(), Y = new V3(0, 1, 0);
  function orbitBy(dTheta, dPhi) {
    qUp.setFromUnitVectors(S.worldUp, Y);
    tmp.copy(camera.position).sub(controls.target).applyQuaternion(qUp);
    sph.setFromVector3(tmp);
    sph.theta += dTheta; sph.phi = clamp(sph.phi + dPhi, 0.002, Math.PI - 0.002);
    tmp.setFromSpherical(sph).applyQuaternion(qUp.invert());
    camera.position.copy(controls.target).add(tmp);
    camera.lookAt(controls.target);
  }
  function navStep(dir, dt) {
    if (!controls) return;
    S.tween = null;
    if (dir === 'in' || dir === 'out') {
      camera.zoom = clamp(camera.zoom * Math.pow(dir === 'in' ? 2.6 : 1 / 2.6, dt), controls.minZoom, controls.maxZoom);
      camera.updateProjectionMatrix();
    } else if (pad.mode === 'rotate') {
      var w = 1.7 * dt;
      orbitBy(dir === 'right' ? w : dir === 'left' ? -w : 0, dir === 'up' ? -w : dir === 'down' ? w : 0);
    } else {
      var d = (S.viewSize / camera.zoom) * 0.75 * dt;
      camera.updateMatrixWorld();
      tmp.setFromMatrixColumn(camera.matrixWorld, dir === 'left' || dir === 'right' ? 0 : 1)
        .multiplyScalar(dir === 'right' || dir === 'up' ? d : -d);
      camera.position.add(tmp); controls.target.add(tmp);
    }
    S.dirty = true;
  }
  var pad = createNavPad($('#navpad'), { onStart: function (dir) { navStep(dir, 0.11); }, onHome: fitCurrent });

  // ------------------------------------------------------------------ modelo
  function clearModel() {
    S.meshNodes.forEach(function (n) {
      n.three.geometry.dispose();
      if (n.edges) n.edges.geometry.dispose();
    });
    while (modelRoot.children.length) modelRoot.remove(modelRoot.children[0]);
    matCache.forEach(function (m) { m.dispose(); }); matCache.clear();
    S.root = null; S.nodes = []; S.meshNodes = []; S.pickList = []; S.selected = null; S.byKey = new Map(); S.modelId = null;
    clearMeasure();
    if (controls) { controls.dispose(); controls = null; }
    $('#tree').textContent = ''; panel.hidden = true;
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
    S.root = sc.root; S.views = sc.views.slice(); S.modelId = sc.modelId; S.fileName = fileName || '';
    var id = 0;
    (function walk(n, parent, key) {
      n.id = id++; n.parent = parent; n.key = key; n.visible = !n.hidden; S.nodes.push(n); S.byKey.set(key, n);
      if (n.mesh) S.meshNodes.push(n);
      var g = 0;
      n.children.forEach(function (c, i) {
        if (!c.name) c.label = c.mesh ? 'Geometria ' + (++g) : (c.kind === 'product' ? 'Conjunto sem nome' : 'Grupo sem nome');
        walk(c, n, key + '.' + i);
      });
    })(S.root, null, '0');
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

    var cx = S.center.x, cy = S.center.y, cz = S.center.z, nm = new THREE.Matrix3(), m4 = new THREE.Matrix4(), tris = 0;
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
          var X = e[0] * a + e[3] * b + e[6] * c, Yn = e[1] * a + e[4] * b + e[7] * c, Z = e[2] * a + e[5] * b + e[8] * c;
          var l = Math.sqrt(X * X + Yn * Yn + Z * Z) || 1;
          no[i] = X / l; no[i + 1] = Yn / l; no[i + 2] = Z / l;
        }
        // alguns exportadores gravam normais que nao acompanham a geometria: nesse caso sao descartadas
        if (normalMismatch(out, no) > 0.02) no = null;
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
    camera.up.copy(S.worldUp); hemi.position.copy(S.worldUp);
    S.camDist = S.radius * 4; S.viewSize = S.radius * 2.4; camera.zoom = 1;
    camera.position.set(1, -1, 0.8).normalize().multiplyScalar(S.camDist); camera.lookAt(0, 0, 0);
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true; controls.dampingFactor = 0.14; controls.screenSpacePanning = true;
    controls.rotateSpeed = 0.9; controls.zoomSpeed = 1.1; controls.zoomToCursor = true;
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.minZoom = 0.02; controls.maxZoom = 2000;
    controls.addEventListener('change', function () { S.dirty = true; });
    controls.addEventListener('start', function () { S.tween = null; });

    // vistas: as do PDF ou, na falta, um conjunto padrao
    if (!S.views.length) S.views = standardViews();
    var list = $('#viewList'); list.textContent = '';
    S.views.forEach(function (v, i) {
      var b = document.createElement('button'); b.className = 'opt'; b.textContent = viewLabel(v);
      b.addEventListener('click', function () { applyView(i); closePops(); });
      list.appendChild(b);
    });

    S.section.on = false; $('#btnSection').setAttribute('aria-pressed', 'false'); $('#secPanel').hidden = true; updateSection();
    setMeasure(false);
    setMode(S.mode);
    applyVisibility();
    buildTree();
    layoutChanged(); S.shift = S.shiftTarget; updateProjection();
    applyView(0, true);
    $('#empty').hidden = true; $('#error').hidden = true;
    $('#docTitle').textContent = sc.info.title || fileName || 'ID3D';
    $('#docSub').textContent = [sc.info.subject, fileName].filter(Boolean).join(' · ') || 'Visualizador de PDF 3D';
    document.title = (sc.info.title || fileName || 'Modelo') + ' – ID3D';
    $('#stats').textContent = S.meshNodes.length.toLocaleString('pt-BR') + ' peças · ' + Math.round(tris).toLocaleString('pt-BR') + ' triângulos';
    $('#search').value = ''; runSearch();
    att.definirModelo(S.modelId);
    flashHint(coarse
      ? 'Um dedo: girar · Dois dedos: mover e ampliar · Toque: selecionar · Dois toques: centralizar'
      : 'Arrastar: girar · Botão direito: mover · Rolagem: zoom · Clique: selecionar · Duplo clique: centralizar');
    S.dirty = true;
  }

  function standardViews() {
    var z = S.worldUp.clone(), x = Math.abs(z.x) > 0.5 ? new V3(0, 1, 0) : new V3(1, 0, 0), y = new V3().crossVectors(z, x).normalize();
    function v(a, b, c) { return new V3().addScaledVector(x, a).addScaledVector(y, b).addScaledVector(z, c).normalize(); }
    return [
      { std: 1, name: 'Isométrica', fwd: v(-1, 1, -0.75), up: z },
      { std: 1, name: 'Frente', fwd: v(0, 1, 0), up: z },
      { std: 1, name: 'Trás', fwd: v(0, -1, 0), up: z },
      { std: 1, name: 'Topo', fwd: v(0, 0, -1), up: v(0, 1, 0) },
      { std: 1, name: 'Base', fwd: v(0, 0, 1), up: v(0, 1, 0) },
      { std: 1, name: 'Direita', fwd: v(-1, 0, 0), up: z },
      { std: 1, name: 'Esquerda', fwd: v(1, 0, 0), up: z },
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
    S.mode = mode;
    document.querySelectorAll('#modeList .opt').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === mode); });
    if (mode === 'edges' || mode === 'wire') ensureEdges();
    matCache.forEach(styleMaterial);
    updateEdgeColor();
    if (S.root) applyVisibility();
  }
  function updateEdgeColor() {
    var dark = document.documentElement.dataset.theme === 'dark';
    edgeMat.color.set(S.mode === 'wire' ? (dark ? 0xc9d3e2 : 0x27303d) : 0x12161c);
    S.dirty = true;
  }
  function subtree(n, fn) { fn(n); for (var i = 0; i < n.children.length; i++) subtree(n.children[i], fn); }
  function showAll() { if (!S.root) return; S.nodes.forEach(function (n) { n.visible = true; }); applyVisibility(); }
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

  // ------------------------------------------------------------------ selecao e painel da peca
  function label(n) { return n.name || n.label || 'Sem nome'; }
  function pathOf(n) { var path = []; for (var p = n.parent; p; p = p.parent) path.unshift(label(p)); return path; }
  function fmt(v) {
    var a = Math.abs(v);
    return v.toLocaleString('pt-BR', { maximumFractionDigits: a >= 1000 ? 1 : a >= 10 ? 2 : 3, minimumFractionDigits: 0 });
  }
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
    updatePanel();
    S.dirty = true;
  }
  function updatePanel() {
    var n = S.selected;
    panel.hidden = !n;
    att.definirParte(n ? { chave: n.key, caminho: pathOf(n).concat(label(n)).join(' › ') } : null);
    layoutChanged();
    if (!n) return;
    $('#infoName').textContent = label(n);
    $('#infoPath').textContent = pathOf(n).join(' › ');
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
    $('.panelBody').scrollTop = 0;
  }

  // ------------------------------------------------------------------ anexos
  var att = createAttachments({
    toast: toast,
    onChange: refreshBadges,
    // ao abrir um anexo pela lista geral, a peca dona dele fica selecionada no modelo
    aoAbrir: function (a) { var n = S.byKey.get(a.parte); if (n && n !== S.selected) select(n, true); },
  });
  function updateBadge(n) {
    var b = n.badgeEl;
    if (!b) return;
    var c = att.contagem(n.key);
    if (c.total) {
      b.hidden = false; b.className = 'badge' + (c.verificados === c.total ? ' ok' : '');
      b.innerHTML = icon('clip'); b.appendChild(document.createTextNode(String(c.total)));
      b.title = c.verificados + ' de ' + c.total + ' anexo(s) verificado(s)';
    } else if (att.temNaSubarvore(n.key)) {
      b.hidden = false; b.className = 'badge dot'; b.textContent = ''; b.title = 'Há anexos em itens deste grupo';
    } else b.hidden = true;
  }
  function refreshBadges() { S.nodes.forEach(updateBadge); }

  // ------------------------------------------------------------------ arvore
  function makeRow(n) {
    var wrap = document.createElement('div'); wrap.className = 'tn';
    var row = document.createElement('div'); row.className = 'trow'; row.title = label(n);
    var tw = document.createElement('button'); tw.className = 'tw' + (n.children.length ? '' : ' leaf'); tw.textContent = '▸'; tw.tabIndex = -1;
    tw.setAttribute('aria-label', 'Expandir ou recolher');
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = n.visible; cb.title = 'Mostrar / ocultar';
    var nm = document.createElement('span'); nm.className = 'nm' + (n.name ? '' : ' dim'); nm.textContent = label(n);
    row.appendChild(tw); row.appendChild(cb);
    if (n.mesh) {
      var sw = document.createElement('span'); sw.className = 'sw3d';
      sw.style.background = n.vertexColors ? 'linear-gradient(135deg,#e5484d,#3e7bfa)' : 'rgb(' + n.color.map(function (v) { return Math.round(v * 255); }).join(',') + ')';
      row.appendChild(sw);
    }
    row.appendChild(nm);
    var badge = document.createElement('span'); badge.hidden = true; row.appendChild(badge);
    var kids = document.createElement('div'); kids.className = 'kids'; kids.hidden = true;
    wrap.appendChild(row); wrap.appendChild(kids);
    n.rowEl = row; n.kidsEl = kids; n.twEl = tw; n.cb = cb; n.badgeEl = badge;
    updateBadge(n);
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
    S.nodes.forEach(function (n) { n.rowEl = n.kidsEl = n.twEl = n.cb = n.badgeEl = null; n.kidsDone = false; });
    t.appendChild(makeRow(S.root));
    expand(S.root, true);
    if (S.root.children.length <= 12) S.root.children.forEach(function (c) { if (c.kind === 'product') expand(c, true); });
  }
  function revealInTree(n) {
    var chain = []; for (var p = n.parent; p; p = p.parent) chain.unshift(p);
    chain.forEach(function (p) { expand(p, true); });
    if (n.rowEl && !drawer.hidden && !$('#tabTree').hidden && !$('#tree').hidden) n.rowEl.scrollIntoView({ block: 'nearest' });
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
      var sm = document.createElement('small'); sm.textContent = pathOf(n).join(' › '); d.appendChild(sm);
      (function (node) {
        d.addEventListener('click', function () { select(node, true); var b = nodeBox(node); if (!b.isEmpty()) fitBox(b); });
      })(n);
      res.appendChild(d);
    }
    if (!found) { var e = document.createElement('div'); e.className = 'vazio'; e.textContent = 'Nenhum componente encontrado.'; res.appendChild(e); }
  }

  // ------------------------------------------------------------------ toque, clique e picking
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
    var pos = hit.object.geometry.attributes.position, r = canvas.getBoundingClientRect(), best = null, bd = coarse ? 22 : 12;
    [hit.face.a, hit.face.b, hit.face.c].forEach(function (i) {
      var v = new V3().fromBufferAttribute(pos, i), s = v.clone().project(camera);
      var d = Math.hypot((s.x + 1) / 2 * r.width + r.left - ev.clientX, (1 - s.y) / 2 * r.height + r.top - ev.clientY);
      if (d < bd) { bd = d; best = v; }
    });
    return best || hit.point.clone();
  }
  // Um "toque" e um ponteiro que desce e sobe quase no mesmo lugar, sem outro dedo na tela.
  var pointers = new Set(), down = null, lastTap = null;
  canvas.addEventListener('pointerdown', function (e) {
    pointers.add(e.pointerId);
    closePops();
    down = pointers.size === 1 && !e.button ? { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId } : null;
  });
  function release(e) { pointers.delete(e.pointerId); }
  canvas.addEventListener('pointercancel', function (e) { release(e); down = null; });
  canvas.addEventListener('pointerup', function (e) {
    release(e);
    var d = down; down = null;
    if (!d || d.id !== e.pointerId) return;
    var slack = e.pointerType === 'mouse' ? 4 : 12, now = performance.now();
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > slack || now - d.t > 700) return;
    var hit = pick(e);
    var dbl = lastTap && now - lastTap.t < 380 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 28;
    lastTap = dbl ? null : { x: e.clientX, y: e.clientY, t: now };
    if (S.measure.on) { if (hit) addMeasurePoint(snapVertex(hit, e)); return; }
    if (dbl) {
      // dois toques: centraliza a orbita no ponto, mantendo a direcao de visao
      if (hit && controls) goTo({ fwd: viewDir(), target: hit.point.clone() });
      return;
    }
    if (!hit) { select(null); return; }
    var n = hit.object.userData.node;
    while (n && !n.name && n.parent) n = n.parent;       // seleciona o componente nomeado mais proximo
    if (n !== S.selected) select(n, true);
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
    measureHint(); S.dirty = true;
  }
  function measureHint() {
    if (!S.measure.on) { flashHint(''); return; }
    flashHint(S.measure.pts.length === 1 ? 'Medir: toque no segundo ponto' : 'Medir: toque em dois pontos do modelo (encaixa em vértices próximos)', true);
  }
  function setMeasure(on) {
    S.measure.on = on; $('#btnMeasure').setAttribute('aria-pressed', String(on)); view.classList.toggle('measuring', on);
    if (!on) clearMeasure();
    measureHint();
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
  function render() {
    camera.updateMatrixWorld();
    updateClipRange();
    tmp.set(-0.45, 0.6, 1).normalize().transformDirection(camera.matrixWorld);
    head.position.copy(camera.position).addScaledVector(tmp, S.camDist);
    if (controls) head.target.position.copy(controls.target);
    renderer.setViewport(0, 0, S.w, S.h);
    renderer.clear();
    renderer.render(scene, camera);
    // triade
    var sz = Math.min(104, Math.round(Math.min(S.w, S.h) * 0.22));
    if (S.triadX + sz < S.w * 0.7) {
      renderer.clearDepth();
      renderer.setViewport(S.triadX, 8, sz, sz);
      camera.getWorldDirection(tmp2);
      triadCam.position.copy(tmp2).multiplyScalar(-6); triadCam.quaternion.copy(camera.quaternion); triadCam.updateMatrixWorld();
      renderer.render(triadScene, triadCam);
    }
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
    var dt = Math.min(0.1, (now - (S.last || now)) / 1000); S.last = now;
    resize();
    if (Math.abs(S.shiftTarget - S.shift) > 0.5) { S.shift += (S.shiftTarget - S.shift) * Math.min(1, dt * 12 + 0.02); updateProjection(); }
    else if (S.shift !== S.shiftTarget) { S.shift = S.shiftTarget; updateProjection(); }
    if (pad.active) navStep(pad.active.dir, dt);
    if (S.tween) S.tween(now);
    else if (controls) controls.update();
    if (S.dirty) { S.dirty = false; render(); }
  }

  // ------------------------------------------------------------------ arquivos e tela inicial
  function loadBytes(u8, name) {
    var sc;
    try { sc = load(u8); }
    catch (e) { if (window.console) console.error(e); showError(String(e && e.message || e)); return false; }
    try { buildModel(sc, name); }
    catch (e2) { if (window.console) console.error(e2); showError('O modelo foi lido, mas não foi possível exibi-lo neste navegador.'); return false; }
    return !!S.root;
  }
  function loadFile(f) {
    if (!f) return;
    var rd = new FileReader();
    rd.onload = function () { loadBytes(new Uint8Array(rd.result), f.name); };
    rd.onerror = function () { showError('Não foi possível ler o arquivo.'); };
    rd.readAsArrayBuffer(f);
  }
  function showStart() {
    $('#btnCloseEmpty').hidden = !S.root;
    $('#empty').hidden = false;
    closePops();
    if (!att.disponivel) { $('#modelBox').hidden = true; return; }
    api.listarModelos().then(function (modelos) {
      var box = $('#modelList'); box.textContent = '';
      $('#modelBox').hidden = !modelos.length;
      modelos.forEach(function (m) {
        var b = document.createElement('button'); b.className = 'model'; b.innerHTML = icon('cube');
        var main = document.createElement('span'); main.className = 'attMain';
        var nome = document.createElement('span'); nome.className = 'attName'; nome.textContent = m.nome;
        var meta = document.createElement('span'); meta.className = 'attMeta';
        meta.textContent = (m.tamanho / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB' + (m.exemplo ? ' · exemplo' : '');
        main.appendChild(nome); main.appendChild(meta); b.appendChild(main);
        b.addEventListener('click', function () {
          toast('Carregando ' + m.nome + '…', true);
          api.baixarModelo(m.url).then(function (u8) { $('#toast').hidden = true; loadBytes(u8, m.nome); })
            .catch(function (e) { showError(e.message); });
        });
        box.appendChild(b);
      });
    }).catch(function () { $('#modelBox').hidden = true; });
  }
  $('#file').addEventListener('change', function () { loadFile(this.files[0]); this.value = ''; });
  $('#btnPick').addEventListener('click', function () { $('#file').click(); });
  $('#btnCloseEmpty').addEventListener('click', function () { $('#empty').hidden = true; });
  $('#btnErrClose').addEventListener('click', function () { $('#error').hidden = true; });

  var dragN = 0;
  window.addEventListener('dragenter', function (e) { e.preventDefault(); dragN++; $('#drop').hidden = false; });
  window.addEventListener('dragleave', function () { if (--dragN <= 0) { dragN = 0; $('#drop').hidden = true; } });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) {
    e.preventDefault(); dragN = 0; $('#drop').hidden = true;
    var files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length || att.revisando || att.fotografando) return;
    // solto sobre o painel da peca: vira anexo; em qualquer outro lugar: abre como modelo
    if (e.target.closest && e.target.closest('#panel') && S.selected && att.disponivel) att.enviar(files);
    else loadFile(files[0]);
  });

  // ------------------------------------------------------------------ menus e barras
  var POPS = [['#btnViews', '#popViews'], ['#btnDisplay', '#popDisplay'], ['#btnMore', '#popMore']];
  function closePops() {
    POPS.forEach(function (p) { $(p[1]).hidden = true; $(p[0]).setAttribute('aria-expanded', 'false'); });
  }
  POPS.forEach(function (p) {
    $(p[0]).addEventListener('click', function (e) {
      e.stopPropagation();
      var open = $(p[1]).hidden;
      closePops();
      if (open) {
        $(p[1]).hidden = false; this.setAttribute('aria-expanded', 'true');
        // alinha o menu com o botao que o abriu
        var r = this.getBoundingClientRect(), w = $(p[1]).offsetWidth;
        $(p[1]).style.right = Math.max(12, Math.min(window.innerWidth - r.right, window.innerWidth - w - 12)) + 'px';
      }
    });
    $(p[1]).addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  });
  document.addEventListener('pointerdown', function (e) { if (!e.target.closest('.pop')) closePops(); });

  function setDrawer(open) {
    drawer.hidden = !open; $('#btnDrawer').setAttribute('aria-pressed', String(open));
    prefs.set('drawer', open ? '1' : '0');
    layoutChanged();
    if (open && S.selected) revealInTree(S.selected);
  }
  $('#btnDrawer').addEventListener('click', function () { setDrawer(drawer.hidden); });
  document.querySelectorAll('.tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.tabs button').forEach(function (o) { o.classList.toggle('on', o === b); });
      $('#tabTree').hidden = b.dataset.tab !== 'tree'; $('#tabFiles').hidden = b.dataset.tab !== 'files';
    });
  });
  $('#search').addEventListener('input', runSearch);

  document.querySelectorAll('#modeList .opt').forEach(function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.mode); closePops(); });
  });
  $('#btnFit').addEventListener('click', fitCurrent);
  $('#btnSection').addEventListener('click', function () {
    S.section.on = !S.section.on; this.setAttribute('aria-pressed', String(S.section.on)); $('#secPanel').hidden = !S.section.on; updateSection();
  });
  $('#segAxis').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    S.section.axis = b.dataset.v;
    this.querySelectorAll('button').forEach(function (o) { o.classList.toggle('on', o === b); });
    updateSection();
  });
  $('#secPos').addEventListener('input', function () { S.section.t = this.value / 1000; updateSection(); });
  $('#secFlip').addEventListener('click', function () { S.section.flip = !S.section.flip; this.setAttribute('aria-pressed', String(S.section.flip)); updateSection(); });
  $('#btnMeasure').addEventListener('click', function () { setMeasure(!S.measure.on); });

  $('#btnOpen').addEventListener('click', showStart);
  $('#btnShowAll').addEventListener('click', function () { showAll(); closePops(); });
  function setPad(on) { $('#navpad').hidden = !on; $('#btnPad').setAttribute('aria-checked', String(on)); prefs.set('pad', on ? '1' : '0'); }
  $('#btnPad').addEventListener('click', function () { setPad($('#navpad').hidden); });
  function setTheme(t) {
    document.documentElement.dataset.theme = t; $('#btnTheme').setAttribute('aria-checked', String(t === 'dark'));
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = t === 'dark' ? '#171b22' : '#eef1f6';
    prefs.set('theme', t); updateEdgeColor();
  }
  $('#btnTheme').addEventListener('click', function () { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); });
  if (!document.documentElement.requestFullscreen) $('#btnFull').hidden = true;
  $('#btnFull').addEventListener('click', function () {
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(function () { toast('Este navegador não permitiu a tela cheia.'); });
    closePops();
  });

  $('#btnClosePanel').addEventListener('click', function () { select(null); });
  $('#btnZoomSel').addEventListener('click', fitCurrent);
  $('#btnIsolate').addEventListener('click', function () { if (S.selected) isolate(S.selected); });
  $('#btnHide').addEventListener('click', function () { if (S.selected) { S.selected.visible = false; applyVisibility(); } });

  window.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if (att.fotografando) { if (k === 'escape') att.fecharCamera(); return; }
    if (att.revisando) {
      if (k === 'escape') att.fecharRevisao();
      else if (!/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { if (k === 'arrowleft') att.passo(-1); else if (k === 'arrowright') att.passo(1); }
      return;
    }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'checkbox' && e.target.type !== 'range') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'f') fitCurrent();
    else if (k === 'm') setMeasure(!S.measure.on);
    else if (k === 'h' && S.selected) { S.selected.visible = false; applyVisibility(); }
    else if (k === 'i' && S.selected) isolate(S.selected);
    else if (k === 'a') showAll();
    else if (k === 'escape') {
      if (!$('#popViews').hidden || !$('#popDisplay').hidden || !$('#popMore').hidden) closePops();
      else if (S.measure.on) setMeasure(false);
      else select(null);
    }
  });

  // ------------------------------------------------------------------ inicio
  setTheme(prefs.get('theme', 'light') === 'dark' ? 'dark' : 'light');
  setPad(prefs.get('pad', '1') !== '0');
  drawer.hidden = !(prefs.get('drawer', window.innerWidth >= 1400 ? '1' : '0') === '1' && window.innerWidth > 760);
  $('#btnDrawer').setAttribute('aria-pressed', String(!drawer.hidden));
  resize();
  requestAnimationFrame(frame);

  var emb = document.getElementById('embedded-pdf');
  if (emb) {
    var bin = atob(emb.textContent.trim()), u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    if (!loadBytes(u8, emb.dataset.name || '')) showStart();
  } else showStart();

  // o servidor (anexos e lista de modelos) e opcional: sem ele o visualizador segue funcionando
  att.iniciar().then(function (ok) {
    if (!ok) return;
    if (S.modelId) att.definirModelo(S.modelId);
    if (!$('#empty').hidden) showStart();
  });

  // acesso para depuracao no console
  window.ID3D = { state: S, loadBytes: loadBytes, applyView: applyView, fit: fitCurrent, select: select, camera: camera };
})();
