import { readFileSync, writeFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const manifestJson = JSON.parse(readFileSync("manifest.json", "utf8"));
const versionsJson = JSON.parse(readFileSync("versions.json", "utf8"));

const targetVersion = packageJson.version;

manifestJson.version = targetVersion;
versionsJson[targetVersion] = manifestJson.minAppVersion;

writeFileSync("manifest.json", `${JSON.stringify(manifestJson, null, 2)}\n`);
writeFileSync("versions.json", `${JSON.stringify(versionsJson, null, 2)}\n`);
