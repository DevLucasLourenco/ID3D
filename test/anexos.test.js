import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { Anexos } from '../server/anexos.mjs';
import { createApp } from '../server/app.mjs';

const MODELO = '0123456789abcdef';
let tmp, server, base;

before(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'id3d-'));
  for (const d of ['dist', 'modelos', 'examples', 'anexos']) await mkdir(path.join(tmp, d));
  await writeFile(path.join(tmp, 'dist', 'id3d.html'), '<!doctype html><title>ID3D</title>');
  await writeFile(path.join(tmp, 'modelos', 'linha.pdf'), '%PDF-1.7 falso');
  await writeFile(path.join(tmp, 'modelos', 'notas.txt'), 'nao e modelo');
  await writeFile(path.join(tmp, 'segredo.txt'), 'fora das pastas servidas');
  const app = createApp({
    dist: path.join(tmp, 'dist'), modelos: path.join(tmp, 'modelos'), exemplos: path.join(tmp, 'examples'),
    anexos: path.join(tmp, 'anexos'), limiteMB: 1,
  });
  server = createServer(app);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((ok) => server.close(ok));
  await rm(tmp, { recursive: true, force: true });
});

const H = { 'X-ID3D': '1' };
const enviar = (nome, corpo, tipo = 'text/plain', parte = '0.1') =>
  fetch(`${base}/api/anexos/${MODELO}?parte=${parte}&nome=${encodeURIComponent(nome)}&caminho=${encodeURIComponent('Raiz › Peça')}`,
    { method: 'POST', headers: { ...H, 'Content-Type': tipo }, body: corpo });

