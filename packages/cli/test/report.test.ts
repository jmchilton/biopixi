import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runGrade, type GradeReport } from "../src/index.js";
import { REPORT_SCHEMA_URL } from "../src/report.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const stderr = () => undefined;

const IN_PROFILE = `[workspace]
channels = ["conda-forge"]
platforms = ["linux-64"]

[dependencies]
zlib = "1.3.*"
`;

function report(directories: string[], options = {}): GradeReport {
  const stdout: string[] = [];
  runGrade(directories, { ...options, json: true }, { stdout: (m) => stdout.push(m), stderr });
  expect(stdout).toHaveLength(1);
  return JSON.parse(stdout[0]) as GradeReport;
}

function lockless(): string {
  const directory = mkdtempSync(join(tmpdir(), "biopixi-report-"));
  writeFileSync(join(directory, "pixi.toml"), IN_PROFILE);
  return directory;
}

describe("grade --json", () => {
  it("wraps results in an envelope naming its schema and profile", () => {
    const payload = report([join(root, "examples/l4-single")]);
    expect(Object.keys(payload)).toEqual(["$schema", "biopixi", "profile", "results"]);
    expect(payload.$schema).toBe(REPORT_SCHEMA_URL);
    expect(payload.profile).toBe("v0");
    expect(payload.biopixi).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("writes nothing but the payload to stdout", () => {
    const stdout: string[] = [];
    runGrade(
      [join(root, "examples/l4-single")],
      { json: true },
      { stdout: (m) => stdout.push(m), stderr },
    );
    expect(() => JSON.parse(stdout.join("\n"))).not.toThrow();
    expect(stdout.join("\n")).not.toContain("capped by:");
  });

  it("carries a definitive result in full", () => {
    const directory = join(root, "examples/l4-single");
    const [entry] = report([directory]).results;
    expect(entry).toMatchObject({
      directory,
      projectRoot: realpathSync(directory),
      sourceRoot: realpathSync(directory),
      conformant: true,
      evidenceState: "DEFINITIVE",
      level: 3,
      label: "L3",
      publication: {
        uri: "quay.io/biocontainers/samtools:1.17--hd87286a_2",
        state: "INFERRED",
      },
    });
  });

  it("distinguishes an unproven result from a low one", () => {
    const [unproven] = report([lockless()]).results;
    expect(unproven.conformant).toBe(true);
    expect(unproven.evidenceState).toBe("UNRESOLVED");
    expect(unproven.level).toBeNull();

    const [outside] = report([join(root, "examples/l0-out-of-profile")]).results;
    expect(outside.conformant).toBe(false);
    expect(outside.evidenceState).toBeNull();
    expect(outside.level).toBeNull();
  });

  it("echoes each directory as it was given, alongside the resolved roots", () => {
    const payload = report([join(root, "examples/l4-single")], { sourceRoot: root });
    expect(payload.results[0].sourceRoot).toBe(realpathSync(root));
    expect(payload.results[0].projectRoot).not.toBe(payload.results[0].sourceRoot);
  });

  it("still emits the payload when the gate fails", () => {
    const stdout: string[] = [];
    const messages: string[] = [];
    const code = runGrade(
      [join(root, "examples/l1-local-recipe")],
      { json: true, minLevel: 3 },
      { stdout: (m) => stdout.push(m), stderr: (m) => messages.push(m) },
    );

    expect(code).not.toBe(0);
    expect((JSON.parse(stdout[0]) as GradeReport).results).toHaveLength(1);
    expect(messages.join("\n")).toContain("required L3");
  });
});
