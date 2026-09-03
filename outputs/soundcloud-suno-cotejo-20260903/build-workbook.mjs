import fs from 'node:fs/promises';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const root = '/Users/blackmamba/Documents/ChatGPT/MusicaSoundcloud';
const outputDir = `${root}/outputs/soundcloud-suno-cotejo-20260903`;
const data = JSON.parse(await fs.readFile(`${root}/reports/soundcloud-suno-match-catalog.json`, 'utf8'));
const workbook = Workbook.create();
const dashboard = workbook.worksheets.add('Resumen');
const match = workbook.worksheets.add('Cotejo');
const sources = workbook.worksheets.add('Fuentes');
const lastRow = data.rows.length + 4;

const colors = {
  ink: '#121217', paper: '#F7F7FA', white: '#FFFFFF', muted: '#6B7280', line: '#D9DCE3',
  soundcloud: '#FF5500', soundcloudSoft: '#FFF0E8', suno: '#7C3AED', sunoSoft: '#F1EAFE',
  green: '#14804A', greenSoft: '#E8F7EF', amber: '#B45309', amberSoft: '#FFF4D6', red: '#B42318', redSoft: '#FDECEC',
};

dashboard.showGridLines = false;
dashboard.getRange('A1:H2').merge();
dashboard.getRange('A1').values = [['COTEJO MAESTRO · SOUNDCLOUD × SUNO']];
dashboard.getRange('A1:H2').format = { fill: colors.ink, font: { color: colors.white, bold: true, size: 22 }, verticalAlignment: 'center', horizontalAlignment: 'left' };
dashboard.getRange('A3:H3').merge();
dashboard.getRange('A3').values = [['Control de duplicados, versiones, género, instrumental/letras y validación por forma de onda.']];
dashboard.getRange('A3:H3').format = { fill: colors.ink, font: { color: '#C7CBD3', italic: true }, verticalAlignment: 'center' };

const cards = [
  ['☁ SoundCloud', `=COUNTA('Cotejo'!$B$5:$B$${lastRow})`],
  ['✦ Con candidato Suno', `=COUNTA('Cotejo'!$J$5:$J$${lastRow})`],
  ['Alta confianza', `=COUNTIF('Cotejo'!$S$5:$S$${lastRow},"Alta")+COUNTIF('Cotejo'!$S$5:$S$${lastRow},"Alta: cotejo previo")`],
  ['Revisión manual', `=COUNTIF('Cotejo'!$V$5:$V$${lastRow},"Revisar")`],
];
for (let i = 0; i < cards.length; i += 1) {
  const col = i * 2;
  const range = dashboard.getRangeByIndexes(4, col, 3, 2);
  range.format = { fill: i === 0 ? colors.soundcloudSoft : i === 1 ? colors.sunoSoft : colors.white, borders: { preset: 'outside', style: 'thin', color: colors.line } };
  dashboard.getCell(4, col).values = [[cards[i][0]]];
  dashboard.getCell(4, col).format = { font: { bold: true, color: colors.muted, size: 10 } };
  dashboard.getCell(5, col).formulas = [[cards[i][1]]];
  dashboard.getCell(5, col).format = { font: { bold: true, color: colors.ink, size: 22 }, numberFormat: '#,##0' };
}
dashboard.getRange('A9:H9').merge();
dashboard.getRange('A9').values = [['Cómo leer el cotejo']];
dashboard.getRange('A9:H9').format = { fill: colors.ink, font: { color: colors.white, bold: true, size: 13 } };
dashboard.getRange('A10:H14').values = [
  ['Regla', 'Interpretación', null, null, null, null, null, null],
  ['ID/cotejo previo', 'La evidencia más fuerte disponible; aun requiere escuchar o comparar huella antes de aplicar cambios.', null, null, null, null, null, null],
  ['Nombre + duración', 'Genera candidatos, no confirmaciones. Los títulos pueden cambiar y dos audios distintos pueden durar lo mismo.', null, null, null, null, null, null],
  ['Forma de onda / huella', 'Verificación independiente pendiente para desempatar versiones con duración similar.', null, null, null, null, null, null],
  ['Instrumental', 'Ausencia de letra no cuenta como error cuando Suno o la escucha indiquen que la pieza es instrumental.', null, null, null, null, null, null],
];
dashboard.getRange('A10:A14').format = { font: { bold: true }, fill: '#ECEEF3' };
dashboard.getRange('B10:H14').merge(true);
dashboard.getRange('A10:H14').format.wrapText = true;
dashboard.getRange('A10:H14').format.borders = { preset: 'inside', style: 'thin', color: colors.line };
dashboard.getRange('A:A').format.columnWidth = 21;
dashboard.getRange('B:H').format.columnWidth = 15;
dashboard.getRange('B:B').format.columnWidth = 26;
dashboard.getRange('A10:H14').format.rowHeight = 34;

