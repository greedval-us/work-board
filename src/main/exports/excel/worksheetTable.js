import { WORKBOOK_CONFIG as config } from './workbookConfig.js';

const FONT = { name: config.FONT_NAME, size: config.FONT_SIZE };
const ALIGNMENT = { vertical: 'top', wrapText: true };
const BORDER_EDGE = { style: 'thin', color: { argb: config.TABLE_BORDER_COLOR } };
const TABLE_BORDER = { top: BORDER_EDGE, right: BORDER_EDGE, bottom: BORDER_EDGE, left: BORDER_EDGE };
const BOLD_WIDTH_SCALE = 1.08;
const NARROW_GLYPHS = /[ .,:;!|il]/u;
const WIDE_GLYPHS = /[MW@%ЖМФШЩЮжмфшщю]/u;
const FULLWIDTH_GLYPHS = /[\u2e80-\u9fff\uac00-\ud7af\uff01-\uff60\u{1f300}-\u{1faff}]/u;

function textLines(value) {
  return String(value ?? '').split(/\r\n?|\n/);
}

function lineWidth(text) {
  let units = 0;
  for (const glyph of text) {
    if (glyph === '\t') units += 4;
    else if (NARROW_GLYPHS.test(glyph)) units += 0.55;
    else if (WIDE_GLYPHS.test(glyph)) units += 1.4;
    else if (FULLWIDTH_GLYPHS.test(glyph)) units += 2;
    else units++;
  }
  // Excel measures column widths using the default 11-point font.
  return units * config.FONT_SIZE / 11;
}

function wrappedLines(text, width) {
  let lines = 1;
  let available = width;
  for (const token of text.match(/\S+|\s+/g) ?? []) {
    const tokenWidth = lineWidth(token);
    if (token.trim() && tokenWidth > available) {
      if (available < width) lines++;
      const extraLines = Math.ceil(tokenWidth / width) - 1;
      lines += extraLines;
      available = width - (tokenWidth - extraLines * width);
    } else {
      available = Math.max(0, available - tokenWidth);
    }
  }
  return lines;
}

export function fitTable(sheet) {
  const filterPadding = sheet.autoFilter ? config.FILTER_PADDING : 0;
  const widths = sheet.columns.map(({ header }) => lineWidth(header) * BOLD_WIDTH_SCALE + config.CELL_PADDING + filterPadding);
  sheet.eachRow((row, index) => {
    if (index === config.HEADER_ROW) return;
    row.eachCell((cell, column) => {
      for (const line of textLines(cell.value)) {
        widths[column - 1] = Math.max(widths[column - 1], lineWidth(line) + config.CELL_PADDING);
      }
    });
  });
  for (let index = 0; index < widths.length; index++) {
    widths[index] = Math.max(config.MIN_COLUMN_WIDTH, Math.min(config.MAX_COLUMN_WIDTH, Math.ceil(widths[index])));
    sheet.getColumn(index + 1).width = widths[index];
  }
  sheet.eachRow((row, index) => {
    const isHeader = index === config.HEADER_ROW;
    let lines = 1;
    for (let column = 0; column < widths.length; column++) {
      const cell = row.getCell(column + 1);
      cell.border = TABLE_BORDER;
      const width = widths[column] - config.CELL_PADDING - (isHeader ? filterPadding : 0);
      const capacity = isHeader ? width / BOLD_WIDTH_SCALE : width;
      const height = textLines(cell.value).reduce((count, line) => count + wrappedLines(line, capacity), 0);
      lines = Math.max(lines, height);
    }
    row.height = Math.min(config.MAX_ROW_HEIGHT, lines * config.LINE_HEIGHT + config.ROW_PADDING);
  });
}

export function addTableSheet(workbook, name, columns, { autoFilter = false } = {}) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns.map(({ key, label }) => ({ key, header: label }));
  const header = sheet.getRow(config.HEADER_ROW);
  header.alignment = ALIGNMENT;
  header.font = { ...FONT, bold: true };

  if (autoFilter) {
    sheet.views = [{ state: 'frozen', ySplit: config.HEADER_ROW }];
    sheet.autoFilter = { from: { row: config.HEADER_ROW, column: 1 }, to: { row: config.HEADER_ROW, column: columns.length } };
    header.font = { ...header.font, color: { argb: config.HEADER_TEXT_COLOR } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: config.HEADER_FILL_COLOR } };
  }
  return sheet;
}

export function addTableRow(sheet, values) {
  const row = sheet.addRow(values);
  row.alignment = ALIGNMENT;
  row.font = FONT;
  return row;
}
