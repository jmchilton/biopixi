import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CondaBuildPlanError, planCondaBuild } from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));

function project(manifest: string, lock?: string): string {
  const directory = mkdtempSync(join(tmpdir(), "biopixi-plan-"));
  writeFileSync(join(directory, "pixi.toml"), manifest);
  if (lock !== undefined) {
    writeFileSync(join(directory, "pixi.lock"), lock);
  }
  return directory;
}

describe("planCondaBuild", () => {
  it("projects sorted, build-pinned direct roots from the L3 fixture", () => {
    const directory = join(root, "examples/l3-ecosystem-ready");
    expect(planCondaBuild(directory)).toEqual({
      projectRoot: directory,
      platform: "linux-64",
      channels: ["conda-forge", "bioconda"],
      targets: [
        {
          name: "bamtools",
          version: "2.5.2",
          build: "hdcf5f25_5",
          source: "https://conda.anaconda.org/bioconda/linux-64/bamtools-2.5.2-hdcf5f25_5.tar.bz2",
        },
        {
          name: "samtools",
          version: "1.17",
          build: "hd87286a_2",
          source: "https://conda.anaconda.org/bioconda/linux-64/samtools-1.17-hd87286a_2.tar.bz2",
        },
      ],
    });
  });

  it("applies target overrides, preserves qualifiers, and deduplicates channels in order", () => {
    const directory = project(
      `[workspace]
channels = ["conda-forge", "ome", "conda-forge"]
platforms = ["linux-64"]

[dependencies]
zlib = "1.3.*"
bioformats2raw = "*"

[target.linux-64.dependencies]
bioformats2raw = { version = "==0.7.0", channel = "ome" }
`,
      `environments:
  default:
    packages:
      linux-64:
        - conda: https://conda.anaconda.org/conda-forge/linux-64/zlib-1.3.1-hb9d3cd8_2.conda
        - conda: https://conda.anaconda.org/ome/linux-64/bioformats2raw-0.7.0-0.tar.bz2
`,
    );

    const plan = planCondaBuild(directory, { minimumLevel: 2 });
    expect(plan.channels).toEqual(["conda-forge", "ome"]);
    expect(
      plan.targets.map(({ name, version, build, channel }) => ({
        name,
        version,
        build,
        channel,
      })),
    ).toEqual([
      { name: "bioformats2raw", version: "0.7.0", build: "0", channel: "ome" },
      { name: "zlib", version: "1.3.1", build: "hb9d3cd8_2", channel: undefined },
    ]);
  });

  it("accepts a pixi.toml path and rejects missing, stale, and local evidence", () => {
    const l3 = join(root, "examples/l3-ecosystem-ready");
    expect(planCondaBuild(join(l3, "pixi.toml")).projectRoot).toBe(l3);

    const missing = project(`[workspace]
channels = ["conda-forge"]
platforms = ["linux-64"]
[dependencies]
zlib = "*"
`);
    expect(() => planCondaBuild(missing)).toThrowError(
      expect.objectContaining<Partial<CondaBuildPlanError>>({ kind: "unresolved" }),
    );

    const stale = project(
      `[workspace]
channels = ["conda-forge"]
platforms = ["linux-64"]
[dependencies]
zlib = "*"
`,
      `environments:
  default:
    packages:
      linux-64: []
`,
    );
    expect(() => planCondaBuild(stale)).toThrowError(
      expect.objectContaining<Partial<CondaBuildPlanError>>({ kind: "stale" }),
    );

    expect(() =>
      planCondaBuild(join(root, "examples/l1-local-recipe"), { minimumLevel: 2 }),
    ).toThrowError(
      expect.objectContaining<Partial<CondaBuildPlanError>>({ kind: "insufficient-level" }),
    );
  });
});
