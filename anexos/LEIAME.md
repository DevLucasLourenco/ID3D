# anexos/

Aqui o servidor do ID3D guarda os arquivos anexados às peças dos modelos.

```
anexos/<modelo>/index.json     registro dos anexos (peça, nome, situação, observação, datas)
anexos/<modelo>/<id>-<nome>    os arquivos em si
```

`<modelo>` é a impressão digital do modelo 3D, calculada pelo visualizador a partir do
conteúdo do arquivo: o mesmo PDF sempre cai na mesma pasta, e um PDF reexportado cai em outra.

O conteúdo desta pasta **não vai para o git** (veja `.gitignore`): anexos costumam ser
documentos internos e este repositório é público. Faça a cópia de segurança por outro meio.
