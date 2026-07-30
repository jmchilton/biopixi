import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { grade } from "../src/index.js";

const fixtures = fileURLToPath(new URL("fixtures/profile/", import.meta.url));
const examples = join(fileURLToPath(new URL("../../../", import.meta.url)), "examples");

const ancestor = join(fixtures, "accepted", "path-dependency-ancestor");

/** A throwaway project tree. Used where the shape under test is a relationship between files. */
function tree(files: Record<string, string>): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "biopixi-path-")));
  for (const [relativePath, contents] of Object.entries(files)) {
    const path = join(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
  }
  return root;
}

const WORKSPACE = `[workspace]
preview = ["pixi-build"]
channels = ["conda-forge"]
platforms = ["linux-64"]

[dependencies]
tool-a = { path = "./recipes/tool-a" }
`;

/** A package manifest, optionally depending on another local package by path. */
function packageManifest(name: string, dependsOn?: string): string {
  const runDependencies =
    dependsOn === undefined
      ? ""
      : `\n[package.run-dependencies]\n${dependsOn} = { path = "../${dependsOn}" }\n`;
  return `[package]
name = "${name}"
version = "1.0.0"

[package.build]
backend = { name = "pixi-build-rattler-build", version = "*" }
${runDependencies}`;
}

function recipe(name: string): string {
  return `package:\n  name: ${name}\n  version: 1.0.0\n`;
}

