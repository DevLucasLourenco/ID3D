// Camera do aparelho, para fotografar e anexar na hora.
//
// Ha dois caminhos, conforme o que o navegador libera:
//  - 'interna': a camera abre dentro do ID3D (getUserMedia). O navegador so oferece isso em
//    endereco seguro: https, ou localhost na propria maquina do servidor.
//  - 'nativa': o ID3D chama o aplicativo de camera do aparelho (<input capture>), o que
//    funciona em tablets e celulares mesmo por http na rede local.

function $(id) { return document.getElementById(id); }
function dois(n) { return String(n).padStart(2, '0'); }

export function modoDeCamera(nav, doc) {
  if (nav && nav.mediaDevices && typeof nav.mediaDevices.getUserMedia === 'function') return 'interna';
  if (doc && 'capture' in doc.createElement('input')) return 'nativa';
  return 'indisponivel';
}

var EXTENSAO = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };

// "Foto 2026-11-13 14.30.05.jpg": ordena por data e nao depende do nome que o aparelho deu.
export function nomeDaFoto(quando, tipo, nomeOriginal) {
  var d = quando instanceof Date && !isNaN(quando) ? quando : new Date();
  var ext = EXTENSAO[tipo];
  if (!ext) {
    var m = /\.([A-Za-z0-9]{1,5})$/.exec(nomeOriginal || '');
    ext = m ? m[1].toLowerCase() : 'jpg';
  }
  return 'Foto ' + d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate()) + ' ' +
    dois(d.getHours()) + '.' + dois(d.getMinutes()) + '.' + dois(d.getSeconds()) + '.' + ext;
}

export function motivoDaFalha(e) {
  var n = e && e.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') {
    return 'O uso da câmera está bloqueado para o ID3D. Libere a permissão de câmera nas configurações do navegador e tente de novo.';
  }
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Nenhuma câmera foi encontrada neste aparelho.';
  if (n === 'NotReadableError' || n === 'AbortError') return 'A câmera está em uso por outro aplicativo ou não respondeu.';
  return 'Não foi possível abrir a câmera deste aparelho.';
}

