# Avisos de terceiros

O ID3D inclui ou depende dos componentes abaixo. Os textos completos das licenças estão em
[`LICENSES/`](LICENSES/).

## Tabela de doubles do PRC — Asymptote

- **Arquivo:** `src/core/prc-double-table.js`
- **Origem:** `prc/PRCdouble.cc` do projeto [Asymptote](https://github.com/vectorgraphics/asymptote),
  que transcreve a tabela da documentação do formato PRC publicada pela Adobe.
- **Copyright:** (C) 2008 Orest Shardt e Michail Vidiassov.
- **Licença:** GNU Lesser General Public License, versão 3 ou posterior
  ([`LICENSES/LGPL-3.0-or-later.txt`](LICENSES/LGPL-3.0-or-later.txt), que complementa a
  [`LICENSES/GPL-3.0-or-later.txt`](LICENSES/GPL-3.0-or-later.txt)).
- **Modificações:** os dados foram convertidos para uma representação compacta em texto
  (base 36); os valores são os mesmos.

O arquivo é mantido separado do restante do código para que possa ser substituído ou
modificado de forma independente. O HTML gerado em `dist/` contém esse arquivo empacotado;
o código-fonte correspondente é o deste repositório.

O leitor do fluxo de bits (`src/core/bit-reader.js`) e o gravador usado nos testes
(`scripts/lib/prc-writer.mjs`) são implementações próprias, escritas a partir do comportamento
do formato; o Asymptote foi usado como referência para o esquema de compressão de doubles.

## three.js

- **Uso:** dependência de execução, empacotada no HTML gerado.
- **Copyright:** (C) 2010–2026 three.js authors.
- **Licença:** MIT ([`LICENSES/MIT-three.txt`](LICENSES/MIT-three.txt)).

## Ferramentas de desenvolvimento

esbuild (MIT), ESLint (MIT) e globals (MIT) são usados apenas para construir e verificar o
projeto; não fazem parte do HTML gerado.
