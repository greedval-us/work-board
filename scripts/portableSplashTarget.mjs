import path from 'node:path';
import electron from 'electron';
import { createElectronEnvironment, PROJECT_ROOT, runProcess, TemporaryDirectory } from './lib/runtime.mjs';

const GUI_INIT = [
  'Function .onGUIInit', '  InitPluginsDir', '', '  !ifdef SPLASH_IMAGE',
  '    File /oname=$PLUGINSDIR\\splash.bmp "${SPLASH_IMAGE}"',
  '    BgImage::SetBg $PLUGINSDIR\\splash.bmp', '    BgImage::Redraw', '  !endif', 'FunctionEnd',
].join('\n');

function replaceOnce(source, search, replacement) {
  const pieces = source.split(search);
  if (pieces.length !== 2) throw new Error('Unexpected electron-builder portable template near: ' + search.split('\n')[0]);
  return pieces.join(replacement);
}

export function themedPortableScript(source) {
  let script = source.replaceAll('\r\n', '\n');
  script = replaceOnce(script, '!include "common.nsh"', '!include "common.nsh"\n!include "${WORK_BOARD_SPLASH_INCLUDE}"');
  script = replaceOnce(script, GUI_INIT, 'Function .onGUIInit\n  Call ShowWorkBoardSplash\nFunctionEnd');
  return replaceOnce(script, '    BgImage::Destroy', '    Call CloseWorkBoardSplash');
}

const configured = new WeakSet();

// electron-builder's portable target uses its fixed portable.nsi and ignores
// nsis.include/script. Adapt only this target's final compiler input.
export function configurePortableSplash(target) {
  if (target.name !== 'portable' || configured.has(target)) return;
  if (typeof target.executeMakensis !== 'function') throw new Error('Unsupported electron-builder portable target.');
  const compile = target.executeMakensis.bind(target);
  target.executeMakensis = async (defines, commands, source, options) => {
    const script = themedPortableScript(source);
    const temporary = new TemporaryDirectory('work-board-portable-');
    try {
      const status = await runProcess(electron, [path.join(PROJECT_ROOT, 'scripts/renderPortableSplash.mjs'), temporary.directory], {
        cwd: PROJECT_ROOT, env: createElectronEnvironment(), stdio: 'inherit', timeoutMs: 120_000, label: 'Portable splash artwork',
      });
      if (status !== 0) throw new Error('Portable splash artwork generation failed (' + status + ').');
      const { preparePortableSplash } = await import('./lib/nativePortableSplash.mjs');
      const include = await preparePortableSplash(temporary.directory);
      return await compile({ ...defines, SPLASH_IMAGE: '1', WORK_BOARD_SPLASH_INCLUDE: include }, commands, script, options);
    } finally { temporary.remove(); }
  };
  configured.add(target);
}
