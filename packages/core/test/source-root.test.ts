import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { grade, SourceRootError } from "../src/index.js";

const examples = join(fileURLToPath(new URL("../../../", import.meta.url)), "examples");

const IN_PROFILE = `[workspace]
channels = ["conda-forge", "bioconda"]
platforms = ["linux-64"]

[dependencies]
samtools = "==1.17"
`;

/** A collection root holding one project, mirroring content/environments/<name> in a knowledge base. */
function collection(): { root: string; project: string } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "biopixi-root-")));
  const project = join(root, "content", "environments", "example");
  mkdirSync(project, { recursive: true });
  writeFileSync(join(project, "pixi.toml"), IN_PROFILE);
  return { root, project };
}

describe("source root", () => {
  it("defaults to the project root and is recorded", () => {
    const { project } = collection();
    expect(grade(project).sourceRoot).toBe(project);
  });

  it("is recorded even when the manifest is out of profile", () => {
    const directory = join(examples, "l0-out-of-profile");
    const result = grade(directory);
    expect(result.conformant).toBe(false);
    expect(result.sourceRoot).toBe(realpathSync(directory));
  });

  it("is recorded when there is no manifest at all", () => {
    const empty = realpathSync(mkdtempSync(join(tmpdir(), "biopixi-empty-")));
    const result = grade(empty);
    expect(result.reasons).toEqual(["no pixi.toml"]);
    expect(result.sourceRoot).toBe(empty);
  });

  it("accepts an explicit ancestor of the project root", () => {
    const { root, project } = collection();
    expect(grade(project, { sourceRoot: root }).sourceRoot).toBe(root);
  });

  it("resolves symlinks before comparing, so a linked project stays inside its root", () => {
    const { root, project } = collection();
    const link = join(dirname(project), "linked");
    symlinkSync(project, link);
    expect(grade(link, { sourceRoot: root }).sourceRoot).toBe(root);
  });

  it("rejects a source root that is not an ancestor of the project root", () => {
    const { project } = collection();
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), "biopixi-other-")));
    expect(() => grade(project, { sourceRoot: elsewhere })).toThrow(SourceRootError);
    expect(() => grade(project, { sourceRoot: elsewhere })).toThrow(/is not an ancestor/);
  });

  it("rejects a sibling that is only a string prefix of the project root", () => {
    // `…/environments/example` starts with `…/environments/exam`, which contains none of it.
    const { project } = collection();
    const sibling = join(dirname(project), "exam");
    mkdirSync(sibling, { recursive: true });
    expect(() => grade(project, { sourceRoot: sibling })).toThrow(SourceRootError);
  });

  it("rejects a source root that does not exist", () => {
    const { project } = collection();
    expect(() => grade(project, { sourceRoot: join(project, "..", "missing") })).toThrow(
      SourceRootError,
    );
  });
});
