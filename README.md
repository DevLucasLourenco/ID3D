# ID3D

Visualizador de **PDF 3D** que roda no navegador, pensado para uso em campo com tablet.
Os leitores de PDF dos navegadores ignoram anotações 3D; o ID3D extrai o modelo de dentro do
PDF, decodifica o formato PRC e o renderiza com WebGL — sem plugin e sem instalação. Cada
peça do modelo pode receber anexos (fotos, laudos, documentos) para revisão e verificação.

## Recursos

- **Feito para toque**: um dedo gira, dois dedos movem e ampliam, toque seleciona, dois toques
  centralizam. Botões grandes, sem depender de teclado, mouse ou de "passar o cursor".
- **Controles na tela**: um quadro com setas para girar ou mover a câmera, zoom e enquadrar,
  para quem está de luva ou prefere não usar gestos. Segurar o botão repete o movimento.
- **Projeção ortográfica**: sem distorção de perspectiva, com as vistas salvas no PDF
  (ou um conjunto padrão: isométrica, frente, topo, laterais).
- **Estrutura do modelo**: árvore de conjuntos e peças com busca, mostrar/ocultar e isolar.
- **Peça selecionada**: nome, caminho na árvore, dimensões, coordenadas do centro e anexos.
- **Anexos por peça**: anexar um ou mais arquivos, revisar (imagem, PDF, texto, vídeo e áudio
  abrem na própria tela), anotar uma observação e marcar como verificado. Uma lista geral
  mostra o que está pendente no modelo inteiro.
- **Exibição**: sólido, sólido com arestas, transparente e aramado; tema claro (padrão) e escuro.
- **Corte e medição**: plano de corte em X, Y ou Z e distância entre dois pontos.

## Como usar