test('armazenamento: cria, lista, verifica e remove', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'id3d-arm-'));
  try {
    const anexos = new Anexos(dir);
    const a = await anexos.criar(MODELO, { parte: '0.2', caminho: 'Raiz › V-101', nome: 'Laudo nº 1.pdf', tipo: 'application/pdf' }, Readable.from([Buffer.from('conteudo')]));
    assert.equal(a.status, 'pendente');
    assert.equal(a.tamanho, 8);
    assert.match(a.arquivo, /^[a-f0-9]{12}-Laudo_n.*\.pdf$/);
    assert.equal((await anexos.listar(MODELO)).length, 1);

    const v = await anexos.atualizar(MODELO, a.id, { status: 'verificado', observacao: 'ok' });
    assert.equal(v.status, 'verificado');
    assert.ok(v.verificadoEm);
    assert.equal(v.observacao, 'ok');
    const d = await anexos.atualizar(MODELO, a.id, { status: 'pendente' });
    assert.equal(d.verificadoEm, null);
    assert.equal(d.observacao, 'ok', 'a observacao e mantida');

    const { file } = await anexos.arquivo(MODELO, a.id);
    assert.equal(await readFile(file, 'utf8'), 'conteudo');
    await anexos.remover(MODELO, a.id);
    assert.deepEqual(await anexos.listar(MODELO), []);
    assert.deepEqual((await readdir(path.join(dir, MODELO))).filter((n) => n !== 'index.json'), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('armazenamento: recusa identificadores e nomes perigosos', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'id3d-arm-'));
  try {
    const anexos = new Anexos(dir), corpo = () => Readable.from([Buffer.from('x')]);
    await assert.rejects(anexos.listar('../../etc'), /modelo inválido/);
    await assert.rejects(anexos.criar(MODELO, { parte: '../1', nome: 'a.txt' }, corpo()), /peça inválido/);
    await assert.rejects(anexos.arquivo(MODELO, '../index.json'), /anexo inválido/);
    await assert.rejects(anexos.criar(MODELO, { parte: '0', nome: 'vazio.txt' }, Readable.from([])), /vazio/);

    const a = await anexos.criar(MODELO, { parte: '0', nome: '..\\..\\windows\\system32\\mal.exe' }, corpo());
    assert.equal(a.nome, 'mal.exe');
    assert.match(a.arquivo, /^[a-f0-9]{12}-mal\.exe$/);
    assert.deepEqual((await readdir(dir)).sort(), [MODELO], 'nada escrito fora da pasta do modelo');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('armazenamento: gravacoes simultaneas nao perdem registros', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'id3d-arm-'));
  try {
    const anexos = new Anexos(dir);
    await Promise.all(Array.from({ length: 12 }, (_, i) =>
      anexos.criar(MODELO, { parte: String(i), nome: `f${i}.txt` }, Readable.from([Buffer.from('x')]))));
    assert.equal((await anexos.listar(MODELO)).length, 12);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('http: estado, pagina inicial e lista de modelos', async () => {
  assert.deepEqual(await (await fetch(`${base}/api/estado`)).json(), { nome: 'ID3D', anexos: true, limiteMB: 1 });
  const home = await fetch(`${base}/`);
  assert.match(home.headers.get('content-type'), /text\/html/);
  const { modelos } = await (await fetch(`${base}/api/modelos`)).json();
  assert.deepEqual(modelos.map((m) => m.nome), ['linha.pdf'], 'so PDF/PRC entram na lista');
  assert.equal(await (await fetch(base + modelos[0].url)).text(), '%PDF-1.7 falso');
});

test('http: nao serve arquivos fora das pastas publicas', async () => {
  for (const alvo of ['/modelos/notas.txt', '/modelos/..%2Fsegredo.txt', '/..%2Fsegredo.txt', '/%2e%2e/segredo.txt', '/examples/..%2F..%2Fsegredo.txt']) {
    const r = await fetch(base + alvo);
    assert.ok(r.status === 403 || r.status === 404, `${alvo} -> ${r.status}`);
    assert.doesNotMatch(await r.text(), /fora das pastas/);
  }
});

test('http: ciclo completo de um anexo', async () => {
  const criado = await enviar('foto da válvula.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'image/png', '0.3.1');
  assert.equal(criado.status, 201);
  const { anexo } = await criado.json();
  assert.equal(anexo.nome, 'foto da válvula.png');
  assert.equal(anexo.parte, '0.3.1');
  assert.equal(anexo.caminho, 'Raiz › Peça');

  const lista = await (await fetch(`${base}/api/anexos/${MODELO}`)).json();
  assert.ok(lista.anexos.some((a) => a.id === anexo.id));

  const arq = await fetch(`${base}/api/anexos/${MODELO}/${anexo.id}/arquivo`);
  assert.equal(arq.headers.get('content-type'), 'image/png');
  assert.match(arq.headers.get('content-disposition'), /^inline/);
  assert.equal(arq.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(new Uint8Array(await arq.arrayBuffer()), new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

  const ver = await fetch(`${base}/api/anexos/${MODELO}/${anexo.id}`, {
    method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'verificado', observacao: 'conferido em campo' }),
  });
  assert.equal((await ver.json()).anexo.status, 'verificado');

  const del = await fetch(`${base}/api/anexos/${MODELO}/${anexo.id}`, { method: 'DELETE', headers: H });
  assert.equal(del.status, 200);
  assert.equal((await fetch(`${base}/api/anexos/${MODELO}/${anexo.id}/arquivo`)).status, 404);
});

test('http: conteudo ativo nunca e exibido dentro da pagina', async () => {
  const { anexo } = await (await enviar('pagina.html', '<script>alert(1)</script>', 'text/html')).json();
  const r = await fetch(`${base}/api/anexos/${MODELO}/${anexo.id}/arquivo`);
  assert.equal(r.headers.get('content-type'), 'application/octet-stream');
  assert.match(r.headers.get('content-disposition'), /^attachment/);
  const svg = (await (await enviar('desenho.svg', '<svg onload="alert(1)"/>', 'image/svg+xml')).json()).anexo;
  assert.match((await fetch(`${base}/api/anexos/${MODELO}/${svg.id}/arquivo`)).headers.get('content-disposition'), /^attachment/);
});

test('http: alteracoes exigem o cabecalho proprio e a mesma origem', async () => {
  const url = `${base}/api/anexos/${MODELO}?parte=0&nome=a.txt`;
  assert.equal((await fetch(url, { method: 'POST', body: 'x' })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers: { ...H, Origin: 'http://outro-site.example' }, body: 'x' })).status, 403);
  assert.equal((await fetch(`${base}/api/anexos/${MODELO}/aaaaaaaaaaaa`, { method: 'DELETE' })).status, 403);
});

test('http: limite de tamanho, entradas invalidas e erros em portugues', async () => {
  const grande = await enviar('grande.bin', Buffer.alloc(1024 * 1024 + 10), 'application/octet-stream');
  assert.equal(grande.status, 413);
  assert.match((await grande.json()).erro, /limite de 1 MB/);
  assert.deepEqual((await readdir(path.join(tmp, 'anexos', MODELO))).filter((n) => n.includes('grande')), [], 'arquivo parcial removido');

  assert.equal((await fetch(`${base}/api/anexos/nao-e-hex`)).status, 400);
  assert.equal((await enviar('a.txt', 'x', 'text/plain', '..')).status, 400);
  const inexistente = await fetch(`${base}/api/anexos/${MODELO}/aaaaaaaaaaaa`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(inexistente.status, 404);
  assert.equal((await inexistente.json()).erro, 'Anexo não encontrado.');
  const invalido = await enviar('b.txt', 'x');
  const id = (await invalido.json()).anexo.id;
  const ruim = await fetch(`${base}/api/anexos/${MODELO}/${id}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json' }, body: '{"status":"aprovado"}' });
  assert.equal(ruim.status, 400);
});
