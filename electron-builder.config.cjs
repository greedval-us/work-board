module.exports = {
  appId: 'com.workboard.desktop',
  productName: 'Work Board',
  asar: true,
  directories: { output: 'release', buildResources: 'src/public' },
  files: ['build/main/**', 'build/renderer/**', 'src/main/**', 'src/shared/**', 'package.json'],
  // Resource editing uses pure JavaScript; the legacy winCodeSign archive
  // contains macOS symlinks that require extra privileges to unpack on Windows.
  afterPack: async (context) => {
    if (context.electronPlatformName === 'win32') {
      const { editWindowsResources } = await import('./scripts/windowsResources.mjs');
      editWindowsResources(context);
    }
  },
  win: { target: ['nsis', 'portable'], icon: 'src/public/icons/app.ico', signAndEditExecutable: false },
  mac: { icon: 'src/public/icons/app.icns' },
  linux: { icon: 'src/public/icons/app-512.png' },
  nsis: {
    oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true,
    installerIcon: 'src/public/icons/app.ico', uninstallerIcon: 'src/public/icons/app.ico',
  },
};
