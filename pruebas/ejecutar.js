/**
 * Ejecuta las pruebas de apps-script/Codigo.gs contra un simulacro de
 * Google Sheets que reproduce la estructura real de la plantilla.
 *
 *   node pruebas/ejecutar.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');

require('./simulacro.js'); // define los globales SpreadsheetApp, Utilities, etc.

const codigo = fs.readFileSync(path.join(raiz, 'apps-script', 'Codigo.gs'), 'utf8');
const casos = fs.readFileSync(path.join(__dirname, 'casos.js'), 'utf8');

vm.runInThisContext(codigo + '\n' + casos, { filename: 'Codigo.gs+casos.js' });

if (process.exitCode) {
  console.log('\nHay pruebas en rojo.');
} else {
  console.log('\nTodas las pruebas pasan.');
}
