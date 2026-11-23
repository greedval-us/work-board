const path = require('node:path');
const base = require('./electron-builder.config.cjs');

module.exports = {
  ...base,
  electronVersion: '22.3.27',
  directories: {
    app: '.cache/legacy-win32/app',
    output: 'release/legacy-win32',
    buildResources: path.join(__dirname, 'src/public'),
  },
  files: [...base.files, 'build/legacy/main.cjs'],
  asarUnpack: ['node_modules/better-sqlite3/build/Release/*.node'],
  // prepareLegacyWindows installs the pinned Electron ABI 110 / ia32 prebuild.
  npmRebuild: false,
  win: { ...base.win, target: [{ target: 'nsis', arch: ['ia32'] }, { target: 'portable', arch: ['ia32'] }] },
  nsis: { ...base.nsis, artifactName: 'Work Board Setup ${version}-win7-10-ia32.${ext}' },
  portable: { artifactName: 'Work Board ${version}-win7-10-ia32.${ext}' },
};
