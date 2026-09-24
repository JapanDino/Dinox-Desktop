import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: bun run bump <major.minor.patch>");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function updateJson(relativePath) {
  const path = resolve(root, relativePath);
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
}

function updateCargoToml() {
  const path = resolve(root, "src-tauri/Cargo.toml");
  const content = readFileSync(path, "utf8");
  writeFileSync(path, content.replace(/^version = "[^"]*"/m, `version = "${version}"`));
}

function updateCargoLock() {
  const path = resolve(root, "src-tauri/Cargo.lock");
  const content = readFileSync(path, "utf8");
  writeFileSync(
    path,
    content.replace(/(\[\[package\]\]\r?\nname = "bloom"\r?\nversion = ")[^"]*(")/, `$1${version}$2`)
  );
}

updateJson("package.json");
updateJson("src-tauri/tauri.conf.json");
updateCargoToml();
updateCargoLock();

for (const file of ['src-tauri/app.manifest', 'packaging/AppxManifest.xml']) {
  const path=resolve(root,file);
  let text=readFileSync(path,'utf8');
  text=file.includes('AppxManifest') ? text.replace(/Version="\d+\.\d+\.\d+\.\d+"/,`Version="${version}.0"`) : text.replace(/assemblyIdentity version="[^"]+"/,`assemblyIdentity version="${version}.0"`);
  writeFileSync(path,text);
}

console.log(`Bumped package, Tauri, Cargo and Windows manifest versions to ${version}`);
