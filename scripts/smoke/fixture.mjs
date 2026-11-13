import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { addCalendarDays, localDate } from '../../src/shared/registry.js';

// Each smoke run owns its files and native dialog responses.
export function createSmokeFixture(userData, dialog, today = localDate()) {
  const firstFile = path.join(userData, 'selected-controls.sqlite');
  const secondFile = path.join(userData, 'another.sqlite');
  const exportFile = path.join(userData, 'filtered.xlsx');
  const controlCardFile = path.join(userData, 'control-card.docx');
  const attachmentSource = path.join(userData, 'Приложение к отчёту.txt');
  const downloadedFile = path.join(userData, 'downloaded.txt');
  writeFileSync(attachmentSource, 'Документ для задачи и указания.');
  const createFiles = [firstFile, secondFile];
  let openingFile = null;
  let cancelNextControlCardSave;
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
    const filePath = title.includes('Excel') ? exportFile
      : title.includes('вложение') ? downloadedFile : createFiles.shift();
    return { canceled: false, filePath };
  };
  dialog.showOpenDialog = async (_window, { title }) => {
    if (title === 'Прикрепить файлы') return { canceled: false, filePaths: [attachmentSource] };
    return openingFile ? { canceled: false, filePaths: [openingFile] } : { canceled: true, filePaths: [] };
  };
  const nextCheckpointCell = '.registry-table tbody td[data-column=nextCheckpoint]';
  const registrySelections = { source: 'Канцелярия', executor: 'Иванов И.И.' };
  const reportSelections = { department: 'Отдел контроля', executorPhone: '+7 900 555-01-23' };
  return {
    userData, firstFile, secondFile, exportFile, controlCardFile, attachmentSource, downloadedFile,
    today, originalDeadline: addCalendarDays(today, -1),
    firstCheckpointMark: 'Первый промежуточный контроль выполнен',
    nextCheckpointCell, nextCheckpointTime: `${nextCheckpointCell} time[datetime]`,
    nextCheckpointHeader: 'Ближайший промежуточный контроль',
    controlFrequencyCell: '.registry-table tbody td[data-column=controlFrequency]',
    controlFrequencyHeader: 'Промежуточный контроль',
    dailyControl: 'Ежедневно', customControl: 'Другое (даты вручную)', overdueColor: 'FFB32630',
    registrySelections, reportSelections, settingsSelections: { ...registrySelections, ...reportSelections },
    renamedSelections: { source: 'Секретариат', executor: 'Петров П.П.', department: 'Управление контроля', executorPhone: '103' },
    dialogs: {
      openDatabase(file) { openingFile = file; },
      cancelControlCardSave(pending) { cancelNextControlCardSave = pending; },
    },
  };
}
