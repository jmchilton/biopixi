import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EXIT_CODES, runGrade } from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const example = (name: string) => join(root, "examples", name);

/** In profile, no lock: conformant but with no evidence to carry a level. */
function lockless(): string {
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

function run(directories: string[], minLevel?: number): { code: number; stderr: string } {
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
    expect(run([example("l4-single")], 3).code).toBe(EXIT_CODES.ok);
  });

  it("cannot satisfy --min-level 4, because grade never reaches L4", () => {
    // L4 needs a registry observation. `verify` is the command that can pass this gate.
    const result = run([example("l4-single")], 4);
    expect(result.code).toBe(EXIT_CODES.belowThreshold);
    expect(result.stderr).toContain("worst level L3 < required L4");
  });

  it("reports only when no threshold is given, whatever the grades", () => {
    expect(run([example("l0-out-of-profile"), lockless()]).code).toBe(EXIT_CODES.ok);
  });

  it("separates a low grade from an ungradeable project", () => {
    const low = run([example("l1-local-recipe")], 3);
    expect(low.code).toBe(EXIT_CODES.belowThreshold);
    expect(low.stderr).toContain("worst level L1 < required L3");

    const unproven = run([lockless()], 1);
    expect(unproven.code).toBe(EXIT_CODES.indefinite);
    expect(unproven.stderr).toContain("no level could be determined");
    expect(unproven.stderr).toContain("UNRESOLVED");

    const outside = run([example("l0-out-of-profile")], 1);
    expect(outside.code).toBe(EXIT_CODES.outOfProfile);
    expect(outside.stderr).toContain("outside profile v0");
  });

  it("reports the earliest unanswered question when directories disagree", () => {
    // Conformance, then evidence, then readiness — PROFILE.md's order, so the code names the
    // problem a caller has to fix first rather than the worst-looking one.
    expect(run([example("l1-local-recipe"), lockless()], 4).code).toBe(EXIT_CODES.indefinite);
    expect(
      run([example("l1-local-recipe"), lockless(), example("l0-out-of-profile")], 4).code,
    ).toBe(EXIT_CODES.outOfProfile);
  });

  it("keeps invocation faults clear of every verdict", () => {
    const elsewhere = mkdtempSync(join(tmpdir(), "biopixi-exit-root-"));
    const messages: string[] = [];
    const code = runGrade(
      [example("l4-single")],
      { sourceRoot: elsewhere, minLevel: 4 },
      { stdout: () => undefined, stderr: (m) => messages.push(m) },
    );
    expect(code).toBe(EXIT_CODES.usage);
    expect(Object.values(EXIT_CODES).filter((value) => value === EXIT_CODES.usage)).toHaveLength(1);
  });
});
