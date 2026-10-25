import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { NtExecutable, NtExecutableResource } from 'pe-library';
import { Data, Resource } from 'resedit';

const RESOURCE_LOCALE = { lang: 1033, codepage: 1200 };
const DEFAULT_ICON_GROUP = { id: 1, lang: RESOURCE_LOCALE.lang };

export function applyWindowsResources(bytes, { icon, productName, filename, version, companyName, copyright = '' }) {
  // Editing a vendor binary produces our unsigned application, never a binary
  // that claims the original vendor's signature. Signing is a separate step.
  const executable = NtExecutable.from(bytes, { ignoreCert: true });
  const resources = NtExecutableResource.from(executable);
  const icons = Data.IconFile.from(icon).icons.map(entry => entry.data);
  const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
  for (const group of groups.length ? groups : [DEFAULT_ICON_GROUP]) {
    Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icons);
  }
  const versions = Resource.VersionInfo.fromEntries(resources.entries);
  for (const info of versions.length ? versions : [Resource.VersionInfo.createEmpty()]) {
    info.setFileVersion(version, RESOURCE_LOCALE.lang);
    info.setProductVersion(version, RESOURCE_LOCALE.lang);
    info.setStringValues(RESOURCE_LOCALE, {
      FileDescription: productName, ProductName: productName,
      CompanyName: companyName, InternalName: productName, OriginalFilename: filename,
      LegalCopyright: copyright,
    });
    info.outputToResourceEntries(resources.entries);
  }
  resources.outputResource(executable);
  return Buffer.from(executable.generate());
}

export function editWindowsResources({ appOutDir, packager }) {
  const info = packager.appInfo;
  const filename = `${info.productFilename}.exe`;
  const executable = path.join(appOutDir, filename);
  const icon = readFileSync(new URL('../src/public/icons/app.ico', import.meta.url));
  const result = applyWindowsResources(readFileSync(executable), {
    icon, filename, productName: info.productName, version: info.version,
    companyName: info.companyName || info.productName,
    copyright: info.copyright,
  });
  writeFileSync(executable, result);
  console.log(`  • Windows icon and version embedded: ${filename}`);
}
