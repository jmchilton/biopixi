import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EXIT_CODES, runGrade } from "../src/index.js";
import { buildProgram } from "../src/program.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const stderr = () => undefined;

describe("runGrade", () => {
  it("reports the version from the package manifest", () => {
    const packageMetadata = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    expect(buildProgram().version()).toBe(packageMetadata.version);
  });

  it("renders a grade", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = runGrade(
      [join(root, "examples/l4-single")],
      {},
      {
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
      },
    );

    expect(code).toBe(0);
    expect(stdout.join("\n")).toContain("L4");
    expect(stderr).toEqual([]);
  });

  it("never prints a container URI without saying how far the claim got", () => {
    const stdout: string[] = [];
    runGrade([join(root, "examples/l4-single")], {}, { stdout: (m) => stdout.push(m), stderr });
    const output = stdout.join("\n");
    expect(output).toContain("quay.io/biocontainers/samtools:1.17--hd87286a_2");
    // The offline grade knows the name and that Bioconda builds one image per recipe build.
    expect(output).toContain("INFERRED");
    expect(output).not.toContain("CONFIRMED");
  });

  it("renders a lock-less project as UNRESOLVED, not as a level", () => {
    const directory = mkdtempSync(join(tmpdir(), "biopixi-cli-unresolved-"));
    writeFileSync(
      join(directory, "pixi.toml"),
      `[workspace]
channels = ["conda-forge"]
platforms = ["linux-64"]

[dependencies]
zlib = "1.3.*"
`,
    );

    const stdout: string[] = [];
    const messages: string[] = [];
    const code = runGrade(
      [directory],
      { minLevel: 1 },
      { stdout: (m) => stdout.push(m), stderr: (m) => messages.push(m) },
    );

    expect(stdout.join("\n")).toContain("UNRESOLVED");
    expect(stdout.join("\n")).not.toContain("L1");
    expect(code).toBe(EXIT_CODES.indefinite);
    expect(messages.join("\n")).toContain("no level could be determined");
  });

  it("prints the source root only once it has been widened past the project", () => {
    const directory = join(root, "examples/l4-single");
    const narrow: string[] = [];
    runGrade([directory], {}, { stdout: (m) => narrow.push(m), stderr });
    expect(narrow.join("\n")).not.toContain("source root:");

    const wide: string[] = [];
    runGrade([directory], { sourceRoot: root }, { stdout: (m) => wide.push(m), stderr });
    expect(wide.join("\n")).toContain(`source root: ${realpathSync(root)}`);
  });

  it("reports a source root that cannot bound the project as a usage error", () => {
    const messages: string[] = [];
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), "biopixi-cli-root-")));
    const code = runGrade(
      [join(root, "examples/l4-single")],
      { sourceRoot: elsewhere },
      { stdout: () => undefined, stderr: (m) => messages.push(m) },
    );

    // 64 is EX_USAGE: a bad invocation must not be mistaken for a low grade.
    expect(code).toBe(EXIT_CODES.usage);
    expect(messages.join("\n")).toContain("is not an ancestor of project root");
  });

  it("enforces a minimum level", () => {
    const stderr: string[] = [];
    const code = runGrade(
      [join(root, "examples/l1-local-recipe")],
      { minLevel: 3 },
      {
        stdout: () => undefined,
        stderr: (message) => stderr.push(message),
      },
    );

    expect(code).toBe(1);
    expect(stderr.join("\n")).toContain("L1 < required L3");
  });
});
