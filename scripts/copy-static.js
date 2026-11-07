// Kopiert HTML, CSS und das Logo nach dist/renderer (tsc kopiert nur kompilierte .ts-Dateien).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dst = path.join(root, 'dist', 'renderer');
fs.mkdirSync(dst, { recursive: true });

const files = [
  ['src/renderer/index.html', 'index.html'],
  ['src/renderer/styles.css', 'styles.css'],
  ['assets/logo.svg', 'logo.svg'],
];
for (const [from, to] of files) {
  fs.copyFileSync(path.join(root, from), path.join(dst, to));
}
console.log('Statische Dateien kopiert nach', dst);
