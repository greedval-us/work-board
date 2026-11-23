export async function openSavedFile(filePath, openPath) {
  try {
    // Electron returns an empty string when the file was handed to the default app.
    return (await openPath?.(filePath)) === '';
  } catch {
    return false;
  }
}
