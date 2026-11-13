// Servidor HTTP do ID3D: entrega o visualizador, lista os modelos da pasta modelos/ e
// guarda os anexos das pecas na pasta anexos/. Sem dependencias alem do Node.

import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Anexos, ErroAnexo } from './anexos.mjs';

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.pdf': 'application/pdf', '.prc': 'application/octet-stream',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
};
// Tipos que o navegador pode exibir dentro da pagina sem risco de executar conteudo.
const EXIBIVEIS = /^(image\/(png|jpeg|gif|webp|bmp)|application\/pdf|text\/plain|video\/(mp4|webm)|audio\/(mpeg|mp4|ogg|wav|webm))$/;

function json(res, status, corpo) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(corpo));
}

async function lerJson(req, limite = 64 * 1024) {
  const partes = [];
  let total = 0;
  for await (const bloco of req) {
    total += bloco.length;
    if (total > limite) throw new ErroAnexo(413, 'Requisição grande demais.');
    partes.push(bloco);
  }
  try { return JSON.parse(Buffer.concat(partes).toString('utf8') || '{}'); }
  catch { throw new ErroAnexo(400, 'JSON inválido.'); }
}

// Dentro de `base`? Evita que um caminho da URL escape da pasta servida.
function dentro(base, file) {
  const rel = path.relative(base, file);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function enviarArquivo(res, file, cabecalhos = {}) {
  const info = await stat(file);
  if (!info.isFile()) throw new ErroAnexo(404, 'Não encontrado.');
  res.writeHead(200, { 'Content-Length': info.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...cabecalhos });
  createReadStream(file).pipe(res);
}

async function listarModelos(pastas) {
  const lista = [];
  for (const { dir, prefixo, exemplo } of pastas) {
    let nomes;
    try { nomes = await readdir(dir); } catch { continue; }
    for (const nome of nomes.sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
      if (!/\.(pdf|prc)$/i.test(nome)) continue;
      const info = await stat(path.join(dir, nome)).catch(() => null);
      if (info && info.isFile()) lista.push({ nome, tamanho: info.size, url: `${prefixo}/${encodeURIComponent(nome)}`, exemplo: !!exemplo });
    }
  }
  return lista;
}

// opcoes: { dist, modelos, exemplos, anexos, limiteMB }
export function createApp(opcoes) {
  const dist = path.resolve(opcoes.dist), modelos = path.resolve(opcoes.modelos), exemplos = path.resolve(opcoes.exemplos);
  const anexos = new Anexos(opcoes.anexos, { limiteBytes: (opcoes.limiteMB || 100) * 1024 * 1024 });
  const pastasDeModelos = [{ dir: modelos, prefixo: '/modelos' }, { dir: exemplos, prefixo: '/examples', exemplo: true }];

  // Alteracoes so valem com o cabecalho proprio e vindas da mesma origem: uma pagina de
  // outro site aberta no mesmo navegador nao consegue enviar esse cabecalho.
  function exigirMesmaOrigem(req) {
    if (req.headers['x-id3d'] !== '1') throw new ErroAnexo(403, 'Requisição recusada.');
    const origem = req.headers.origin;
    if (origem && new URL(origem).host !== req.headers.host) throw new ErroAnexo(403, 'Requisição recusada.');
  }

  async function api(req, res, url, partes) {
    if (partes[1] === 'estado' && req.method === 'GET') return json(res, 200, { nome: 'ID3D', anexos: true, limiteMB: anexos.limiteBytes / 1048576 });
    if (partes[1] === 'modelos' && req.method === 'GET') return json(res, 200, { modelos: await listarModelos(pastasDeModelos) });
    if (partes[1] !== 'anexos' || !partes[2]) throw new ErroAnexo(404, 'Não encontrado.');

    const [, , modelo, id, acao] = partes;
    if (!id) {
      if (req.method === 'GET') return json(res, 200, { anexos: await anexos.listar(modelo) });
      if (req.method === 'POST') {
        exigirMesmaOrigem(req);
        const q = url.searchParams;
        const anexo = await anexos.criar(modelo, {
          parte: q.get('parte'), caminho: q.get('caminho') || '', nome: q.get('nome'),
          tipo: (req.headers['content-type'] || '').split(';')[0].trim(),
        }, req);
        return json(res, 201, { anexo });
      }
    } else if (acao === 'arquivo' && req.method === 'GET') {
      const { anexo, file } = await anexos.arquivo(modelo, id);
      const exibivel = EXIBIVEIS.test(anexo.tipo) && !url.searchParams.has('baixar');
      const nome = encodeURIComponent(anexo.nome);
      return enviarArquivo(res, file, {
        'Content-Type': !exibivel ? 'application/octet-stream' : anexo.tipo === 'text/plain' ? 'text/plain; charset=utf-8' : anexo.tipo,
        'Content-Disposition': `${exibivel ? 'inline' : 'attachment'}; filename*=UTF-8''${nome}`,
      });
    } else if (!acao && req.method === 'PATCH') {
      exigirMesmaOrigem(req);
      const corpo = await lerJson(req);
      return json(res, 200, { anexo: await anexos.atualizar(modelo, id, { status: corpo.status, observacao: corpo.observacao }) });
    } else if (!acao && req.method === 'DELETE') {
      exigirMesmaOrigem(req);
      return json(res, 200, { anexo: await anexos.remover(modelo, id) });
    }
    throw new ErroAnexo(405, 'Método não permitido.');
  }

  async function estatico(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new ErroAnexo(405, 'Método não permitido.');
    let base = dist, rel = pathname === '/' ? '/id3d.html' : pathname;
    if (rel.startsWith('/modelos/')) { base = modelos; rel = rel.slice('/modelos'.length); }
    else if (rel.startsWith('/examples/')) { base = exemplos; rel = rel.slice('/examples'.length); }
    const file = path.join(base, rel);
    if (!dentro(base, file)) throw new ErroAnexo(403, 'Acesso negado.');
    if (base !== dist && !/\.(pdf|prc)$/i.test(file)) throw new ErroAnexo(404, 'Não encontrado.');
    try {
      await enviarArquivo(res, file, { 'Content-Type': TIPOS[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    } catch (e) {
      if (e.code === 'ENOENT' && base === dist && rel === '/id3d.html') {
        throw new ErroAnexo(503, 'O visualizador ainda não foi gerado. Rode "npm run build".');
      }
      throw e;
    }
  }

  return async function app(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = decodeURIComponent(url.pathname);
      const partes = pathname.split('/').filter(Boolean);
      if (partes[0] === 'api') await api(req, res, url, partes);
      else await estatico(req, res, pathname);
    } catch (e) {
      const status = e instanceof ErroAnexo ? e.status : e.code === 'ENOENT' ? 404 : e instanceof URIError ? 400 : 500;
      if (status === 500) console.error(e);
      if (res.headersSent) { res.destroy(); return; }
      json(res, status, { erro: status === 500 ? 'Erro interno do servidor.' : status === 404 && !(e instanceof ErroAnexo) ? 'Não encontrado.' : e.message });
    }
  };
}