Requer [Node.js](https://nodejs.org/) 22 ou mais recente.

```bash
npm install
npm start
```

Abra `http://127.0.0.1:8765/` e escolha um PDF 3D do aparelho, ou um dos modelos listados na
tela inicial. Para experimentar há um modelo sintético em [`examples/exemplo.pdf`](examples/exemplo.pdf).

### No tablet

O tablet acessa o ID3D pela rede, a partir de uma máquina que esteja rodando o servidor:

```bash
npm start -- --rede
```

O servidor mostra o endereço a abrir no navegador do tablet (algo como `http://192.168.0.10:8765/`).
Coloque os PDFs em [`modelos/`](modelos/LEIAME.md) para que apareçam na tela inicial, sem
precisar copiá-los para o aparelho. No menu **Mais** há a opção de tela cheia.

> **Atenção:** o servidor não tem login. Com `--rede`, qualquer pessoa na mesma rede
> pode abrir os modelos e ler, anexar e apagar anexos. Use apenas em rede confiável.

### Sem servidor

`npm run build` gera `dist/id3d.html`, um único arquivo que funciona offline, aberto direto do
disco. Nesse modo o visualizador funciona por completo, **exceto os anexos**, que dependem do
servidor para gravar em disco.

Para gerar um HTML que já abre em um modelo, com o PDF embutido:

```bash
npm run build -- caminho/do/modelo.pdf
```

O resultado fica em `dist/modelo-3d.html`. O PDF vai inteiro dentro desse HTML: trate o arquivo
gerado com o mesmo cuidado que o PDF original.

### Gestos e atalhos

| Ação | Toque | Mouse / teclado |
| --- | --- | --- |
| Girar | arrastar com um dedo | arrastar |
| Mover | arrastar com dois dedos | botão direito ou do meio |
| Zoom | pinça | rolagem |
| Selecionar peça | toque | clique |
| Centralizar a órbita em um ponto | dois toques | duplo clique |
| Enquadrar o modelo ou a seleção | botão **Enquadrar** | `F` |
| Ocultar / isolar a seleção | botões no painel da peça | `H` / `I` |
| Mostrar tudo | menu **Mais** | `A` |
| Medir | botão **Medir** | `M` |
| Cancelar / fechar | — | `Esc` |

## Anexos

Os anexos ficam na pasta [`anexos/`](anexos/LEIAME.md) do projeto, uma subpasta por modelo:

```
anexos/<modelo>/index.json     registro: peça, nome, situação, observação, datas
anexos/<modelo>/<id>-<nome>    os arquivos
```

- O modelo é identificado por uma impressão digital do seu conteúdo: o mesmo PDF sempre
  encontra os mesmos anexos; um PDF reexportado é tratado como outro modelo.
- Cada anexo começa como **pendente** e passa a **verificado** na tela de revisão, com data e
  hora. A verificação pode ser desfeita e não registra quem a fez (não há login).
- O limite por arquivo é de 100 MB (ajustável com a variável `ID3D_MAX_MB`).
- Arquivos que poderiam executar código no navegador (HTML, SVG e outros) nunca são exibidos
  dentro da página, apenas baixados.

`anexos/` e `modelos/` **não vão para o git**: este repositório é público e esses arquivos
costumam ser documentos internos. A cópia de segurança deles deve ser feita por outro meio.

## Formatos suportados

| | Situação |
| --- | --- |
| PDF com stream **PRC** e geometria em tesselação (`PRC_TYPE_TESS_3D`) | suportado |
| Arquivo `.prc` avulso | suportado |
| Árvore de produtos, peças, conjuntos e instâncias com transformação | suportado |
| Cores por estilo, material e por face; transparência | suportado |
| Vistas salvas no PDF (`/3DView`), sempre em projeção ortográfica | suportado |
| PRC com tesselação altamente comprimida (`PRC_TYPE_TESS_3D_Compressed`) | não suportado |
| PRC só com geometria exata (B-rep), sem tesselação | não suportado |
| Anotações e cotas 3D (markups / PMI), texturas | não suportado |
| PDF com stream **U3D** | não suportado |
| PDF criptografado | não suportado |

Quando um arquivo cai em um caso não suportado, o visualizador mostra uma mensagem dizendo qual.
Normais gravadas de forma incoerente com a geometria são detectadas e recalculadas.

As medidas são exibidas nas unidades do próprio modelo; o PRC nem sempre informa qual é a unidade.

## Privacidade

O modelo é lido e renderizado no navegador; nada é enviado para a internet. Os anexos vão
apenas para o servidor do ID3D que você mesmo roda, e ficam na pasta `anexos/`. No navegador
só são guardadas preferências de interface (tema, painéis), no `localStorage`.

Este repositório não contém modelos reais: o `.gitignore` bloqueia `*.pdf`, `*.prc` e `*.u3d`,
com exceção do exemplo sintético, além das pastas `anexos/` e `modelos/`.

## Desenvolvimento

```bash
npm run dev                 # build + servidor, refaz o build ao salvar algo em src/
npm run dev -- modelo.pdf   # idem, e também gera dist/modelo-3d.html
npm test                    # testes do núcleo e do servidor (node:test)
npm run lint                # ESLint
npm run check               # lint + testes + build
npm run sample              # regenera examples/exemplo.pdf
```

### Estrutura

```
src/
  core/                   núcleo sem DOM: roda igual no navegador e no Node
    index.js              load(bytes) -> cena, e a impressão digital do modelo
    pdf.js                localiza a anotação 3D, o stream, as vistas e os metadados
    inflate.js            descompressão zlib/deflate
    bit-reader.js         fluxo de bits do PRC (inteiros, strings, doubles comprimidos)
    prc-double-table.js   tabela de Huffman dos doubles (LGPL, ver avisos)
    prc-types.js          identificadores de tipo do PRC
    prc-reader.js         seções do PRC: globais, árvore, tesselações, model file
    tessellation.js       triângulos, leques e tiras -> triângulos soltos
    normals.js            validação e reconstrução de normais
    scene.js              árvore de nós com transformações e cores resolvidas
  viewer/                 interface
    main.js               cena three.js, câmera, árvore, seleção, corte, medição
    navpad.js             quadro de controles de navegação
    attachments.js        anexos: painel da peça, lista geral e tela de revisão
    api.js                cliente do servidor (modelos e anexos)
    icons.js              ícones
    index.html, styles.css
server/
  index.mjs               inicia o servidor (--rede, --porta)
  app.mjs                 rotas: visualizador, modelos e API de anexos
  anexos.mjs              armazenamento dos anexos em disco
scripts/
  build.mjs               empacota o visualizador em um HTML único (esbuild)
  dev.mjs                 servidor com rebuild automático
  make-sample.mjs         gera o PDF de exemplo
  lib/                    gravador PRC/PDF mínimo e formas geométricas (testes e exemplo)
test/                     testes automatizados
examples/                 modelo sintético
anexos/, modelos/         dados locais do servidor (fora do git)
```

### Como funciona

1. `pdf.js` encontra o objeto `/Type /3D` do PDF, descomprime o stream e lê as vistas (`/C2W`).
2. `prc-reader.js` percorre o cabeçalho do PRC, descomprime cada seção e a lê bit a bit.
3. `scene.js` resolve a árvore de produtos (inclusive referências entre *file structures*),
   acumula as transformações e associa a cada malha sua cor.
4. `viewer/main.js` recentra o modelo na origem (em precisão dupla, para não perder precisão
   com coordenadas grandes), monta as malhas no three.js e cuida da interação. Os painéis
   flutuam sobre o 3D e o modelo é centralizado na área que sobra entre eles.
5. Cada nó da árvore tem uma chave (o caminho de índices, como `0.3.12`); é ela, junto com a
   impressão digital do modelo, que liga um anexo à sua peça.

Os testes não dependem de arquivos reais: `scripts/lib/prc-writer.mjs` grava um PRC sintético
com o mesmo algoritmo de compressão de doubles do formato, e o leitor é verificado contra ele.
O servidor é testado em uma pasta temporária, incluindo tentativas de sair das pastas servidas.

## Créditos e licenças de terceiros

- [three.js](https://threejs.org/) (MIT) — renderização.
- Tabela de compressão de doubles do PRC derivada do projeto
  [Asymptote](https://asymptote.sourceforge.io/) (LGPL-3.0-or-later).

Detalhes em [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
