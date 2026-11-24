import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { APP_APPEARANCE_STYLES } from '../../src/shared/constants/settings.js';

export async function preparePortableSplash(directory) {
  const { width, height, variants } = JSON.parse(await readFile(path.join(directory, 'layout.json'), 'utf8'));
  const styles = Object.keys(APP_APPEARANCE_STYLES);
  const folder = directory.replaceAll('$', () => '$$').replaceAll('"', '$\\"');
  const lines = [`!define WB_SPLASH_WIDTH ${width}`, `!define WB_SPLASH_HEIGHT ${height}`,
    '!macro ExtractWorkBoardSplash'];
  function assets(style, mode) {
    const key = `${style}-${mode}`;
    const bounds = variants[key];
    for (const value of [width, height, bounds.x, bounds.y, bounds.width, bounds.height]) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid splash layout: ' + key);
    }
    for (const ext of ['bmp', 'avi']) {
      lines.push(`File /oname=$PLUGINSDIR\\startup.${ext} "${path.join(folder, key + '.' + ext)}"`);
    }
    lines.push(`StrCpy $startupBarX ${bounds.x}`, `StrCpy $startupBarY ${bounds.y}`,
      `StrCpy $startupBarWidth ${bounds.width}`, `StrCpy $startupBarHeight ${bounds.height}`);
  }
  function modes(style) {
    lines.push('${If} $startupMode == "dark"');
    assets(style, 'dark');
    lines.push('${Else}');
    assets(style, 'light');
    lines.push('${EndIf}');
  }
  const customStyles = styles.filter(style => style !== 'standard');
  for (const [index, style] of customStyles.entries()) {
    lines.push(`${index === 0 ? '${If}' : '${ElseIf}'} $startupStyle == "${style}"`);
    modes(style);
  }
  lines.push('${Else}');
  modes('standard');
  lines.push('${EndIf}', '!macroend');
  const nativeScript = await readFile(new URL('../../packaging/portable-startup.nsh', import.meta.url), 'utf8');
  const filename = path.join(directory, 'startup.nsh');
  await writeFile(filename, lines.join('\n') + '\n' + nativeScript);
  return filename;
}
