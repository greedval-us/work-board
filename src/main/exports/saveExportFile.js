import { writeAtomicFile } from '../files/atomicFile.js';
import { openSavedFile } from '../files/openSavedFile.js';

export async function saveExportFile(
  { dialog, getWindow, openPath, assertUnlocked = () => {} },
  { title, defaultName, fileType, extension, createContents, getDatabasePaths, assertGeneration },
) {
  const suffix = `.${extension}`;
  const result = await dialog.showSaveDialog(getWindow(), {
    title, defaultPath: defaultName + suffix,
    filters: [{ name: fileType, extensions: [extension] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  assertUnlocked();
  if (result.canceled || !result.filePath) return { cancelled: true };
  assertGeneration?.();

  const selected = result.filePath.toLowerCase().endsWith(suffix) ? result.filePath : result.filePath + suffix;
  const contents = await createContents();
  const filePath = await writeAtomicFile(selected, contents, {
    getDatabasePaths,
    assertCurrent() {
      assertUnlocked();
      assertGeneration?.();
    },
  });
  const opened = await openSavedFile(filePath, openPath);
  return { cancelled: false, filePath, opened };
}
