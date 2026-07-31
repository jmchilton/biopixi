import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EXIT_CODES, runGrade } from "../src/index.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const examplePath = (name: string) => join(repositoryRoot, "examples", name);

/** In profile, no lock: conformant but with no evidence to carry a level. */
function createLocklessProject(): string {
  const directory = mkdtempSync(join(tmpdir(), "biopixi-exit-"));
  writeFileSync(
    join(directory, "pixi.toml"),
    `[workspace]
channels = ["conda-forge"]
platforms = ["linux-64"]

[dependencies]
zlib = "1.3.*"
`,
  );
  return directory;
}

function runWithThreshold(
  directories: string[],
  minLevel?: number,
): { code: number; stderr: string } {
  const messages: string[] = [];
  const code = runGrade(
    directories,
    { minLevel },
    { stdout: () => undefined, stderr: (m) => messages.push(m) },
  );
  return { code, stderr: messages.join("\n") };
}

describe("exit codes", () => {
  it("passes when every project meets the threshold", () => {
    expect(runWithThreshold([examplePath("l4-single")], 3).code).toBe(EXIT_CODES.ok);
  });

  it("cannot satisfy --min-level 4, because grade never reaches L4", () => {
    // L4 needs a registry observation. `verify` is the command that can pass this gate.
    const result = runWithThreshold([examplePath("l4-single")], 4);
    expect(result.code).toBe(EXIT_CODES.belowThreshold);
    expect(result.stderr).toContain("worst level L3 < required L4");
  });

  it("reports only when no threshold is given, whatever the grades", () => {
    expect(runWithThreshold([examplePath("l0-out-of-profile"), createLocklessProject()]).code).toBe(
      EXIT_CODES.ok,
    );
  });

  it("separates a low grade from an ungradeable project", () => {
    const low = runWithThreshold([examplePath("l1-local-recipe")], 3);
    expect(low.code).toBe(EXIT_CODES.belowThreshold);
    expect(low.stderr).toContain("worst level L1 < required L3");

    const unproven = runWithThreshold([createLocklessProject()], 1);
    expect(unproven.code).toBe(EXIT_CODES.indefinite);
    expect(unproven.stderr).toContain("no level could be determined");
    expect(unproven.stderr).toContain("UNRESOLVED");

    const outside = runWithThreshold([examplePath("l0-out-of-profile")], 1);
    expect(outside.code).toBe(EXIT_CODES.outOfProfile);
    expect(outside.stderr).toContain("outside profile v0");
  });

  it("reports the earliest unanswered question when directories disagree", () => {
    // Conformance, then evidence, then readiness — PROFILE.md's order, so the code names the
    // problem a caller has to fix first rather than the worst-looking one.
    expect(
      runWithThreshold([examplePath("l1-local-recipe"), createLocklessProject()], 4).code,
    ).toBe(EXIT_CODES.indefinite);
    expect(
      runWithThreshold(
        [examplePath("l1-local-recipe"), createLocklessProject(), examplePath("l0-out-of-profile")],
        4,
      ).code,
    ).toBe(EXIT_CODES.outOfProfile);
  });

  it("keeps invocation faults clear of every verdict", () => {
    const elsewhere = mkdtempSync(join(tmpdir(), "biopixi-exit-root-"));
    const messages: string[] = [];
    const code = runGrade(
      [examplePath("l4-single")],
      { sourceRoot: elsewhere, minLevel: 4 },
      { stdout: () => undefined, stderr: (m) => messages.push(m) },
    );
    expect(code).toBe(EXIT_CODES.usage);
    expect(Object.values(EXIT_CODES).filter((value) => value === EXIT_CODES.usage)).toHaveLength(1);
  });
});