match.showGridLines = false;
match.freezePanes.freezeRows(4);
match.freezePanes.freezeColumns(3);
match.getRange('A1:Z1').merge();
match.getRange('A1').values = [['COTEJO CANCIÓN POR CANCIÓN']];
match.getRange('A1:Z1').format = { fill: colors.ink, font: { color: colors.white, bold: true, size: 18 }, rowHeight: 34, verticalAlignment: 'center' };
match.getRange('A2:G2').merge();
match.getRange('A2').values = [['☁  SOUNDCLOUD']];
match.getRange('A2:G2').format = { fill: colors.soundcloud, font: { color: colors.white, bold: true, size: 14 }, horizontalAlignment: 'center' };
match.getRange('H2:H3').merge();
match.getRange('H2').values = [['⇄']];
match.getRange('H2:H3').format = { fill: colors.ink, font: { color: colors.white, bold: true, size: 16 }, horizontalAlignment: 'center', verticalAlignment: 'center' };
match.getRange('I2:Q2').merge();
match.getRange('I2').values = [['✦  SUNO']];
match.getRange('I2:Q2').format = { fill: colors.suno, font: { color: colors.white, bold: true, size: 14 }, horizontalAlignment: 'center' };
match.getRange('R2:Z2').merge();
match.getRange('R2').values = [['VERIFICACIÓN Y DECISIÓN']];
match.getRange('R2:Z2').format = { fill: '#31313B', font: { color: colors.white, bold: true, size: 13 }, horizontalAlignment: 'center' };
match.getRange('A3:G3').merge();
match.getRange('A3').values = [['ID, nombre, duración, género, faltantes y onda remota']];
match.getRange('A3:G3').format = { fill: colors.soundcloudSoft, font: { color: colors.soundcloud, italic: true }, horizontalAlignment: 'center' };
match.getRange('I3:Q3').merge();
match.getRange('I3').values = [['ID, nombre, duración, estilo, letra/instrumental y página de origen']];
match.getRange('I3:Q3').format = { fill: colors.sunoSoft, font: { color: colors.suno, italic: true }, horizontalAlignment: 'center' };
match.getRange('R3:Z3').merge();
match.getRange('R3').values = [['La misma duración nunca confirma por sí sola una coincidencia']];
match.getRange('R3:Z3').format = { fill: '#ECEEF3', font: { color: colors.red, italic: true, bold: true }, horizontalAlignment: 'center' };

const headers = ['SC', 'SoundCloud ID', 'Título SoundCloud', 'Duración SC', 'Género SC', 'Faltantes', 'Waveform SC', '⇄', 'Suno', 'Suno ID', 'Título Suno', 'Duración Suno', 'Δ segundos', 'Similitud título', 'Estilo / género Suno', 'Letra / instrumental', 'Página Suno', 'Estado onda', 'Confianza', 'Método', 'Advertencia', 'Decisión', 'URL SoundCloud', 'URL Suno', 'Existe en USB', 'Segundo candidato'];
match.getRange('A4:Z4').values = [headers];
match.getRange('A4:Z4').format = { fill: colors.ink, font: { color: colors.white, bold: true, size: 9 }, wrapText: true, verticalAlignment: 'center', rowHeight: 34, borders: { preset: 'inside', style: 'thin', color: '#3E3E48' } };

