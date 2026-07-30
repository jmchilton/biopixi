/**
 * Profile v0's path-dependency contract.
 *
 * PROFILE.md accepts a local path dependency only as an L1 source package, and only when the tree
 * it points at can be read as exactly one package without building anything. Everything here is
 * decided by reading files: whether the package would actually build is a build-time fact and
 * outside what an offline grader can settle.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { parse as parseYaml } from "yaml";

import { containedIn, parseManifest, record, type Manifest } from "./manifest.js";

/** The one local backend profile v0 can read inputs for. */
const SUPPORTED_BACKEND = "pixi-build-rattler-build";
const RECIPE_FILES = ["recipe.yaml", "recipe.yml"];
const VARIANT_FILES = ["variants.yaml", "variants.yml"];
/** A version with no range operator, wildcard, or alternation left in it. */
const CONCRETE_VERSION = /^[^*<>=!,|\s]+$/;
/** Workspace dependency tables a `path =` entry can appear in. PyPI tables are rejected earlier. */
const WORKSPACE_TABLES = ["dependencies", "host-dependencies", "build-dependencies"];
/**
 * Package dependency tables, which live under `[package.*]` rather than at the top level.
 * pixi-build-rattler-build refuses binary dependencies here — the recipe carries those — so a
 * path is effectively the only thing these tables hold.
 */
const PACKAGE_TABLES = ["run-dependencies", "host-dependencies", "build-dependencies"];

/** A local path dependency that satisfies the profile, recorded so a result can be audited. */
export interface PathDependency {
  /** The dependency name, as the manifest that declares it spells it. */
  name: string;
  /** The path as declared, relative to the manifest that declares it. */
  declared: string;
  /** The directory it points at, absolute and symlink-resolved. */
  resolved: string;
  /** The concrete version its package manifest declares. */
  version: string;
  /** The recipe file backing it, relative to the project root. */
  recipe: string;
}

export interface PathDependencyReport {
  /** Every conformant path dependency reached, including those reached recursively. */
  dependencies: PathDependency[];
  /** Why a path dependency is outside profile v0. Any reason here makes the workspace L0. */
  reasons: string[];
  /** Portability concerns that did not change the result. */
  lints: string[];
}

interface Declaration {
  name: string;
  declared: string;
  /** The directory of the manifest that declared it, which the path is relative to. */
  from: string;
}

/**
 * Every `path =` entry in a manifest, generic tables first and then each target table.
 *
 * Target tables participate because a path dependency that exists only under `target.linux-64`
 * is still a source package the grading platform has to build.
 */
function declarations(
  manifest: Manifest,
  from: string,
  scope: "workspace" | "package",
): Declaration[] {
  const root = scope === "package" ? record(manifest.package) : manifest;
  const keys = scope === "package" ? PACKAGE_TABLES : WORKSPACE_TABLES;
  const found: Declaration[] = [];
  const collect = (table: Manifest): void => {
    for (const [name, value] of Object.entries(table)) {
      const declared = record(value).path;
      if (typeof declared === "string") {
        found.push({ name, declared, from });
      }
    }
  };

  for (const key of keys) {
    collect(record(root[key]));
  }
  for (const target of Object.values(record(root.target))) {
    for (const key of keys) {
      collect(record(record(target)[key]));
    }
  }
  return found;
}

/** The first of `names` that exists in `directory`, or undefined. */
function firstPresent(directory: string, names: readonly string[]): string | undefined {
  return names.find((name) => existsSync(join(directory, name)));
}

function parseYamlFile(path: string): Manifest {
  return record(parseYaml(readFileSync(path, "utf8")));
}

/**
 * Check one declaration against the contract, stopping at its first defect.
 *
 * One reason per dependency: a path that does not exist has nothing more to say about its recipe,
 * and listing the consequences of a single mistake buries the mistake.
 */