// opts.aoUsar(file) -> Promise<boolean>: true quando a foto foi anexada. Em caso de falha a
// foto continua na tela, para o usuario tentar de novo sem precisar fotografar outra vez.
export function createCamera(opts) {
  var C = { aberta: false, estado: '', stream: null, foto: null, url: null, cameras: [], atual: -1, pedido: 0 };
  var tela = $('camera'), video = $('camVideo'), shot = $('camShot'), msg = $('camMsg');

  function estado(nome, texto) {
    C.estado = nome;
    var foto = nome === 'foto' || nome === 'enviando';
    video.hidden = nome !== 'ao-vivo';
    shot.hidden = !foto;
    msg.hidden = nome !== 'abrindo' && nome !== 'erro';
    msg.textContent = nome === 'abrindo' ? 'Abrindo a câmera…' : (texto || '');
    $('camShoot').hidden = foto || nome === 'erro';
    $('camShoot').disabled = nome !== 'ao-vivo';
    $('camSwitch').hidden = nome !== 'ao-vivo' || C.cameras.length < 2;
    $('camRetry').hidden = !foto;
    $('camUse').hidden = !foto;
    $('camRetry').disabled = $('camUse').disabled = $('camClose').disabled = nome === 'enviando';
    $('camUse').querySelector('span').textContent = nome === 'enviando' ? 'Enviando…' : 'Usar foto';
  }

  function desligar() {
    C.pedido++;                              // invalida um pedido de camera ainda sem resposta
    if (C.stream) C.stream.getTracks().forEach(function (t) { t.onended = null; t.stop(); });
    C.stream = null;
    video.srcObject = null;
  }

  async function listarCameras(trilha, pedida) {
    try {
      var todas = await navigator.mediaDevices.enumerateDevices();
      C.cameras = todas.filter(function (d) { return d.kind === 'videoinput' && d.deviceId; }).map(function (d) { return d.deviceId; });
    } catch { C.cameras = []; }
    var em = trilha && trilha.getSettings ? trilha.getSettings().deviceId : null;
    C.atual = C.cameras.indexOf(em);
    if (C.atual < 0 && pedida) C.atual = C.cameras.indexOf(pedida);
  }

  async function ligar(deviceId) {
    desligar();
    var pedido = C.pedido;
    estado('abrindo');
    // de preferencia a camera traseira; "ideal" deixa o navegador escolher outra se nao houver
    var v = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } };
    v.width = { ideal: 1920 }; v.height = { ideal: 1080 };
    var s;
    try { s = await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); }
    catch (e) {
      if (pedido === C.pedido && C.aberta) estado('erro', motivoDaFalha(e));
      return;
    }
    if (pedido !== C.pedido || !C.aberta) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
    C.stream = s;
    var trilha = s.getVideoTracks()[0];
    if (trilha) trilha.onended = function () { if (C.stream === s) { desligar(); if (!C.foto) estado('erro', 'A câmera foi desconectada ou parou de responder.'); } };
    video.srcObject = s;
    try { await video.play(); } catch { /* o autoplay cuida disso */ }
    await listarCameras(trilha, deviceId);
    if (pedido !== C.pedido || !C.aberta) return;
    if (!C.foto) { estado('ao-vivo'); $('camShoot').focus(); }
  }

  function descartar() {
    if (C.url) URL.revokeObjectURL(C.url);
    C.url = null; C.foto = null;
    shot.removeAttribute('src');
  }

  function fotografar() {
    if (C.estado !== 'ao-vivo' || !video.videoWidth) return;
    var c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    $('camShoot').disabled = true;
    c.toBlob(function (blob) {
      if (!C.aberta) return;
      if (!blob) { opts.toast('Não foi possível registrar a foto. Tente de novo.', false, 5000); estado('ao-vivo'); return; }
      descartar();
      C.foto = new File([blob], nomeDaFoto(new Date(), 'image/jpeg'), { type: 'image/jpeg' });
      C.url = URL.createObjectURL(blob);
      shot.src = C.url;
      estado('foto');
      $('camUse').focus();
    }, 'image/jpeg', 0.92);
  }

  function outra() {
    descartar();
    if (C.stream) { estado('ao-vivo'); $('camShoot').focus(); } else ligar();
  }

  async function usar() {
    if (C.estado !== 'foto' || !C.foto) return;
    estado('enviando');
    var ok;
    try { ok = await opts.aoUsar(C.foto); } catch { ok = false; }
    if (!C.aberta) return;
    estado('foto');
    if (ok) fechar();
  }

  function abrir(legenda) {
    if (C.aberta) return;
    C.aberta = true;
    $('camPart').textContent = legenda || '';
    tela.hidden = false;
    ligar();
  }

  function fechar() {
    if (!C.aberta || C.estado === 'enviando') return;
    C.aberta = false;
    desligar();
    descartar();
    tela.hidden = true;
  }

  $('camShoot').addEventListener('click', fotografar);
  $('camRetry').addEventListener('click', outra);
  $('camUse').addEventListener('click', usar);
  $('camClose').addEventListener('click', fechar);
  $('camSwitch').addEventListener('click', function () {
    if (C.cameras.length < 2) return;
    ligar(C.cameras[(C.atual + 1) % C.cameras.length]);
  });
  // a camera nao fica ligada com o ID3D em segundo plano
  document.addEventListener('visibilitychange', function () {
    if (!C.aberta) return;
    if (document.hidden) desligar();
    else if (!C.stream && !C.foto) ligar();
  });
  window.addEventListener('pagehide', desligar);

  return {
    get aberta() { return C.aberta; },
    abrir: abrir,
    fechar: fechar,
  };
}