const values = data.rows.map((row) => {
  const lyricRaw = row.suno?.lyricsStatus || '';
  const lyricState = lyricRaw === 'instrumental' || row.suno?.style?.toLowerCase().includes('instrumental')
    ? 'Instrumental'
    : lyricRaw === 'available' ? 'Letra disponible' : lyricRaw === 'not_exposed' ? 'Sin datos' : 'Por revisar';
  return [
    '☁', row.soundcloud.id, row.soundcloud.title, row.soundcloud.durationSeconds, row.soundcloud.genre || '',
    row.soundcloud.missing.join(', '), row.soundcloud.waveformUrl || '', '⇄', row.suno ? '✦' : '',
    row.suno?.id || null, row.suno?.title || null, row.suno?.durationSeconds ?? null, null,
    row.match.titleSimilarity, row.suno?.style || '', lyricState, row.suno?.page ?? null,
    row.match.waveformStatus, row.match.confidence, row.match.method, row.match.warning, row.match.decision,
    row.soundcloud.url || null, row.suno?.url || null, row.local ? 'Sí' : 'No', row.secondCandidate ? `${row.secondCandidate.title} · ${row.secondCandidate.durationSeconds ?? '?'} s` : null,
  ];
});
match.getRange(`A5:Z${lastRow}`).values = values;
match.getRange('M5').formulas = [['=IF(OR(D5="",L5=""),"",ABS(D5-L5))']];
match.getRange(`M5:M${lastRow}`).fillDown();
match.getRange(`D5:D${lastRow}`).format.numberFormat = '0.0';
match.getRange(`L5:M${lastRow}`).format.numberFormat = '0.0';
match.getRange(`N5:N${lastRow}`).format.numberFormat = '0%';
match.getRange(`A5:A${lastRow}`).format = { font: { color: colors.soundcloud, bold: true, size: 14 }, horizontalAlignment: 'center' };
match.getRange(`I5:I${lastRow}`).format = { font: { color: colors.suno, bold: true, size: 14 }, horizontalAlignment: 'center' };
match.getRange(`H5:H${lastRow}`).format = { fill: '#F0F1F5', font: { color: colors.muted }, horizontalAlignment: 'center' };
match.getRange(`A5:G${lastRow}`).format.fill = '#FFFAF7';
match.getRange(`I5:Q${lastRow}`).format.fill = '#FCFAFF';
match.getRange(`R5:Z${lastRow}`).format.fill = colors.white;
match.getRange(`C5:C${lastRow}`).format.font = { bold: true };
match.getRange(`K5:K${lastRow}`).format.font = { bold: true };
match.getRange(`F5:F${lastRow}`).format.wrapText = true;
match.getRange(`O5:U${lastRow}`).format.wrapText = true;
match.getRange(`V5:V${lastRow}`).dataValidation = { rule: { type: 'list', values: ['Revisar', 'Confirmado', 'No coincide', 'Otra versión', 'Duplicado'] } };
match.getRange(`S5:S${lastRow}`).conditionalFormats.add('beginsWith', { text: 'Alta', format: { fill: colors.greenSoft, font: { color: colors.green, bold: true } } });
match.getRange(`S5:S${lastRow}`).conditionalFormats.add('cellIs', { operator: 'equal', formula: '"Media"', format: { fill: colors.amberSoft, font: { color: colors.amber, bold: true } } });
match.getRange(`S5:S${lastRow}`).conditionalFormats.add('cellIs', { operator: 'equal', formula: '"Baja"', format: { fill: colors.redSoft, font: { color: colors.red } } });
match.getRange(`V5:V${lastRow}`).conditionalFormats.add('cellIs', { operator: 'equal', formula: '"Confirmado"', format: { fill: colors.greenSoft, font: { color: colors.green, bold: true } } });
match.getRange(`A4:Z${lastRow}`).format.borders = { insideHorizontal: { style: 'thin', color: '#E7E8EC' } };
match.tables.add(`A4:Z${lastRow}`, true, 'CotejoMaestro');

