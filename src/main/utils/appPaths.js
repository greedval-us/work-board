import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The legacy CJS bundle lives in build/legacy; source modules live in src/main.
// Its build supplies the root so every runtime uses the same packaged assets.
const applicationRoot = typeof __WORK_BOARD_APP_ROOT__ === 'undefined'
  ? fileURLToPath(new URL('../../../', import.meta.url))
  : __WORK_BOARD_APP_ROOT__;

export function appPath(...segments) {
  return path.join(applicationRoot, ...segments);
}
