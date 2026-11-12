# ID3D

Visualizador de **PDF 3D** que roda no navegador. Os leitores de PDF dos navegadores ignoram
anotações 3D; o ID3D extrai o modelo de dentro do PDF, decodifica o formato PRC e o renderiza
com WebGL — sem plugin, sem instalação e sem enviar o arquivo para lugar nenhum.

## Recursos

- **Navegação**: girar, mover, zoom no cursor, duplo clique para centralizar a órbita.
- **Estrutura do modelo**: árvore de conjuntos e peças com busca, mostrar/ocultar e isolar.
- **Seleção**: nome, caminho na árvore, dimensões e coordenadas do centro do componente.
- **Vistas**: as vistas salvas no PDF (ou um conjunto padrão), em perspectiva ou ortográfica.
- **Exibição**: sólido, sólido com arestas, transparente e aramado; tema claro e escuro.
- **Corte e medição**: plano de corte em X, Y ou Z e distância entre dois pontos.
- **Um arquivo só**: o build gera um único HTML autossuficiente, que funciona offline.

## Como usar

Requer [Node.js](https://nodejs.org/) 22 ou mais recente para gerar o visualizador.

```bash
npm install
npm run build
```

Abra `dist/id3d.html` no navegador e arraste um PDF 3D para a janela (ou use **Abrir PDF…**).
Para experimentar, use o modelo sintético em [`examples/exemplo.pdf`](examples/exemplo.pdf).

Para gerar um HTML que já abre direto em um modelo, com o PDF embutido:

```bash
npm run build -- caminho/do/modelo.pdf
```

O resultado fica em `dist/modelo-3d.html`. O PDF vai inteiro dentro desse HTML: trate o arquivo
gerado com o mesmo cuidado que o PDF original.

### Atalhos

| Ação | Mouse / teclado |
| --- | --- |
| Girar | arrastar |
| Mover | botão direito ou do meio |
| Zoom | rolagem |
| Selecionar componente | clique |
| Centralizar a órbita em um ponto | duplo clique |
| Enquadrar o modelo ou a seleção | `F` |
| Ocultar / isolar a seleção | `H` / `I` |
| Mostrar tudo | `A` |
| Medir | `M` |
| Cancelar | `Esc` |

## Formatos suportados

| | Situação |
| --- | --- |
| PDF com stream **PRC** e geometria em tesselação (`PRC_TYPE_TESS_3D`) | suportado |
| Arquivo `.prc` avulso | suportado |
| Árvore de produtos, peças, conjuntos e instâncias com transformação | suportado |
| Cores por estilo, material e por face; transparência | suportado |
| Vistas salvas no PDF (`/3DView`) | suportado |
| PRC com tesselação altamente comprimida (`PRC_TYPE_TESS_3D_Compressed`) | não suportado |
| PRC só com geometria exata (B-rep), sem tesselação | não suportado |
| Anotações e cotas 3D (markups / PMI), texturas | não suportado |
| PDF com stream **U3D** | não suportado |
| PDF criptografado | não suportado |

Quando um arquivo cai em um caso não suportado, o visualizador mostra uma mensagem dizendo qual.
Normais gravadas de forma incoerente com a geometria são detectadas e recalculadas.

As medidas são exibidas nas unidades do próprio modelo; o PRC nem sempre informa qual é a unidade.

## Privacidade

Todo o processamento acontece no navegador. O arquivo aberto não é enviado a nenhum servidor e
o HTML gerado não faz requisições de rede. A única coisa guardada é a preferência de tema
(claro/escuro), no `localStorage`.

Este repositório não contém modelos reais: o `.gitignore` bloqueia `*.pdf`, `*.prc` e `*.u3d`,
com exceção do exemplo sintético.

## Desenvolvimento

```bash
npm run dev                 # build + servidor em http://127.0.0.1:8765, refaz o build ao salvar
npm run dev -- modelo.pdf   # idem, e também gera dist/modelo-3d.html
npm test                    # testes do núcleo (node:test)
npm run lint                # ESLint
npm run check               # lint + testes + build
npm run sample              # regenera examples/exemplo.pdf
```

### Estrutura

```
src/
  core/                   núcleo sem DOM: roda igual no navegador e no Node
    index.js              load(bytes) -> cena
    pdf.js                localiza a anotação 3D, o stream, as vistas e os metadados
    inflate.js            descompressão zlib/deflate
    bit-reader.js         fluxo de bits do PRC (inteiros, strings, doubles comprimidos)
    prc-double-table.js   tabela de Huffman dos doubles (LGPL, ver avisos)
    prc-types.js          identificadores de tipo do PRC
    prc-reader.js         seções do PRC: globais, árvore, tesselações, model file
    tessellation.js       triângulos, leques e tiras -> triângulos soltos
    normals.js            validação e reconstrução de normais
    scene.js              árvore de nós com transformações e cores resolvidas
  viewer/                 interface: three.js, câmera, árvore, seleção, corte, medição
scripts/
  build.mjs               empacota tudo em um HTML único (esbuild)
  dev.mjs                 servidor de desenvolvimento
  make-sample.mjs         gera o PDF de exemplo
  lib/                    gravador PRC/PDF mínimo e formas geométricas (testes e exemplo)
test/                     testes automatizados
examples/                 modelo sintético
```

### Como funciona

1. `pdf.js` encontra o objeto `/Type /3D` do PDF, descomprime o stream e lê as vistas (`/C2W`).
2. `prc-reader.js` percorre o cabeçalho do PRC, descomprime cada seção e a lê bit a bit.
3. `scene.js` resolve a árvore de produtos (inclusive referências entre *file structures*),
   acumula as transformações e associa a cada malha sua cor.
4. `viewer/main.js` recentra o modelo na origem (em precisão dupla, para não perder precisão
   com coordenadas grandes), monta as malhas no three.js e cuida da interação.

Os testes não dependem de arquivos reais: `scripts/lib/prc-writer.mjs` grava um PRC sintético
com o mesmo algoritmo de compressão de doubles do formato, e o leitor é verificado contra ele.

## Licença

O código do ID3D é distribuído sob a [licença MIT](LICENSE).

A exceção é `src/core/prc-double-table.js`, derivado do projeto Asymptote, que permanece sob
a LGPL-3.0-or-later (veja abaixo).

## Créditos e licenças de terceiros

- [three.js](https://threejs.org/) (MIT) — renderização.
- Tabela de compressão de doubles do PRC derivada do projeto
  [Asymptote](https://asymptote.sourceforge.io/) (LGPL-3.0-or-later).

Detalhes em [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
