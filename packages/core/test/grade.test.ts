import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { grade } from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const examples = join(root, "examples");

describe("grade", () => {
  for (const [name, expected] of [
    ["l0-out-of-profile", "L0"],
    ["l1-local-recipe", "L1"],
    ["l3-ecosystem-ready", "L3"],
    ["l4-combination", "L4"],
    ["l4-single", "L4"],
  ]) {
    it(`grades ${name} as ${expected}`, () => {
      expect(grade(join(examples, name)).label).toBe(expected);
    });
  }

  it("distinguishes an unpublished patch version from a published combination", () => {
    const l3 = grade(join(examples, "l3-ecosystem-ready"));
    const l4 = grade(join(examples, "l4-combination"));
    expect([l3.level, l4.level]).toEqual([3, 4]);
    expect(l3.target).toBe("bamtools=2.5.2,samtools=1.17");
    expect(l4.target).toBe("bamtools=2.5.2,samtools=1.16.1");
  });

  it("can lower the environment grade when a package is added", () => {
    expect(grade(join(examples, "l4-single")).level).toBe(4);
    expect(grade(join(examples, "l3-ecosystem-ready")).level).toBe(3);
  });

  it("reports lints for an out-of-profile manifest", () => {
    const result = grade(join(examples, "l0-out-of-profile"));
    expect(result.level).toBeNull();
    expect(result.reasons.some((reason) => reason.includes("pypi-dependencies"))).toBe(true);
    expect(result.lints.some((lint) => lint.includes("install instruction"))).toBe(true);
  });

  it("grades a public non-community channel as L2", () => {
    const directory = mkdtempSync(join(tmpdir(), "biopixi-l2-"));
    writeFileSync(
      join(directory, "pixi.toml"),
      `[workspace]
channels = ["https://conda.anaconda.org/project"]
platforms = ["linux-64"]

[dependencies]
custom-tool = "==1.0"
`,
    );
    writeFileSync(
      join(directory, "pixi.lock"),
      `environments:
  default:
    packages:
      linux-64:
        - conda: https://conda.anaconda.org/project/linux-64/custom-tool-1.0-0.conda
`,
    );

    const result = grade(directory);
    expect(result.label).toBe("L2");
    expect(result.target).toBe("custom-tool=1.0");
    expect(
      result.reasons.some((reason) => reason.includes("non-community channels: project")),
    ).toBe(true);
  });

  it("does not let a registered custom-channel container skip L3", () => {
    const directory = mkdtempSync(join(tmpdir(), "biopixi-ome-"));
    writeFileSync(
      join(directory, "pixi.toml"),
      `[workspace]
channels = ["conda-forge", "https://conda.anaconda.org/ome"]
platforms = ["linux-64"]

[dependencies]
openjdk = "*"
bioformats2raw = { version = "==0.7.0", channel = "ome" }
`,
    );
    writeFileSync(
      join(directory, "pixi.lock"),
      `environments:
  default:
    packages:
      linux-64:
        - conda: https://conda.anaconda.org/conda-forge/linux-64/openjdk-17.0.3-h1e1ecb3_1.tar.bz2
        - conda: https://conda.anaconda.org/ome/linux-64/bioformats2raw-0.7.0-0.tar.bz2
`,
    );

    const result = grade(directory);
    expect(result.label).toBe("L2");
    expect(result.target).toBe("bioformats2raw=0.7.0,openjdk=17.0.3");
    expect(result.reasons.some((reason) => reason.includes("non-community channels: ome"))).toBe(
      true,
    );
    expect(result.evidence).toBeUndefined();
  });

  it("treats a dependency introduced only by a target table as a root", () => {
    const directory = mkdtempSync(join(tmpdir(), "biopixi-target-only-"));
    const source = join(examples, "l4-single");
    copyFileSync(join(source, "pixi.lock"), join(directory, "pixi.lock"));
    writeFileSync(
      join(directory, "pixi.toml"),
      readFileSync(join(source, "pixi.toml"), "utf8").replace(
        "[dependencies]",
        "[target.linux-64.dependencies]",
      ),
    );

    const result = grade(directory);
    expect([result.label, result.target]).toEqual(["L4", "samtools=1.17"]);
  });

  it("does not assign a definitive grade when the lock contains a PyPI artifact", () => {
    const directory = mkdtempSync(join(tmpdir(), "biopixi-pypi-lock-"));
    writeFileSync(
      join(directory, "pixi.toml"),
      `[workspace]
channels = ["bioconda"]
platforms = ["linux-64"]

[dependencies]
samtools = "==1.17"
`,
    );
    writeFileSync(
      join(directory, "pixi.lock"),
      `environments:
  default:
    packages:
      linux-64:
        - conda: https://conda.anaconda.org/bioconda/linux-64/samtools-1.17-hd87286a_2.conda
        - pypi: https://files.pythonhosted.org/packages/example/example-1.0.0-py3-none-any.whl
`,
    );

    const result = grade(directory);
    expect(result.level).toBeNull();
    expect(result.reasons).toEqual(["lock contains a PyPI wheel: example-1.0.0-py3-none-any.whl"]);
  });

  it("does not call fetch", () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error("grade attempted a network connection");
    };
    try {
      for (const name of [
        "l0-out-of-profile",
        "l1-local-recipe",
        "l3-ecosystem-ready",
        "l4-combination",
        "l4-single",
      ]) {
        grade(join(examples, name));
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
