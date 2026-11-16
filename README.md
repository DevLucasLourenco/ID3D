# ID3D

Visualizador de **PDF 3D (PRC)** no navegador, feito para tablet. Sem plugin, sem instalação no aparelho. Cada peça pode receber anexos (fotos, laudos, documentos) e ser marcada como verificada.

## Executar

Requer [Node.js](https://nodejs.org/) 22+.

```bash
npm install
npm start
```

Abra `http://127.0.0.1:8765/`. Modelo de teste: [`examples/exemplo.pdf`](examples/exemplo.pdf).

**No tablet** (mesma rede):

```bash
npm start -- --rede
```

Abra no tablet o endereço mostrado no terminal. PDFs em [`modelos/`](modelos/LEIAME.md) aparecem na tela inicial.

> Sem login: com `--rede`, qualquer um na rede acessa modelos e anexos. Use só em rede confiável.

**Offline, sem servidor** (sem anexos):

```bash
npm run build                        # dist/id3d.html
npm run build -- caminho/modelo.pdf  # dist/modelo-3d.html com o PDF embutido
```

## Uso

| Ação | Toque | Mouse / teclado |
| --- | --- | --- |
| Girar | 1 dedo | arrastar |
| Mover | 2 dedos | botão direito/meio |
| Zoom | pinça | rolagem |
| Selecionar | toque | clique |
| Centralizar órbita | dois toques | duplo clique |
| Enquadrar | **Enquadrar** | `F` |
| Ocultar / isolar | painel da peça | `H` / `I` |
| Mostrar tudo | menu **Mais** | `A` |
| Medir | **Medir** | `M` |

Anexos ficam em `anexos/<modelo>/` (fora do git). **Tirar foto** usa a câmera dentro do app em `https`/`localhost`; em `http` pela rede abre a câmera do tablet/celular (no Windows, use **Anexar arquivo**).

## Formatos

Suportado: PRC com tesselação, `.prc` avulso, árvore de peças, cores, transparência, vistas salvas.
Não suportado: tesselação comprimida, só B-rep, PMI/texturas, U3D, PDF criptografado.

## Desenvolvimento

```bash
npm run dev     # build + servidor com rebuild automático
npm test        # testes
npm run check   # lint + testes + build
npm run sample  # regenera examples/exemplo.pdf
```

## Licença

[MIT](LICENSE), exceto `src/core/prc-double-table.js` (LGPL-3.0-or-later, derivado do Asymptote). Usa [three.js](https://threejs.org/). Ver [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