describe("path dependency conformance", () => {
  it("accepts a recipe inside the project and records it", () => {
    const result = grade(join(fixtures, "accepted", "path-dependency"));

    expect(result.reasons).toEqual([
      "no pixi.lock — publication is a claim about a solve, and there is no solve",
    ]);
    expect(result.conformant).toBe(true);
    expect(result.pathDependencies).toEqual([
      {
        name: "tool-a",
        declared: "./recipes/tool-a",
        resolved: join(fixtures, "accepted", "path-dependency", "recipes", "tool-a"),
        version: "1.0.0",
        recipe: join("recipes", "tool-a", "recipe.yaml"),
      },
    ]);
  });

  it("accepts a recipe above the project once the source root is widened to reach it", () => {
    const project = join(ancestor, "environments", "example");
    const result = grade(project, { sourceRoot: ancestor });

    expect(result.conformant).toBe(true);
    expect(result.pathDependencies?.map((dependency) => dependency.name)).toEqual(["tool-b"]);
  });

  it("rejects that same project when the source root does not reach the recipe", () => {
    // The default source root is the project, so the shared recipe is outside what is bounded.
    const result = grade(join(ancestor, "environments", "example"));

    expect(result.conformant).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0]).toContain("outside the selected source root");
    expect(result.pathDependencies).toBeUndefined();
  });

  // One defect per fixture, so the whole reason list is asserted: a second reason means the fixture
  // is describing something other than its subject, or a check fired that should not have.
  for (const [name, expected] of [
    ["path-absolute", "declared by an absolute path"],
    ["path-escaping", "outside the selected source root"],
    ["path-missing-target", "which does not exist"],
    ["path-no-package-manifest", "contains no pixi.toml package manifest"],
    ["path-name-mismatch", "points at a package declaring 'tool-b'"],
    ["path-version-range", "must state one concrete version"],
    ["path-unsupported-backend", "profile v0 reads inputs only for pixi-build-rattler-build"],
    ["path-no-recipe", "has no recipe.yaml or recipe.yml"],
    ["path-unparseable-recipe", "recipe.yaml does not parse"],
    ["path-recipe-version-mismatch", "the recipe and the package manifest must agree"],
    ["path-multiple-outputs", "has an outputs: list in recipe.yaml (2 outputs)"],
    ["path-variant-matrix", "pins multiple values for python (2)"],
  ] as Array<[string, string]>) {
    it(`rejects the Pixi-valid project ${name}`, () => {
      const result = grade(join(fixtures, "rejected", name));

      expect(result.conformant).toBe(false);
      expect(result.label).toBe("L0");
      expect(result.reasons).toHaveLength(1);
      expect(result.reasons[0]).toContain(expected);
    });
  }

  it("follows a path dependency declared by another local package", () => {
    // pixi resolves these at build time and never writes them to the lock, so reading the package
    // manifest is the only way the second recipe is seen at all.
    const root = tree({
      "pixi.toml": WORKSPACE,
      "recipes/tool-a/pixi.toml": packageManifest("tool-a", "tool-b"),
      "recipes/tool-a/recipe.yaml": recipe("tool-a"),
      "recipes/tool-b/pixi.toml": packageManifest("tool-b"),
      "recipes/tool-b/recipe.yaml": recipe("tool-b"),
    });

    const result = grade(root);

    expect(result.conformant).toBe(true);
    expect(result.pathDependencies?.map((dependency) => dependency.name)).toEqual([
      "tool-a",
      "tool-b",
    ]);
  });

  it("rejects a defect in a recursively reached package", () => {
    const root = tree({
      "pixi.toml": WORKSPACE,
      "recipes/tool-a/pixi.toml": packageManifest("tool-a", "tool-b"),
      "recipes/tool-a/recipe.yaml": recipe("tool-a"),
      "recipes/tool-b/pixi.toml": packageManifest("tool-b"),
    });

    const result = grade(root);

    expect(result.conformant).toBe(false);
    expect(result.reasons).toEqual([
      "tool-b has no recipe.yaml or recipe.yml beside its package manifest — a source checkout is not a recipe",
    ]);
  });

  it("terminates on a cycle between two local packages", () => {
    const root = tree({
      "pixi.toml": WORKSPACE,
      "recipes/tool-a/pixi.toml": packageManifest("tool-a", "tool-b"),
      "recipes/tool-a/recipe.yaml": recipe("tool-a"),
      "recipes/tool-b/pixi.toml": packageManifest("tool-b", "tool-a"),
      "recipes/tool-b/recipe.yaml": recipe("tool-b"),
    });

    const result = grade(root);

    expect(result.conformant).toBe(true);
    expect(result.pathDependencies?.map((dependency) => dependency.name)).toEqual([
      "tool-a",
      "tool-b",
    ]);
  });

  describe("agreement with the lock", () => {
    const lock = (source: string) => `version: 7
environments:
  default:
    channels:
    - url: https://conda.anaconda.org/conda-forge/
    packages:
      linux-64:
      - conda_source: tool-a[abc12345] @ ${source}
`;

    const files = {
      "pixi.toml": WORKSPACE,
      "recipes/tool-a/pixi.toml": packageManifest("tool-a"),
      "recipes/tool-a/recipe.yaml": recipe("tool-a"),
    };

    it("accepts a source record naming the declared path", () => {
      const result = grade(tree({ ...files, "pixi.lock": lock("./recipes/tool-a") }));

      expect(result.evidenceState).toBe("DEFINITIVE");
      expect(result.level).toBe(1);
    });

    it("is stale, not out of profile, when the recipe has moved since the solve", () => {
      const result = grade(tree({ ...files, "pixi.lock": lock("./vendor/tool-a") }));

      expect(result.conformant).toBe(true);
      expect(result.evidenceState).toBe("STALE");
      expect(result.reasons).toEqual([
        "tool-a is locked from ./vendor/tool-a, but the manifest declares ./recipes/tool-a",
      ]);
    });
  });

  it("keeps the local-recipe example at L1 and lints its skip expression", () => {
    const result = grade(join(examples, "l1-local-recipe"));

    expect(result.level).toBe(1);
    expect(result.pathDependencies).toEqual([
      {
        name: "r-designit",
        declared: "./recipes/r-designit",
        resolved: join(examples, "l1-local-recipe", "recipes", "r-designit"),
        version: "0.5.0",
        recipe: join("recipes", "r-designit", "recipe.yaml"),
      },
    ]);
    expect(result.lints).toEqual([
      "r-designit carries build.skip in recipe.yaml — its one declared output may not be produced for the grading platform",
    ]);
  });
});
