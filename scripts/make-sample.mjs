// Gera examples/exemplo.pdf: um PDF 3D sintetico para experimentar o visualizador.
//
//   npm run sample

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writePRC } from './lib/prc-writer.mjs';
import { wrapPDF } from './lib/pdf-writer.mjs';
import { sampleModel } from './lib/sample-model.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { model, views, title, subject } = sampleModel();
const pdf = wrapPDF(writePRC(model), { views, title, subject });
const file = path.join(root, 'examples', 'exemplo.pdf');
await mkdir(path.dirname(file), { recursive: true });
await writeFile(file, pdf);
console.log(`${path.relative(root, file)} gerado (${Math.round(pdf.length / 1024)} KB)`);
