// Quadro de controles de navegacao: setas (girar ou mover), zoom e enquadrar.
// Segurar um botao repete o movimento; quem aplica o movimento na camera e o chamador.

export function createNavPad(root, handlers) {
  var pad = { mode: 'rotate', active: null };

  root.querySelectorAll('#padMode button').forEach(function (b) {
    b.addEventListener('click', function () {
      pad.mode = b.dataset.v;
      root.querySelectorAll('#padMode button').forEach(function (o) {
        o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', String(o === b));
      });
    });
  });

  function stop(e) {
    if (!pad.active) return;
    if (e && pad.active.id !== e.pointerId) return;
    pad.active.el.classList.remove('held');
    pad.active = null;
  }
  root.querySelectorAll('[data-nav]').forEach(function (b) {
    b.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      e.preventDefault();
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* ponteiro ja liberado */ }
      pad.active = { dir: b.dataset.nav, id: e.pointerId, el: b };
      b.classList.add('held');
      handlers.onStart(b.dataset.nav);          // um toque rapido ja move um passo
    });
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('lostpointercapture', stop);
    b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    // teclado: Enter/Espaco aplicam um passo
    b.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handlers.onStart(b.dataset.nav); }
    });
  });
  root.querySelector('#padHome').addEventListener('click', handlers.onHome);
  window.addEventListener('blur', function () { stop(); });

  return pad;
}
