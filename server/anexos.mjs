// Armazenamento dos anexos das pecas em uma pasta do disco.
//
//   <pasta>/<modelo>/index.json          registro dos anexos do modelo
//   <pasta>/<modelo>/<id>-<nome>         arquivos anexados
//
// "modelo" e a impressao digital do modelo 3D (calculada pelo visualizador) e "parte" e o
// caminho de indices do no na arvore (ex.: "0.3.12").

import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

export const STATUS = ['pendente', 'verificado'];

const RE_MODELO = /^[a-f0-9]{16}$/;
const RE_ID = /^[a-f0-9]{12}$/;
const RE_PARTE = /^\d{1,6}(\.\d{1,6}){0,60}$/;

// Erro com codigo HTTP, para o servidor responder de forma adequada.
export class ErroAnexo extends Error {
  constructor(status, mensagem) { super(mensagem); this.status = status; }
}

// Nome exibido: sem caminho, sem caracteres de controle, tamanho limitado.
function limparNome(nome) {
  // eslint-disable-next-line no-control-regex
  const limpo = String(nome || '').replace(/[\u0000-\u001f\u007f]/g, '').split(/[\\/]/).pop().trim().slice(0, 200);
  return limpo || 'arquivo';
}
// Nome usado no disco: so caracteres seguros em qualquer sistema de arquivos.
function nomeNoDisco(nome) {
  const ext = path.extname(nome).replace(/[^A-Za-z0-9.]/g, '').slice(0, 12);
  const base = path.basename(nome, path.extname(nome)).normalize('NFKD').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  return (base || 'arquivo') + ext;
}

export class Anexos {
  constructor(pasta, { limiteBytes = 100 * 1024 * 1024 } = {}) {
    this.pasta = path.resolve(pasta);
    this.limiteBytes = limiteBytes;
    this.filas = new Map();          // modelo -> promessa da ultima escrita do indice
  }

  #dir(modelo) {
    if (!RE_MODELO.test(modelo)) throw new ErroAnexo(400, 'Identificador de modelo inválido.');
    return path.join(this.pasta, modelo);
  }

  async #ler(modelo) {
    try {
      const dados = JSON.parse(await readFile(path.join(this.#dir(modelo), 'index.json'), 'utf8'));
      return Array.isArray(dados.anexos) ? dados : { anexos: [] };
    } catch (e) {
      if (e.code === 'ENOENT') return { anexos: [] };
      throw e;
    }
  }

  // Le, altera e grava o indice de um modelo, uma alteracao por vez.
  #alterar(modelo, fn) {
    const anterior = this.filas.get(modelo) || Promise.resolve();
    const proxima = anterior.catch(() => {}).then(async () => {
      const dir = this.#dir(modelo), dados = await this.#ler(modelo);
      const resultado = await fn(dados);
      await mkdir(dir, { recursive: true });
      const tmp = path.join(dir, `index.${randomBytes(4).toString('hex')}.tmp`);
      await writeFile(tmp, JSON.stringify(dados, null, 2));
      await rename(tmp, path.join(dir, 'index.json'));
      return resultado;
    });
    this.filas.set(modelo, proxima);
    return proxima;
  }

  async listar(modelo) {
    return (await this.#ler(modelo)).anexos;
  }

  async #achar(modelo, id) {
    if (!RE_ID.test(id)) throw new ErroAnexo(400, 'Identificador de anexo inválido.');
    const anexo = (await this.#ler(modelo)).anexos.find((a) => a.id === id);
    if (!anexo) throw new ErroAnexo(404, 'Anexo não encontrado.');
    return anexo;
  }

  // Grava o conteudo (stream) e registra o anexo.
  async criar(modelo, { parte, caminho = '', nome, tipo = '' }, conteudo) {
    if (!RE_PARTE.test(String(parte))) throw new ErroAnexo(400, 'Identificador de peça inválido.');
    const dir = this.#dir(modelo), id = randomBytes(6).toString('hex'), exibido = limparNome(nome);
    const arquivo = `${id}-${nomeNoDisco(exibido)}`, destino = path.join(dir, arquivo);
    await mkdir(dir, { recursive: true });

    let tamanho = 0;
    const limite = this.limiteBytes;
    const contador = new Transform({
      transform(bloco, _enc, pronto) {
        tamanho += bloco.length;
        pronto(tamanho > limite ? new ErroAnexo(413, `Arquivo maior que o limite de ${Math.round(limite / 1048576)} MB.`) : null, bloco);
      },
    });
    try {
      await pipeline(conteudo, contador, createWriteStream(destino, { flags: 'wx' }));
    } catch (e) {
      await rm(destino, { force: true });
      throw e;
    }
    if (!tamanho) { await rm(destino, { force: true }); throw new ErroAnexo(400, 'Arquivo vazio.'); }

    const anexo = {
      id, parte: String(parte), caminho: String(caminho).slice(0, 1000), nome: exibido,
      tipo: String(tipo).slice(0, 120), tamanho, arquivo,
      status: 'pendente', observacao: '', criadoEm: new Date().toISOString(), verificadoEm: null,
    };
    await this.#alterar(modelo, (dados) => { dados.anexos.push(anexo); });
    return anexo;
  }

  async atualizar(modelo, id, { status, observacao }) {
    await this.#achar(modelo, id);
    if (status !== undefined && !STATUS.includes(status)) throw new ErroAnexo(400, 'Situação inválida.');
    return this.#alterar(modelo, (dados) => {
      const anexo = dados.anexos.find((a) => a.id === id);
      if (!anexo) throw new ErroAnexo(404, 'Anexo não encontrado.');
      if (status !== undefined && status !== anexo.status) {
        anexo.status = status;
        anexo.verificadoEm = status === 'verificado' ? new Date().toISOString() : null;
      }
      if (observacao !== undefined) anexo.observacao = String(observacao).slice(0, 2000);
      return anexo;
    });
  }

  async remover(modelo, id) {
    const anexo = await this.#achar(modelo, id);
    await this.#alterar(modelo, (dados) => { dados.anexos = dados.anexos.filter((a) => a.id !== id); });
    await rm(path.join(this.#dir(modelo), anexo.arquivo), { force: true });
    return anexo;
  }

  // Caminho do arquivo no disco, garantindo que ele fica dentro da pasta do modelo.
  async arquivo(modelo, id) {
    const anexo = await this.#achar(modelo, id), dir = this.#dir(modelo), file = path.join(dir, anexo.arquivo);
    if (path.dirname(file) !== dir) throw new ErroAnexo(400, 'Registro de anexo inválido.');
    await stat(file).catch(() => { throw new ErroAnexo(404, 'O arquivo deste anexo não está mais no disco.'); });
    return { anexo, file };
  }
}
