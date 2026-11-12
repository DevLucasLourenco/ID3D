// Gera o visualizador como um unico arquivo HTML autossuficiente em dist/.
//
//   npm run build                      -> dist/id3d.html (vazio: abra ou arraste um PDF 3D)
//   npm run build -- modelo.pdf        -> dist/modelo-3d.html (com o PDF embutido)
//   npm run build -- modelo.pdf out.html
//
// O PDF embutido vai inteiro dentro do HTML: trate o arquivo gerado com o mesmo cuidado
// que o PDF original.

import { build as esbuild } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (...p) => path.join(root, 'src', ...p);

// Impede que o conteudo inserido feche a tag <script> antes da hora.
const inlineSafe = (code) => code.replace(/<\/script/gi, '<\\/script');

function inject(html, marker, value) {
  const i = html.indexOf(marker);
  if (i < 0) throw new Error(`marcador ausente no template: ${marker}`);
  return html.slice(0, i) + value + html.slice(i + marker.length);
}

export async function build({ pdf, out } = {}) {
  const bundle = await esbuild({
    entryPoints: [src('viewer', 'main.js')],
    bundle: true,
    format: 'iife',
    minify: true,
    target: 'es2020',
    legalComments: 'inline',
    write: false,
    logLevel: 'warning',
  });

  let embedded = '';
  if (pdf) {
    const name = path.basename(pdf).replace(/[<>"&]/g, '_');
    const data = (await readFile(pdf)).toString('base64');
    embedded = `<script id="embedded-pdf" type="application/octet-stream" data-name="${name}">${data}</script>`;
  }

  let html = await readFile(src('viewer', 'index.html'), 'utf8');
  html = inject(html, '/*__CSS__*/', await readFile(src('viewer', 'styles.css'), 'utf8'));
  html = inject(html, '<!--__EMBEDDED__-->', embedded);
  html = inject(html, '/*__APP__*/', inlineSafe(bundle.outputFiles[0].text));

  const name = out || (pdf ? path.basename(pdf).replace(/\.[^.]+$/, '') + '-3d.html' : 'id3d.html');
  const file = path.isAbsolute(name) ? name : path.join(root, 'dist', name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html);
  return { file, bytes: Buffer.byteLength(html) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [pdf, out] = process.argv.slice(2);
  const { file, bytes } = await build({ pdf, out });
  const rel = path.relative(process.cwd(), file) || file;
  console.log(`${rel} gerado (${Math.round(bytes / 1024)} KB)` + (pdf ? `, com ${path.basename(pdf)} embutido` : ''));
}
