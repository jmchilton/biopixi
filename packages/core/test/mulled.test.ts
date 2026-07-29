import { describe, expect, it } from "vitest";

import { v2ImageName, type Target } from "../src/index.js";

const vectors: Array<[Target[], string | undefined, string]> = [
  [[{ package: "samtools", version: "1.3.1" }], undefined, "samtools:1.3.1"],
  [[{ package: "samtools", version: "1.3.1", build: "py_1" }], undefined, "samtools:1.3.1--py_1"],
  [[{ package: "samtools", version: "1.3.1" }], "0", "samtools:1.3.1"],
  [[{ package: "samtools", version: "1.3.1", build: "py_1" }], "0", "samtools:1.3.1--py_1"],
  [
    [
      { package: "samtools", version: "1.3.1" },
      { package: "bwa", version: "0.7.13" },
    ],
    undefined,
    "mulled-v2-fe8faa35dbf6dc65a0f7f5d4ea12e31a79f73e40:4d0535c94ef45be8459f429561f0894c3fe0ebcf",
  ],
  [
    [{ package: "samtools", version: "1.3.1" }, { package: "bwa" }],
    undefined,
    "mulled-v2-fe8faa35dbf6dc65a0f7f5d4ea12e31a79f73e40:b0c847e4fb89c343b04036e33b2daa19c4152cf5",
  ],
  [
    [{ package: "samtools" }, { package: "bwa" }],
    undefined,
    "mulled-v2-fe8faa35dbf6dc65a0f7f5d4ea12e31a79f73e40",
  ],
  [
    [
      { package: "samtools", version: "1.3.1", build: "h9071d68_10" },
      { package: "bedtools", version: "2.26.0", build: "0" },
    ],
    undefined,
    "mulled-v2-8186960447c5cb2faa697666dc1e6d919ad23f3e:a6419f25efff953fc505dbd5ee734856180bb619",
  ],
  [
    [
      { package: "bamtools", version: "2.5.2" },
      { package: "samtools", version: "1.16.1" },
    ],
    "0",
    "mulled-v2-0560a8046fc82aa4338588eca29ff18edab2c5aa:b99cea629ebb7008000f322a53ee051ee7fee74a-0",
  ],
  [
    [{ package: "samtools", version: "1.17", build: "hd87286a_2" }],
    undefined,
    "samtools:1.17--hd87286a_2",
  ],
];

describe("v2ImageName", () => {
  for (const [targets, imageBuild, expected] of vectors) {
    it(`computes ${expected}`, () => {
      expect(v2ImageName(targets, imageBuild)).toBe(expected);
    });
  }

  it("does not depend on target order", () => {
    const first = v2ImageName([
      { package: "samtools", version: "1.3.1" },
      { package: "bwa", version: "0.7.13" },
    ]);
    const second = v2ImageName([
      { package: "bwa", version: "0.7.13" },
      { package: "samtools", version: "1.3.1" },
    ]);
    expect(first).toBe(second);
  });

  it("hashes package names separately from versions", () => {
    const l3 = v2ImageName([
      { package: "bamtools", version: "2.5.2" },
      { package: "samtools", version: "1.17" },
    ]);
    const l4 = v2ImageName([
      { package: "bamtools", version: "2.5.2" },
      { package: "samtools", version: "1.16.1" },
    ]);
    expect(l3.split(":")[0]).toBe(l4.split(":")[0]);
    expect(l3.split(":")[1]).not.toBe(l4.split(":")[1]);
  });
});
