const { pathToFileURL } = require("node:url");

async function main() {
  const entryArg = process.argv[2];
  if (!entryArg) {
    throw new Error("Missing API entry argument.");
  }
  const entryUrl = entryArg.startsWith("file://") ? entryArg : pathToFileURL(entryArg).href;
  await import(entryUrl);
}

main().catch((error) => {
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  console.error(detail);
  process.exit(1);
});