function inspect(
  declaration: Declaration,
  sourceRoot: string,
  projectRoot: string,
): { dependency?: PathDependency; manifest?: Manifest; reasons: string[]; lints: string[] } {
  const { name, declared, from } = declaration;
  const fail = (reason: string) => ({ reasons: [reason], lints: [] });

  if (isAbsolute(declared)) {
    return fail(
      `${name} declared by an absolute path (${declared}) — a path dependency must be relative so the source tree can be moved or cloned`,
    );
  }

  const target = resolve(from, declared);
  if (!existsSync(target)) {
    return fail(`${name} points at ${declared}, which does not exist`);
  }
  const resolved = realpathSync(target);

  if (!containedIn(resolved, sourceRoot)) {
    return fail(
      `${name} resolves to ${resolved}, outside the selected source root ${sourceRoot} — nothing bounds what would have to be shipped to rebuild it`,
    );
  }

  const manifestPath = join(resolved, "pixi.toml");
  if (!existsSync(manifestPath)) {
    return fail(`${name} points at ${declared}, which contains no pixi.toml package manifest`);
  }

  let manifest: Manifest;
  try {
    manifest = parseManifest(manifestPath);
  } catch (error) {
    return fail(`${name}: ${declared}/pixi.toml does not parse — ${String(error)}`);
  }

  const pkg = record(manifest.package);
  if (pkg.name !== name) {
    const found = pkg.name === undefined ? "no [package].name" : `'${String(pkg.name)}'`;
    return fail(
      `${name} points at a package declaring ${found} — a path dependency is resolved by name, so the two must agree`,
    );
  }

  const version = pkg.version;
  if (typeof version !== "string" || !CONCRETE_VERSION.test(version)) {
    return fail(
      `${name} declares [package].version = ${JSON.stringify(version ?? null)} — a source package must state one concrete version`,
    );
  }

  const backend = record(record(pkg.build).backend).name;
  if (backend !== SUPPORTED_BACKEND) {
    const found = backend === undefined ? "no build backend" : `'${String(backend)}'`;
    return fail(`${name} uses ${found} — profile v0 reads inputs only for ${SUPPORTED_BACKEND}`);
  }

  const recipeFile = firstPresent(resolved, RECIPE_FILES);
  if (recipeFile === undefined) {
    return fail(
      `${name} has no ${RECIPE_FILES.join(" or ")} beside its package manifest — a source checkout is not a recipe`,
    );
  }

  let recipe: Manifest;
  try {
    recipe = parseYamlFile(join(resolved, recipeFile));
  } catch (error) {
    return fail(`${name}: ${recipeFile} does not parse — ${String(error)}`);
  }

  const outputs = recipe.outputs;
  if (outputs !== undefined) {
    const count = Array.isArray(outputs) ? outputs.length : 0;
    return fail(
      `${name} has an outputs: list in ${recipeFile} (${count} outputs) — profile v0 requires a recipe to declare exactly one`,
    );
  }

  const recipePackage = record(recipe.package);
  if (typeof recipePackage.name !== "string") {
    return fail(
      `${name} has no top-level package: mapping in ${recipeFile} — profile v0 requires the single-output recipe form`,
    );
  }
  if (recipePackage.name !== name) {
    return fail(
      `${name} is built by a recipe declaring package.name '${String(recipePackage.name)}' in ${recipeFile}`,
    );
  }
  if (String(recipePackage.version) !== version) {
    return fail(
      `${name} declares version ${version} but ${recipeFile} builds ${String(recipePackage.version)} — the recipe and the package manifest must agree`,
    );
  }

  const variantFile = firstPresent(resolved, VARIANT_FILES);
  if (variantFile !== undefined) {
    let variants: Manifest;
    try {
      variants = parseYamlFile(join(resolved, variantFile));
    } catch (error) {
      return fail(`${name}: ${variantFile} does not parse — ${String(error)}`);
    }
    const multiple = Object.entries(variants)
      .filter(([, values]) => Array.isArray(values) && values.length > 1)
      .map(([key, values]) => `${key} (${(values as unknown[]).length})`);
    if (multiple.length > 0) {
      return fail(
        `${name} pins multiple values for ${multiple.join(", ")} in ${variantFile} — a variant matrix renders one output per combination`,
      );
    }
  }

  const lints: string[] = [];
  if (record(recipe.build).skip !== undefined) {
    // Evaluating rattler-build's expression language is a build-time question. Say the output may
    // not be produced rather than claiming either way.
    lints.push(
      `${name} carries build.skip in ${recipeFile} — its one declared output may not be produced for the grading platform`,
    );
  }

  return {
    dependency: {
      name,
      declared,
      resolved,
      version,
      recipe: relative(projectRoot, join(resolved, recipeFile)),
    },
    manifest,
    reasons: [],
    lints,
  };
}

/**
 * Check every local path dependency reachable from a manifest, recursing into the package
 * manifests they point at.
 *
 * `projectRoot` and `sourceRoot` are expected to be absolute and symlink-resolved, as
 * {@link Grade} records them.
 */
export function checkPathDependencies(
  manifest: Manifest,
  options: { projectRoot: string; sourceRoot: string },
): PathDependencyReport {
  const { projectRoot, sourceRoot } = options;
  const dependencies: PathDependency[] = [];
  const reasons: string[] = [];
  const lints: string[] = [];

  // Keyed by resolved directory, so a diamond — two packages depending on the same local recipe —
  // is inspected once and a cycle terminates instead of recursing forever.
  const seen = new Set<string>();
  const queue = declarations(manifest, projectRoot, "workspace");

  while (queue.length > 0) {
    const declaration = queue.shift() as Declaration;
    const result = inspect(declaration, sourceRoot, projectRoot);
    reasons.push(...result.reasons);

    if (result.dependency === undefined || result.manifest === undefined) {
      continue;
    }
    if (seen.has(result.dependency.resolved)) {
      // A diamond: two packages depending on the same local recipe. Already inspected, and its
      // lints were recorded then — repeating them would report one recipe's skip twice.
      continue;
    }
    seen.add(result.dependency.resolved);
    lints.push(...result.lints);
    dependencies.push(result.dependency);
    queue.push(...declarations(result.manifest, result.dependency.resolved, "package"));
  }

  return { dependencies, reasons, lints };
}
