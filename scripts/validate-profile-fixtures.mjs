import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const fixtureRoot = join(repositoryRoot, "packages/core/test/fixtures/profile");
const pixiBinary = process.env.PIXI_BINARY ?? "pixi";
const pixiHome = mkdtempSync(join(tmpdir(), "biopixi-profile-fixtures-"));
const manifestPaths = findManifests(fixtureRoot).sort();

function findManifests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return findManifests(path);
    }
    return entry.name === "pixi.toml" ? [path] : [];
  });
}

try {
  for (const manifestPath of manifestPaths) {
    const pixiProcess = spawnSync(
      pixiBinary,
      ["info", "--json", "--no-config", "--manifest-path", manifestPath],
      {
        encoding: "utf8",
        env: { ...process.env, PIXI_HOME: pixiHome },
      },
    );

    if (pixiProcess.error !== undefined) {
      throw new Error(
        `could not run '${pixiBinary}' (${pixiProcess.error.message}) — install Pixi from https://pixi.sh or point PIXI_BINARY at it`,
      );
    }
    if (pixiProcess.status !== 0) {
      const relativeDirectory = dirname(manifestPath).slice(repositoryRoot.length);
      throw new Error(
        `${relativeDirectory} is not a valid Pixi project:\n${pixiProcess.stderr || pixiProcess.stdout}`,
      );
    }
  }
  console.log(`Pixi loaded ${manifestPaths.length} profile fixtures successfully.`);
} finally {
  rmSync(pixiHome, { recursive: true, force: true });
}