const widths = [5, 18, 30, 12, 14, 22, 22, 5, 6, 38, 30, 12, 11, 13, 28, 18, 11, 25, 19, 20, 30, 17, 31, 31, 12, 32];
widths.forEach((width, index) => { match.getRangeByIndexes(0, index, lastRow, 1).format.columnWidth = width; });
match.getRange(`A5:Z${lastRow}`).format.rowHeight = 28;

sources.showGridLines = false;
sources.getRange('A1:D2').merge();
sources.getRange('A1').values = [['FUENTES Y TRAZABILIDAD']];
sources.getRange('A1:D2').format = { fill: colors.ink, font: { color: colors.white, bold: true, size: 18 }, verticalAlignment: 'center' };
sources.getRange('A4:D4').values = [['Fuente', 'Ruta', 'Registros', 'Uso']];
sources.getRange('A4:D4').format = { fill: '#31313B', font: { color: colors.white, bold: true } };
sources.getRange('A5:D10').values = [
  ['SoundCloud API', `${root}/reports/soundcloud-metadata-audit.json`, data.summary.soundcloudTracks, 'Catálogo remoto vigente'],
  ['Suno enriquecido', data.sources.suno, 2168, 'ID, nombre, duración, estilo, audio, portada y letras'],
  ['Páginas Suno', '/Users/blackmamba/Documents/Codex/2026-08-29/va/work/Reproductor/suno-pages/', 467, 'Trazabilidad de página histórica'],
  ['Cotejo anterior', data.sources.oldAudit, 500, 'Candidatos previamente encontrados'],
  ['Cola recuperación', data.sources.recovery, 80, 'Coincidencias fuertes revisadas anteriormente'],
  ['Biblioteca USB', data.sources.usbLibrary, 788, 'Audio, portada, letras, SHA-256 y carpetas locales'],
];
sources.getRange('A12:D12').values = [['Campo', 'Valor', 'Definición', 'Acción']];
sources.getRange('A12:D12').format = { fill: '#31313B', font: { color: colors.white, bold: true } };
sources.getRange('A13:D18').values = [
  ['Alta confianza', data.summary.highConfidence, 'ID/cotejo previo o nombre y duración muy consistentes', 'Validar onda/escucha y confirmar'],
  ['Media confianza', data.summary.mediumConfidence, 'Evidencia parcial', 'Revisar segundo candidato'],
  ['Baja confianza', data.summary.lowConfidence, 'Solo candidato aproximado', 'No aplicar automáticamente'],
  ['Sin candidato', data.summary.withoutCandidate, 'No se encontró una pareja razonable', 'Buscar manualmente'],
  ['Onda pendiente', data.summary.waveformPending, 'Existe candidato pero falta huella acústica', 'Comparar audio'],
  ['Enlazadas al USB', data.summary.linkedToUsb, 'SoundCloud ID presente en catálogo USB', 'Usar audio local como referencia'],
];
sources.getRange('A4:D18').format.borders = { insideHorizontal: { style: 'thin', color: colors.line } };
sources.getRange('A:A').format.columnWidth = 24;
sources.getRange('B:B').format.columnWidth = 72;
sources.getRange('C:C').format.columnWidth = 14;
sources.getRange('D:D').format.columnWidth = 42;
sources.getRange('A4:D18').format.wrapText = true;
sources.freezePanes.freezeRows(4);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}/Cotejo_Maestro_SoundCloud_Suno.xlsx`);

const inspect = await workbook.inspect({ kind: 'table', range: 'Cotejo!A1:Z12', include: 'values,formulas', tableMaxRows: 12, tableMaxCols: 26 });
console.log(inspect.ndjson);
const errors = await workbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A', options: { useRegex: true, maxResults: 100 }, summary: 'formula errors' });
console.log(errors.ndjson);
for (const [sheetName, range] of [['Resumen', 'A1:H14'], ['Cotejo', 'A1:Z16'], ['Fuentes', 'A1:D18']]) {
  const preview = await workbook.render({ sheetName, range, scale: 1.2, format: 'png' });
  await fs.writeFile(`${outputDir}/preview-${sheetName.toLowerCase()}.png`, new Uint8Array(await preview.arrayBuffer()));
}
