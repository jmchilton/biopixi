import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { grade } from "../src/index.js";

/**
 * A lock records a separate solve per platform. These fixtures give the two supported platforms
 * deliberately different answers, so a result that consulted the wrong one is visible rather than
 * merely unlucky.
 */

const BOTH_PLATFORMS = `[workspace]
channels = ["conda-forge", "bioconda"]
platforms = ["linux-64", "osx-arm64"]

[dependencies]
samtools = "==1.17"
`;

const LINUX_SAMTOOLS =
  "https://conda.anaconda.org/bioconda/linux-64/samtools-1.17-hd87286a_2.conda";
const MACOS_SAMTOOLS =
  "https://conda.anaconda.org/bioconda/osx-arm64/samtools-1.17-h9b5f4b8_1.conda";
const MACOS_PRIVATE_SAMTOOLS =
  "https://packages.example.org/private/osx-arm64/samtools-1.17-h9b5f4b8_1.conda";

function project(manifest: string, lock: string): string {
  const directory = mkdtempSync(join(tmpdir(), "biopixi-platform-"));
  writeFileSync(join(directory, "pixi.toml"), manifest);
  writeFileSync(join(directory, "pixi.lock"), lock);
  return directory;
}

/** A lock in Pixi's shape: `environments.default.packages` keyed by platform. */
function lockOf(byPlatform: Record<string, string[]>): string {
  const sections = Object.entries(byPlatform)
    .map(([platform, artifacts]) => {
      const entries = artifacts.map((artifact) => `        - conda: ${artifact}`).join("\n");
      return `      ${platform}:\n${entries}`;
    })
    .join("\n");
  return `environments:
  default:
    packages:
${sections}
`;
}

describe("platform scoping", () => {
  it("takes the container identity from linux-64, not from another declared platform", () => {
    // Pixi sorts platform keys, so osx-arm64 is always last. A reader that flattens the lock keeps
    // the macOS artifact and emits its build string inside a linux-64 BioContainers URI — a tag
    // that cannot exist, which `verify` would then report as absent.
    const result = grade(
      project(
        BOTH_PLATFORMS,
        lockOf({ "linux-64": [LINUX_SAMTOOLS], "osx-arm64": [MACOS_SAMTOOLS] }),
      ),
    );

    expect(result.publication?.uri).toBe("quay.io/biocontainers/samtools:1.17--hd87286a_2");
  });

  it("does not let another platform's channel cap the level", () => {
    // The ladder is a statement about linux-64. A package macOS can only get privately says
    // nothing about whether the Linux environment travels.
    const result = grade(
      project(
        BOTH_PLATFORMS,
        lockOf({ "linux-64": [LINUX_SAMTOOLS], "osx-arm64": [MACOS_PRIVATE_SAMTOOLS] }),
      ),
    );

    expect(result.level).toBe(3);
    expect(result.publication?.state).toBe("INFERRED");
  });

  it("is STALE when the lock does not cover the graded platform", () => {
    const result = grade(project(BOTH_PLATFORMS, lockOf({ "osx-arm64": [MACOS_SAMTOOLS] })));

    expect(result.evidenceState).toBe("STALE");
    expect(result.level).toBeNull();
    expect(result.reasons.some((reason) => reason.includes("linux-64"))).toBe(true);
  });

  it("still grades a single-platform project from that platform", () => {
    const result = grade(
      project(
        BOTH_PLATFORMS.replace(', "osx-arm64"', ""),
        lockOf({ "linux-64": [LINUX_SAMTOOLS] }),
      ),
    );

    expect(result.level).toBe(3);
    expect(result.publication?.uri).toBe("quay.io/biocontainers/samtools:1.17--hd87286a_2");
  });
});
