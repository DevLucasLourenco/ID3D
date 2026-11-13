// Inicia o servidor do ID3D.
//
//   npm start                      -> http://127.0.0.1:8765 (so nesta maquina)
//   npm start -- --rede            -> acessivel pela rede (ex.: tablet no mesmo Wi-Fi)
//   npm start -- --porta=9000
//
// As variaveis de ambiente HOST e PORT tem o mesmo efeito.
//
// Atencao: nao ha login. Com --rede, qualquer pessoa na rede pode abrir os modelos
// da pasta modelos/ e ler, anexar e apagar anexos. Use apenas em rede confiavel.

import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function pastas(base = root) {
  return {
    dist: path.join(base, 'dist'),
    modelos: path.join(base, 'modelos'),
    exemplos: path.join(base, 'examples'),
    anexos: path.join(base, 'anexos'),
  };
}

export function iniciar({ host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT) || 8765 } = {}) {
  const app = createApp({ ...pastas(), limiteMB: Number(process.env.ID3D_MAX_MB) || 100 });
  const server = createServer(app);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      console.log(`ID3D em http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}/`);
      if (host === '0.0.0.0') {
        for (const lista of Object.values(networkInterfaces())) {
          for (const n of lista || []) if (n.family === 'IPv4' && !n.internal) console.log(`  na rede: http://${n.address}:${port}/`);
        }
        console.log('  aviso: sem login; qualquer pessoa nesta rede pode ver e alterar modelos e anexos.');
      }
      resolve(server);
    });
  });
}

// Opcoes de linha de comando: --rede e --porta=N.
export function opcoes(argv) {
  const o = {};
  for (const a of argv) {
    if (a === '--rede') o.host = '0.0.0.0';
    else if (/^--porta=\d+$/.test(a)) o.port = Number(a.slice(8));
  }
  return o;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await iniciar(opcoes(process.argv.slice(2)));
}
