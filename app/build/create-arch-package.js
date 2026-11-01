const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

module.exports = async function createArchInstaller({
  packageJSON,
  arch,
  buildDir,
  outputDir,
  spawn,
  writeFromTemplate,
}) {
  const archName = { x64: 'x86_64', arm64: 'aarch64' }[arch];
  if (!archName) throw new Error(`Unsupported Arch Linux architecture: ${arch}`);

  const linuxAssetsDir = path.join(buildDir, 'resources', 'linux');
  const contentsName = `${packageJSON.name}-linux-${arch}`;
  const archiveName = `${packageJSON.name}-${packageJSON.version}-${archName}.tar.gz`;
  const data = { ...packageJSON, arch: archName, contentsName, archiveName };
  writeFromTemplate(
    path.join(linuxAssetsDir, 'Mailspring.desktop.in'),
    data,
    packageJSON.desktopName
  );
  writeFromTemplate(
    path.join(linuxAssetsDir, 'mailspring.metainfo.xml.in'),
    data,
    `${packageJSON.name}.metainfo.xml`
  );

  const archDir = path.join(outputDir, 'arch');
  fs.mkdirSync(archDir, { recursive: true });
  const archivePath = path.join(archDir, archiveName);
  await spawn({
    cmd: 'tar',
    args: [
      '-czf',
      archivePath,
      '-C',
      outputDir,
      contentsName,
      packageJSON.desktopName,
      `${packageJSON.name}.metainfo.xml`,
      '-C',
      linuxAssetsDir,
      'icons',
    ],
  });
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(archivePath)) hash.update(chunk);
  const checksum = hash.digest('hex');
  writeFromTemplate(
    path.join(linuxAssetsDir, 'arch', 'PKGBUILD.in'),
    { ...data, checksum },
    'arch/PKGBUILD'
  );
  // Repacking a prebuilt app does not require its runtime dependencies on the build host.
  await spawn({ cmd: 'makepkg', args: ['--force', '--nodeps'], opts: { cwd: archDir } });
  console.log(`Created Arch Linux package in ${archDir}`);
};
