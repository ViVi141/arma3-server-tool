/**
 * electron-builder >= 26 strips node_modules from extraResources (hardcoded).
 * Restore staged service production deps after pack so the bundled Node service can start.
 */
const { cpSync, existsSync, mkdirSync } = require("node:fs");
const path = require("node:path");

module.exports = async function afterPack(context) {
  const resources =
    context.electronPlatformName === "darwin"
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          "Contents",
          "Resources",
        )
      : path.join(context.appOutDir, "resources");

  const stagedNm = path.join(__dirname, "electron-resources", "service", "node_modules");
  const destNm = path.join(resources, "service", "node_modules");

  if (!existsSync(stagedNm)) {
    throw new Error(`afterPack: staged service node_modules missing: ${stagedNm}`);
  }

  mkdirSync(path.dirname(destNm), { recursive: true });
  cpSync(stagedNm, destNm, { recursive: true, force: true });

  const fastifyPkg = path.join(destNm, "fastify", "package.json");
  if (!existsSync(fastifyPkg)) {
    throw new Error(`afterPack: fastify missing after restore at ${destNm}`);
  }

  console.log(`afterPack: restored service node_modules -> ${destNm}`);
};
