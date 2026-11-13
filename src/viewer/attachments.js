// Anexos das pecas: lista no painel da peca selecionada, lista geral na gaveta e a tela
// de revisao (ver o arquivo, anotar, marcar como verificado, excluir).

import * as api from './api.js';
import { icon } from './icons.js';

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function $(id) { return document.getElementById(id); }

function tamanho(bytes) {
  if (bytes < 1024) return bytes + ' B';
  var kb = bytes / 1024;
  if (kb < 1024) return kb.toLocaleString('pt-BR', { maximumFractionDigits: kb < 10 ? 1 : 0 }) + ' KB';
  return (kb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' MB';
}
function dataHora(iso) {
  var d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
// Como pre-visualizar, pelo tipo informado no envio (e o mesmo criterio que o servidor usa
// para decidir o que pode ser exibido dentro da pagina).
function especie(a) {
  var t = a.tipo || '';
  if (/^image\/(png|jpeg|gif|webp|bmp)$/.test(t)) return 'imagem';
  if (t === 'application/pdf') return 'pdf';
  if (t === 'text/plain') return 'texto';
  if (/^video\/(mp4|webm)$/.test(t)) return 'video';
  if (/^audio\//.test(t)) return 'audio';
  return 'outro';
}

export function createAttachments(opts) {
  var A = { disponivel: false, limiteMB: 100, modelo: null, lista: [], parte: null, filtro: 'todos', rev: null, enviando: false };

  function daParte(chave) { return A.lista.filter(function (a) { return a.parte === chave; }); }
  function achar(id) { return A.lista.find(function (a) { return a.id === id; }); }
  function mudou() { desenharPainel(); desenharGaveta(); opts.onChange(); }

  // ---------------------------------------------------------------- linha de um anexo
  function selo(a) {
    var ok = a.status === 'verificado', s = el('span', 'status ' + (ok ? 'ok' : 'pend'));
    s.innerHTML = icon(ok ? 'check' : 'clock');
    s.appendChild(el('span', null, ok ? 'Verificado' : 'Pendente'));
    return s;
  }
  function linha(a, contexto, comCaminho) {
    var b = el('button', 'att');
    b.type = 'button';
    var thumb = el('span', 'thumb');
    if (especie(a) === 'imagem') {
      var img = el('img'); img.loading = 'lazy'; img.alt = ''; img.src = api.urlDoAnexo(A.modelo, a.id);
      thumb.appendChild(img);
    } else thumb.innerHTML = icon('file');
    var main = el('span', 'attMain');
    main.appendChild(el('span', 'attName', a.nome));
    main.appendChild(el('span', 'attMeta', (comCaminho && a.caminho ? a.caminho + ' · ' : '') + tamanho(a.tamanho) + ' · ' + dataHora(a.criadoEm)));
    b.appendChild(thumb); b.appendChild(main); b.appendChild(selo(a));
    b.addEventListener('click', function () { if (opts.aoAbrir) opts.aoAbrir(a); abrirRevisao(a.id, contexto()); });
    return b;
  }

  // ---------------------------------------------------------------- painel da peca
  function desenharPainel() {
    var lista = $('attList'), nota = $('attNote'), resumo = $('attSummary'), botao = $('btnAttach');
    lista.textContent = '';
    botao.disabled = !A.disponivel || !A.parte || A.enviando;
    if (!A.disponivel) {
      nota.hidden = false;
      nota.textContent = 'Para anexar arquivos, abra o ID3D pelo servidor (npm start). Neste modo o visualizador funciona sem anexos.';
      resumo.textContent = '';
      return;
    }
    nota.hidden = true;
    if (!A.parte) { resumo.textContent = ''; return; }
    var itens = daParte(A.parte.chave), ok = itens.filter(function (a) { return a.status === 'verificado'; }).length;
    resumo.textContent = itens.length ? '· ' + ok + ' de ' + itens.length + (itens.length === 1 ? ' verificado' : ' verificados') : '';
    if (!itens.length) { lista.appendChild(el('div', 'vazio', 'Nenhum arquivo anexado a esta peça.')); return; }
    itens.forEach(function (a) {
      lista.appendChild(linha(a, function () { return daParte(A.parte.chave).map(function (x) { return x.id; }); }, false));
    });
  }

  // ---------------------------------------------------------------- lista geral (gaveta)
  function filtrada() {
    return A.lista.filter(function (a) { return A.filtro === 'todos' || a.status === A.filtro; });
  }
  function desenharGaveta() {
    var lista = $('filesList'), conta = $('filesCount');
    var pendentes = A.lista.filter(function (a) { return a.status !== 'verificado'; }).length;
    conta.hidden = !A.lista.length;
    conta.textContent = pendentes ? String(pendentes) : '✓';
    conta.classList.toggle('ok', !pendentes);
    conta.title = pendentes ? pendentes + ' pendente(s) de verificação' : 'Todos verificados';
    lista.textContent = '';
    if (!A.disponivel) { lista.appendChild(el('div', 'vazio', 'Anexos indisponíveis: abra o ID3D pelo servidor (npm start).')); return; }
    var itens = filtrada();
    if (!itens.length) {
      lista.appendChild(el('div', 'vazio', A.lista.length ? 'Nenhum anexo pendente de verificação.' : 'Nenhum arquivo anexado neste modelo. Selecione uma peça e toque em Anexar.'));
      return;
    }
    itens.forEach(function (a) {
      lista.appendChild(linha(a, function () { return filtrada().map(function (x) { return x.id; }); }, true));
    });
  }
  document.querySelectorAll('#filesFilter button').forEach(function (b) {
    b.addEventListener('click', function () {
      A.filtro = b.dataset.v;
      document.querySelectorAll('#filesFilter button').forEach(function (o) { o.classList.toggle('on', o === b); });
      desenharGaveta();
    });
  });

  // ---------------------------------------------------------------- envio
  async function enviar(files) {
    if (!A.disponivel || !A.parte || !files.length || A.enviando) return;
    var parte = A.parte, lista = Array.prototype.slice.call(files), falhas = [];
    A.enviando = true; desenharPainel();
    for (var i = 0; i < lista.length; i++) {
      var f = lista[i];
      opts.toast('Enviando ' + (i + 1) + ' de ' + lista.length + '…', true);
      if (f.size > A.limiteMB * 1048576) { falhas.push(f.name + ': maior que ' + A.limiteMB + ' MB'); continue; }
      try { A.lista.push(await api.enviarAnexo(A.modelo, parte.chave, parte.caminho, f)); }
      catch (e) { falhas.push(f.name + ': ' + e.message); }
    }
    A.enviando = false;
    var enviados = lista.length - falhas.length;
    if (falhas.length) opts.toast('Não foi possível anexar: ' + falhas.join('; '), false, 7000);
    else opts.toast(enviados === 1 ? 'Arquivo anexado.' : enviados + ' arquivos anexados.');
    mudou();
  }
  $('btnAttach').addEventListener('click', function () { $('attFile').click(); });
  $('attFile').addEventListener('change', function () { var fs = this.files; enviar(fs).finally(() => { this.value = ''; }); });

  // ---------------------------------------------------------------- revisao
  function abrirRevisao(id, ids) {
    A.rev = { ids: ids, i: Math.max(0, ids.indexOf(id)) };
    $('review').hidden = false;
    desenharRevisao();
  }
  function fecharRevisao() {
    if (!A.rev) return;
    salvarObservacao();
    A.rev = null;
    $('review').hidden = true;
    $('revBody').textContent = '';        // interrompe videos e libera a memoria da pre-visualizacao
  }
  function atual() { return A.rev ? achar(A.rev.ids[A.rev.i]) : null; }

  function desenharSituacao(a) {
    var ok = a.status === 'verificado', st = $('revStatus'), b = $('revVerify');
    st.className = 'status ' + (ok ? 'ok' : 'pend');
    st.innerHTML = icon(ok ? 'check' : 'clock');
    st.appendChild(el('span', null, ok ? 'Verificado em ' + dataHora(a.verificadoEm) : 'Pendente de verificação'));
    b.classList.toggle('done', ok);
    b.innerHTML = icon(ok ? 'rotate' : 'check');
    b.appendChild(el('span', null, ok ? 'Desfazer verificação' : 'Marcar como verificado'));
  }
  function desenharRevisao() {
    var a = atual();
    if (!a) { fecharRevisao(); return; }
    var url = api.urlDoAnexo(A.modelo, a.id), corpo = $('revBody'), tipo = especie(a);
    $('revName').textContent = a.nome;
    $('revMeta').textContent = [a.caminho, tamanho(a.tamanho), 'anexado em ' + dataHora(a.criadoEm)].filter(Boolean).join(' · ');
    $('revCount').textContent = (A.rev.i + 1) + ' de ' + A.rev.ids.length;
    $('revPrev').disabled = A.rev.i === 0;
    $('revNext').disabled = A.rev.i >= A.rev.ids.length - 1;
    $('revNote').value = a.observacao || '';
    $('revDownload').href = api.urlDoAnexo(A.modelo, a.id, true);
    $('revOpen').href = url;
    $('revOpen').hidden = tipo === 'outro';
    desarmarExclusao();
    desenharSituacao(a);

    corpo.textContent = '';
    corpo.className = 'rev-' + tipo;
    if (tipo === 'imagem') {
      var img = el('img'); img.alt = a.nome; img.src = url;
      img.addEventListener('click', function () { corpo.classList.toggle('zoom'); });
      corpo.appendChild(img);
    } else if (tipo === 'pdf' && navigator.pdfViewerEnabled !== false) {
      var fr = el('iframe'); fr.title = a.nome; fr.src = url;
      corpo.appendChild(fr);
    } else if (tipo === 'video' || tipo === 'audio') {
      var m = el(tipo); m.controls = true; m.src = url; m.playsInline = true;
      corpo.appendChild(m);
    } else if (tipo === 'texto') {
      var pre = el('pre', null, 'Carregando…');
      corpo.appendChild(pre);
      fetch(url).then(function (r) { return r.ok ? r.text() : Promise.reject(); })
        .then(function (t) { pre.textContent = t.length > 300000 ? t.slice(0, 300000) + '\n…' : t; })
        .catch(function () { pre.textContent = 'Não foi possível carregar o texto.'; });
    } else {
      var aviso = el('div', 'semPrevia');
      aviso.innerHTML = icon('file');
      aviso.appendChild(el('div', 'h3', tipo === 'pdf' ? 'Este navegador não exibe PDF dentro da página.' : 'Não há pré-visualização para este tipo de arquivo.'));
      aviso.appendChild(el('div', 'muted', tipo === 'pdf' ? 'Use “Abrir em nova aba” ou “Baixar” para conferir o arquivo.' : 'Use “Baixar” para conferir o arquivo.'));
      corpo.appendChild(aviso);
    }
  }

  function salvarObservacao() {
    var a = atual(), texto = $('revNote').value.trim();
    if (!a || texto === (a.observacao || '')) return;
    a.observacao = texto;             // otimista; em caso de falha o aviso informa
    api.atualizarAnexo(A.modelo, a.id, { observacao: texto }).catch(function (e) { opts.toast(e.message, false, 6000); });
  }
  $('revNote').addEventListener('change', salvarObservacao);
  $('revNote').addEventListener('keydown', function (e) { if (e.key === 'Enter') this.blur(); e.stopPropagation(); });

  $('revVerify').addEventListener('click', async function () {
    var a = atual(); if (!a) return;
    var novo = a.status === 'verificado' ? 'pendente' : 'verificado';
    this.disabled = true;
    try {
      Object.assign(a, await api.atualizarAnexo(A.modelo, a.id, { status: novo, observacao: $('revNote').value.trim() }));
      desenharSituacao(a);
      mudou();
    } catch (e) { opts.toast(e.message, false, 6000); }
    this.disabled = false;
  });

  var armado = null;
  function desarmarExclusao() {
    clearTimeout(armado); armado = null;
    var b = $('revDelete'); b.classList.remove('armed');
    b.innerHTML = icon('trash'); b.appendChild(el('span', null, 'Excluir'));
  }
  $('revDelete').addEventListener('click', async function () {
    var a = atual(); if (!a) return;
    if (!armado) {                      // primeiro toque arma, segundo confirma
      this.classList.add('armed');
      this.innerHTML = icon('trash'); this.appendChild(el('span', null, 'Toque de novo para excluir'));
      armado = setTimeout(desarmarExclusao, 4000);
      return;
    }
    desarmarExclusao();
    try {
      await api.removerAnexo(A.modelo, a.id);
      A.lista = A.lista.filter(function (x) { return x.id !== a.id; });
      A.rev.ids.splice(A.rev.i, 1);
      if (A.rev.i >= A.rev.ids.length) A.rev.i = A.rev.ids.length - 1;
      opts.toast('Anexo excluído.');
      mudou();
      if (A.rev.ids.length) desenharRevisao(); else fecharRevisao();
    } catch (e) { opts.toast(e.message, false, 6000); }
  });

  function passo(d) {
    if (!A.rev) return;
    var i = A.rev.i + d;
    if (i < 0 || i >= A.rev.ids.length) return;
    salvarObservacao();
    A.rev.i = i;
    desenharRevisao();
  }
  $('revPrev').addEventListener('click', function () { passo(-1); });
  $('revNext').addEventListener('click', function () { passo(1); });
  $('revClose').addEventListener('click', fecharRevisao);

  // ---------------------------------------------------------------- interface publica
  return {
    get disponivel() { return A.disponivel; },
    get revisando() { return !!A.rev; },
    fecharRevisao: fecharRevisao,
    passo: passo,
    enviar: enviar,
    async iniciar() {
      var estado = await api.ping();
      A.disponivel = !!estado;
      if (estado && estado.limiteMB) A.limiteMB = estado.limiteMB;
      desenharPainel(); desenharGaveta();
      return A.disponivel;
    },
    async definirModelo(modelo) {
      A.modelo = modelo; A.lista = []; A.parte = null;
      fecharRevisao();
      if (A.disponivel && modelo) {
        try { A.lista = await api.listarAnexos(modelo); }
        catch (e) { opts.toast(e.message, false, 6000); }
      }
      mudou();
    },
    // parte: { chave, caminho } ou null
    definirParte(parte) { A.parte = parte; desenharPainel(); },
    contagem(chave) {
      var itens = daParte(chave);
      return { total: itens.length, verificados: itens.filter(function (a) { return a.status === 'verificado'; }).length };
    },
    temNaSubarvore(chave) {
      var prefixo = chave + '.';
      return A.lista.some(function (a) { return a.parte.indexOf(prefixo) === 0; });
    },
  };
}
