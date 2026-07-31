import { readFile, writeFile } from "node:fs/promises";

const sourceProfile = new URL("../PROFILE.md", import.meta.url);
const destinationProfile = new URL("../docs/profile.md", import.meta.url);
const generatedNotice =
  "<!-- Generated from /PROFILE.md by scripts/sync-profile-doc.mjs. Do not edit this copy. -->\n\n";

const profileContents = await readFile(sourceProfile, "utf8");
await writeFile(destinationProfile, `${generatedNotice}${profileContents}`);
