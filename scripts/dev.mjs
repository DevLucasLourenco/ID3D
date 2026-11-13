// Desenvolvimento: gera dist/, sobe o servidor do ID3D e refaz o build quando algo em
// src/ muda (recarregue a pagina para ver).
//
//   npm run dev                  -> http://127.0.0.1:8765
//   npm run dev -- modelo.pdf    -> tambem gera dist/modelo-3d.html com o PDF embutido
//   npm run dev -- --rede        -> acessivel pela rede (veja server/index.mjs)

import { watch } from 'node:fs';
import path from 'node:path';
import { build } from './build.mjs';
import { iniciar, opcoes, root } from '../server/index.mjs';

const args = process.argv.slice(2);
const pdf = args.find((a) => !a.startsWith('--'));

async function rebuild() {
  try {
    for (const alvo of [{}].concat(pdf ? [{ pdf }] : [])) {
      const { file } = await build(alvo);
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

await iniciar(opcoes(args));
