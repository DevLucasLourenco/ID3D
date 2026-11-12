// Servidor de desenvolvimento: gera dist/, serve em http://127.0.0.1:8765 e refaz o build
// quando algo em src/ muda (recarregue a pagina para ver).
//
//   npm run dev                  -> serve dist/id3d.html
//   npm run dev -- modelo.pdf    -> tambem gera dist/modelo-3d.html com o PDF embutido

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT) || 8765;
const pdf = process.argv[2];

const TYPES = { '.html': 'text/html; charset=utf-8', '.pdf': 'application/pdf', '.js': 'text/javascript', '.css': 'text/css' };

async function rebuild() {
  try {
    const targets = [{}].concat(pdf ? [{ pdf }] : []);
    for (const t of targets) {
      const { file } = await build(t);
      console.log(`[build] ${path.relative(root, file)}`);
    }
  } catch (e) {
    console.error('[build] falhou:', e.message);
  }
}

await rebuild();

let timer = null;
watch(path.join(root, 'src'), { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(rebuild, 150);
});

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/id3d.html';
  // serve dist/ e examples/, sem permitir sair dessas pastas
  const base = rel.startsWith('/examples/') ? root : dist;
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
  }
}).listen(port, '127.0.0.1', () => console.log(`ID3D em http://127.0.0.1:${port}/`));
