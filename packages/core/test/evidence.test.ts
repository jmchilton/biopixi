import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { grade } from "../src/index.js";

const examples = join(fileURLToPath(new URL("../../../", import.meta.url)), "examples");

const IN_PROFILE = `[workspace]
channels = ["conda-forge", "bioconda"]
platforms = ["linux-64"]

[dependencies]
samtools = "==1.17"
`;

const SAMTOOLS_ARTIFACT =
  "https://conda.anaconda.org/bioconda/linux-64/samtools-1.17-hd87286a_2.conda";

function createProject(manifest: string, lock?: string): string {
  const directory = mkdtempSync(join(tmpdir(), "biopixi-evidence-"));
  writeFileSync(join(directory, "pixi.toml"), manifest);
  if (lock !== undefined) {
    writeFileSync(join(directory, "pixi.lock"), lock);
  }
  return directory;
}

function lockOf(...artifacts: string[]): string {
  const entries = artifacts.map((artifact) => `        - ${artifact}`).join("\n");
  return `environments:
  default:
    packages:
      linux-64:
${entries}
`;
}

describe("evidence state", () => {
  it("is UNRESOLVED with no numeric level when there is no lock", () => {
    const result = grade(createProject(IN_PROFILE));
    expect(result.conformant).toBe(true);
    expect(result.evidenceState).toBe("UNRESOLVED");
    expect(result.level).toBeNull();
    expect(result.label).toBe("UNRESOLVED");
    expect(result.nextActions.some((action) => action.includes("pixi lock"))).toBe(true);
  });

  it("is STALE with no numeric level when a root is absent from the lock", () => {
    const lock = lockOf(
      "conda: https://conda.anaconda.org/conda-forge/linux-64/zlib-1.3-h0b41bf4_0.conda",
    );
    const result = grade(createProject(IN_PROFILE, lock));
    expect(result.evidenceState).toBe("STALE");
    expect(result.level).toBeNull();
    expect(result.label).toBe("STALE");
    expect(result.reasons.some((reason) => reason.includes("samtools"))).toBe(true);
  });

  it("is UNSUPPORTED_LOCK when the lock contains a PyPI artifact", () => {
    const lock = lockOf(
      `conda: ${SAMTOOLS_ARTIFACT}`,
      "pypi: https://files.pythonhosted.org/packages/example/example-1.0.0-py3-none-any.whl",
    );
    const result = grade(createProject(IN_PROFILE, lock));
    expect(result.evidenceState).toBe("UNSUPPORTED_LOCK");
    expect(result.level).toBeNull();
    expect(result.label).toBe("UNSUPPORTED_LOCK");
    expect(result.reasons).toEqual(["lock contains a PyPI wheel: example-1.0.0-py3-none-any.whl"]);
  });

  it("is DEFINITIVE when a complete solve backs the level", () => {
    for (const [name, level] of [
      ["l3-ecosystem-ready", 3],
      // Both are L4 candidates; the level stops at L3 until a registry is observed.
      ["l4-single", 3],
      ["l4-combination", 3],
    ] as Array<[string, number]>) {
      const result = grade(join(examples, name));
      expect([name, result.evidenceState, result.level]).toEqual([name, "DEFINITIVE", level]);
    }
  });

  it("has no evidence state at all when the manifest is out of profile", () => {
    const result = grade(join(examples, "l0-out-of-profile"));
    expect(result.conformant).toBe(false);
    expect(result.evidenceState).toBeNull();
    expect(result.level).toBeNull();
    expect(result.label).toBe("L0");
  });

  it("does not claim a container it has not observed", () => {
    const single = grade(join(examples, "l4-single"));

    expect(single.publication).toEqual({
      uri: "quay.io/biocontainers/samtools:1.17--hd87286a_2",
      state: "INFERRED",
      basis: "a single bioconda package, and BioContainers builds one image per recipe build",
    });
    // No digest and no observation time: nothing was reached, so nothing is recorded.
    expect(single.publication?.digest).toBeUndefined();
    expect(single.publication?.observedAt).toBeUndefined();
  });

  it("records the metadata snapshot behind a combination claim", () => {
    const result = grade(join(examples, "l4-combination"));
    expect(result.snapshot).toMatchObject({
      path: "combinations/hash.tsv",
      revision: "c914c11ef70d8f1b0b609f26712975e78b025667",
      fetched: "2026-07-28",
    });
    expect(result.publication?.state).toBe("REGISTERED");
    expect(result.publication?.basis).toContain("combinations/hash.tsv");
  });

  it("names the hash.tsv line to add when a combination is unregistered", () => {
    const result = grade(join(examples, "l3-ecosystem-ready"));
    expect(result.snapshot).not.toBeUndefined();
    expect(result.nextActions.some((action) => action.includes("combinations/hash.tsv"))).toBe(
      true,
    );
  });
});
