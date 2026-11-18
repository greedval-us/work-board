import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { addCalendarDays, localDate } from '../../src/shared/registry.js';

// Each smoke run owns its files and native dialog responses.
export function createSmokeFixture(userData, dialog, today = localDate()) {
  const firstFile = path.join(userData, 'selected-controls.sqlite');
  const secondFile = path.join(userData, 'another.sqlite');
  const exportFile = path.join(userData, 'filtered.xlsx');
  const shortExportFile = path.join(userData, 'short-filtered.xlsx');
  const controlCardFile = path.join(userData, 'control-card.docx');
  const createFiles = [firstFile, secondFile];
  let openingFile = null;
  let cancelNextControlCardSave;
  let failOpen = false;
  const openRequests = [];
  dialog.showSaveDialog = async (_window, { title, filters }) => {
    if (filters?.some(filter => filter.extensions.includes('docx'))) {
      if (cancelNextControlCardSave) {
        const cancelled = cancelNextControlCardSave;
        cancelNextControlCardSave = undefined;
        await cancelled;
        return { canceled: true };
      }
      return { canceled: false, filePath: controlCardFile };
    }
    const filePath = title === 'Выгрузить краткий отчёт в Excel' ? shortExportFile
      : title.includes('Excel') ? exportFile : createFiles.shift();
    return { canceled: false, filePath };
  };
  dialog.showOpenDialog = async () => openingFile
    ? { canceled: false, filePaths: [openingFile] } : { canceled: true, filePaths: [] };
  async function openPath(filePath) {
    assert.equal(readFileSync(filePath).subarray(0, 4).toString('hex'), '504b0304');
    openRequests.push(filePath);
    if (!failOpen) return '';
    failOpen = false;
    return 'Не удалось найти приложение для тестового файла.';
  }
  const nextCheckpointCell = '.registry-table tbody td[data-column=nextCheckpoint]';
  const registrySelections = { documentType: 'Письмо', source: 'Канцелярия', executor: 'Иванов И.И.' };
  const reportSelections = { department: 'Отдел контроля', executorPhone: '+7 900 555-01-23' };
  return {
    userData, firstFile, secondFile, exportFile, shortExportFile, controlCardFile,
    openRequests, openPath,
    failNextOpen() { failOpen = true; },
    today, originalDeadline: addCalendarDays(today, -1),
    firstCheckpointMark: 'Первый промежуточный контроль выполнен',
    nextCheckpointCell, nextCheckpointTime: `${nextCheckpointCell} time[datetime]`,
    nextCheckpointHeader: 'Ближайший промежуточный контроль',
    controlFrequencyCell: '.registry-table tbody td[data-column=controlFrequency]',
    controlFrequencyHeader: 'Промежуточный контроль',
    dailyControl: 'Ежедневно', customControl: 'Другое (даты вручную)',
    registrySelections, reportSelections, settingsSelections: { ...registrySelections, ...reportSelections },
    historicalDocumentType: 'Акт',
    controlCardOffice: 'Канцелярия, 101',
    alternateOffice: 'Приёмная, 204',
    renamedSelections: { documentType: 'Служебное письмо', source: 'Секретариат', executor: 'Петров П.П.', department: 'Управление контроля', executorPhone: '103' },
    dialogs: {
      openDatabase(file) { openingFile = file; },
      cancelControlCardSave(pending) { cancelNextControlCardSave = pending; },
    },
  };
}
