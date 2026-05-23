const { spawnSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPackMacSign(context) {
  if (context.electronPlatformName !== "darwin") return;

  const productName = context.packager.appInfo.productFilename || context.packager.appInfo.productName;
  const appPath = path.join(context.appOutDir, `${productName}.app`);

  const xattr = spawnSync("xattr", ["-cr", appPath], {
    stdio: "inherit"
  });

  if (xattr.status !== 0) {
    throw new Error(`Failed to clear Mac extended attributes at ${appPath}`);
  }

  const result = spawnSync("codesign", ["--force", "--deep", "--sign", "-", appPath], {
    stdio: "inherit"
  });

  if (result.status !== 0) {
    throw new Error(`Failed to ad-hoc sign Mac app bundle at ${appPath}`);
  }
};
