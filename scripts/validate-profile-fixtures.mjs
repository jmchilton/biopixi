import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixtures = join(root, "packages/core/test/fixtures/profile");
const binary = process.env.PIXI_BINARY ?? "pixi";
const pixiHome = mkdtempSync(join(tmpdir(), "biopixi-profile-fixtures-"));
const manifests = manifestsIn(fixtures).sort();

function manifestsIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return manifestsIn(path);
    }
    return entry.name === "pixi.toml" ? [path] : [];
  });
}

try {
  for (const manifest of manifests) {
    const result = spawnSync(
      binary,
      ["info", "--json", "--no-config", "--manifest-path", manifest],
      {
        encoding: "utf8",
        env: { ...process.env, PIXI_HOME: pixiHome },
      },
    );

    if (result.error !== undefined) {
      throw new Error(
        `could not run '${binary}' (${result.error.message}) — install Pixi from https://pixi.sh or point PIXI_BINARY at it`,
      );
    }
    if (result.status !== 0) {
      const relativeDirectory = dirname(manifest).slice(root.length);
      throw new Error(
        `${relativeDirectory} is not a valid Pixi project:\n${result.stderr || result.stdout}`,
      );
    }
  }
  console.log(`Pixi loaded ${manifests.length} profile fixtures successfully.`);
} finally {
  rmSync(pixiHome, { recursive: true, force: true });
}
