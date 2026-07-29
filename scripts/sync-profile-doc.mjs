import { readFile, writeFile } from "node:fs/promises";

const source = new URL("../PROFILE.md", import.meta.url);
const destination = new URL("../docs/profile.md", import.meta.url);
const generatedNotice =
  "<!-- Generated from /PROFILE.md by scripts/sync-profile-doc.mjs. Do not edit this copy. -->\n\n";

const profile = await readFile(source, "utf8");
await writeFile(destination, `${generatedNotice}${profile}`);
