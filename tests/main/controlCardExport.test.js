import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import JSZip from 'jszip';
import { ControlCardExportService } from '../../src/main/services/ControlCardExportService.js';
import { AppError } from '../../src/main/utils/AppError.js';

async function fixture(t) {
  const directory = await realpath(await mkdtemp(path.join(tmpdir(), 'work-board-f21-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const database = {
    filePath: path.join(directory, 'work.docx'), generation: 1,
    assertGeneration(generation) {
      if (generation !== this.generation) throw new AppError('Активная база изменилась.', 'DATABASE_CHANGED');
    },
  };
  await writeFile(database.filePath, 'рабочая база');
  const record = { id: 3, instructionNumber: '001/К', title: 'Проверка', controlSchedule: {
    marks: [{ date: '2026-11-11', text: 'Результат проверки' }],
  } };
  const selected = path.join(directory, 'report');
  const dialog = { showSaveDialog: async () => ({ filePath: selected }) };
  const instructions = { get: id => id === record.id ? record : null };
  const service = new ControlCardExportService({ database, instructions, dialog, getWindow: () => null });
  return { database, directory, dialog, record, selected, service };
}

test('saving a Ф‑21 exports report overrides and saved checks without changing the record', async (t) => {
  const { directory, record, selected, service } = await fixture(t);
  const filePath = `${selected}.docx`;
  const result = await service.export({ id: 3, generation: 1, fields: { instructionNumber: '', officePhone: '112-23' } });
  assert.deepEqual(result, { cancelled: false, filePath });
  const zip = await JSZip.loadAsync(await readFile(filePath));
  const xml = await zip.file('word/document.xml').async('string');
  assert.match(xml, /112-23/);
  assert.match(xml, /Результат проверки/);
  assert.doesNotMatch(xml, /001\/К/);
  assert.equal(record.instructionNumber, '001/К');
  assert.deepEqual((await readdir(directory)).sort(), ['report.docx', 'work.docx']);
});

test('Ф‑21 cancellation and a database switch during destination selection leave no report', async (t) => {
  const { database, directory, dialog, selected, service } = await fixture(t);
  dialog.showSaveDialog = async () => ({ canceled: true });
  assert.deepEqual(await service.export({ id: 3, generation: 1 }), { cancelled: true });
  dialog.showSaveDialog = async () => {
    database.generation = 2;
    return { filePath: selected };
  };
  await assert.rejects(service.export({ id: 3, generation: 1 }), { code: 'DATABASE_CHANGED' });
  assert.deepEqual(await readdir(directory), ['work.docx']);
});

test('Ф‑21 refuses to replace the active database even with a .docx extension', async (t) => {
  const { database, dialog, service } = await fixture(t);
  dialog.showSaveDialog = async () => ({ filePath: database.filePath });
  await assert.rejects(service.export({ id: 3, generation: 1 }), { code: 'VALIDATION' });
  assert.equal(await readFile(database.filePath, 'utf8'), 'рабочая база');
});
