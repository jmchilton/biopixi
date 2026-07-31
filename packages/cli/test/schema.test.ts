import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";

import { runGrade } from "../src/index.js";
import { REPORT_SCHEMA_URL } from "../src/report.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const schemaPath = join(repositoryRoot, "docs/schema/grade-report-v0.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;

const validate = new Ajv({ strict: false }).compile(schema);

function generatePayload(directories: string[]): unknown {
  const stdout: string[] = [];
  runGrade(directories, { json: true }, { stdout: (m) => stdout.push(m), stderr: () => undefined });
  return JSON.parse(stdout[0]);
}

/** An in-profile project with no lock, so UNRESOLVED is exercised alongside the committed examples. */
function createLocklessProject(): string {
  const directory = mkdtempSync(join(tmpdir(), "biopixi-schema-"));
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

describe("grade report schema", () => {
  it("is the schema every payload points at", () => {
    expect(schema.$id).toBe(REPORT_SCHEMA_URL);
  });

  it("accepts real output covering every example and evidence state", () => {
    const directories = [
      "examples/l0-out-of-profile",
      "examples/l1-local-recipe",
      "examples/l3-ecosystem-ready",
      "examples/l4-single",
      "examples/l4-combination",
    ].map((example) => join(repositoryRoot, example));

    // One payload holds them together, so a field that only ever appears at one level is covered.
    expect(validate(generatePayload([...directories, createLocklessProject()]))).toBe(true);
    expect(validate.errors).toBeNull();
  });

  it("rejects a payload carrying a field the schema does not describe", () => {
    // Guards the direction the generator cannot: output growing past its committed contract.
    const report = generatePayload([join(repositoryRoot, "examples/l4-single")]) as {
      results: Record<string, unknown>[];
    };
    report.results[0].surprise = true;
    expect(validate(report)).toBe(false);
  });

  it("rejects a level that is neither a number nor null", () => {
    // The schema cannot express "null unless DEFINITIVE" — that invariant is tested in core.
    const report = generatePayload([createLocklessProject()]) as {
      results: Record<string, unknown>[];
    };
    expect(report.results[0].level).toBeNull();
    report.results[0].level = "4";
    expect(validate(report)).toBe(false);
  });
});
