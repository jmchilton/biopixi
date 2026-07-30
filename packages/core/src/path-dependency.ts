/**
 * Profile v0's path-dependency contract.
 *
 * PROFILE.md accepts a local path dependency only as an L1 source package, and only when the tree
 * it points at can be read as exactly one package without building anything. Everything here is
 * decided by reading files: whether the package would actually build is a build-time fact and
 * outside what an offline grader can settle.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { parse as parseYaml } from "yaml";

import {
  containedIn,
  dependencyTables,
  parseManifest,
  record,
  CONDA_DEPENDENCY_TABLES,
  PACKAGE_DEPENDENCY_TABLES,
  type Manifest,
} from "./manifest.js";

/** The one local backend profile v0 can read inputs for. */
const SUPPORTED_BACKEND = "pixi-build-rattler-build";
const RECIPE_FILES = ["recipe.yaml", "recipe.yml"];
const VARIANT_FILES = ["variants.yaml", "variants.yml"];
/**
 * A version with no range operator, wildcard, or alternation left in it. `!` is deliberately
 * permitted: it is the epoch separator in a concrete Conda version such as `1!1.0.0`.
 */
const CONCRETE_VERSION = /^[^*<>=,|~^\s]+$/;
/** A `${{ name }}` reference, which is all of the template language this profile reads. */
const CONTEXT_REFERENCE = /\$\{\{\s*([A-Za-z_]\w*)\s*\}\}/g;
/** Source kinds that name a location instead of a package identity, at any depth. */
const FOREIGN_SOURCE_KINDS = ["git", "url"];

/** Where a path dependency was declared, which decides what it can be compared against. */
export type PathDependencyScope = "workspace" | "package";

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
  /**
   * `workspace` when the graded manifest declares it, `package` when another local package does.
   * Only a workspace declaration can be compared against the lock: Pixi resolves the rest at
   * build time and never writes them there.
   */
  scope: PathDependencyScope;
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
  scope: PathDependencyScope;
}

interface Scan {
  declarations: Declaration[];
  reasons: string[];
}

/**
 * Every `path =` entry participating on the grading platforms, and every entry that names a
 * foreign source instead.
 *
 * `git=` and `url=` are rejected here as well as at workspace scope, because PROFILE.md requires
 * a reached package's own requirements to be registry packages or conformant path dependencies —
 * a rule that would otherwise hold only at depth zero.
 */
function scan(
  manifest: Manifest,
  from: string,
  scope: PathDependencyScope,
  platforms: readonly string[],
): Scan {
  const root = scope === "package" ? record(manifest.package) : manifest;
  const keys = scope === "package" ? PACKAGE_DEPENDENCY_TABLES : CONDA_DEPENDENCY_TABLES;
  const declarations: Declaration[] = [];
  const reasons: string[] = [];

  for (const [label, table] of dependencyTables(root, keys, platforms)) {
    for (const [name, value] of Object.entries(table)) {
      const specification = record(value);
      if (typeof specification.path === "string") {
        declarations.push({ name, declared: specification.path, from, scope });
        continue;
      }
      // Only reported at package scope; checkProfile already says this about the workspace, and
      // saying it twice about one dependency reads as two problems.
      if (scope === "package") {
        for (const kind of FOREIGN_SOURCE_KINDS) {
          if (specification[kind] !== undefined) {
            reasons.push(
              `${name} in [${label}] of a local package is declared by ${kind}= — a reached package may require only registry packages or conformant path dependencies`,
            );
          }
        }
      }
    }
  }
  return { declarations, reasons };
}

/** The first of `names` that exists in `directory`, or undefined. */
function firstPresent(directory: string, names: readonly string[]): string | undefined {
  return names.find((name) => existsSync(join(directory, name)));
}

function parseYamlFile(path: string): Manifest {
  return record(parseYaml(readFileSync(path, "utf8")));
}

/** Parser diagnostics run to several lines; a reason is one line. */
function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n", 1)[0].trim();
}

/**
 * Substitute the `${{ key }}` references a recipe makes to its own `context:` block.
 *
 * Defining name and version once in `context:` is the ordinary rattler-build form, so refusing to
 * read it would reject most real recipes. This is a lookup, not evaluation: a reference to
 * anything other than a plain `context:` string or number is left exactly as written, and so
 * fails the comparison it feeds.
 */
function substituteContext(recipe: Manifest, value: string): string {
  const context = record(recipe.context);
  return value.replace(CONTEXT_REFERENCE, (reference, key: string) => {
    const replacement = context[key];
    return typeof replacement === "string" || typeof replacement === "number"
      ? String(replacement)
      : reference;
  });
}

/** Absolute, symlink-resolved, and inside the bound — or the reason it is none of those. */
function locate(
  declaration: Declaration,
  sourceRoot: string,
): { resolved?: string; reason?: string } {
  const { name, declared, from } = declaration;

  if (isAbsolute(declared)) {
    return {
      reason: `${name} declared by an absolute path (${declared}) — a path dependency must be relative so the source tree can be moved or cloned`,
    };
  }

  const target = resolve(from, declared);
  if (!existsSync(target)) {
    return { reason: `${name} points at ${declared}, which does not exist` };
  }
  if (!statSync(target).isDirectory()) {
    return { reason: `${name} points at ${declared}, which is a file rather than a directory` };
  }

  const resolved = realpathSync(target);
  if (!containedIn(resolved, sourceRoot)) {
    return {
      reason: `${name} resolves to ${resolved}, outside the selected source root ${sourceRoot} — nothing bounds what would have to be shipped to rebuild it`,
    };
  }
  return { resolved };
}

/**
 * Check a located package against the contract, stopping at its first defect.
 *
 * One reason per dependency: a package with no recipe has nothing more to say about that recipe's
 * outputs, and listing the consequences of a single mistake buries the mistake.
 */
function examine(
  declaration: Declaration,
  resolved: string,
  projectRoot: string,
): { dependency?: PathDependency; manifest?: Manifest; reasons: string[]; lints: string[] } {
  const { name, declared, scope } = declaration;
  const fail = (reason: string) => ({ reasons: [reason], lints: [] });

  const manifestPath = join(resolved, "pixi.toml");
  if (!existsSync(manifestPath)) {
    return fail(`${name} points at ${declared}, which contains no pixi.toml package manifest`);
  }

  let manifest: Manifest;
  try {
    manifest = parseManifest(manifestPath);
  } catch (error) {
    return fail(`${name}: ${declared}/pixi.toml does not parse — ${firstLine(error)}`);
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
    return fail(`${name}: ${recipeFile} does not parse — ${firstLine(error)}`);
  }

  if (recipe.outputs !== undefined) {
    const count = Array.isArray(recipe.outputs) ? `${recipe.outputs.length} outputs` : "not a list";
    return fail(
      `${name} has an outputs: key in ${recipeFile} (${count}) — profile v0 requires a top-level package: mapping declaring exactly one`,
    );
  }

  const recipePackage = record(recipe.package);
  if (typeof recipePackage.name !== "string") {
    return fail(
      `${name} has no top-level package: mapping in ${recipeFile} — profile v0 requires the single-output recipe form`,
    );
  }
  const recipeName = substituteContext(recipe, recipePackage.name);
  if (recipeName !== name) {
    return fail(
      `${name} is built by a recipe declaring package.name '${recipeName}' in ${recipeFile}`,
    );
  }

  // YAML reads an unquoted 1.0 as a number, which would silently compare as "1". Say so rather
  // than reporting a mismatch against a value the file does not contain.
  if (typeof recipePackage.version !== "string") {
    return fail(
      `${name} has an unquoted package.version in ${recipeFile} — quote it so it is read as a version rather than as a number`,
    );
  }
  const recipeVersion = substituteContext(recipe, recipePackage.version);
  if (recipeVersion !== version) {
    return fail(
      `${name} declares version ${version} but ${recipeFile} builds ${recipeVersion} — the recipe and the package manifest must agree`,
    );
  }

  const variantFile = firstPresent(resolved, VARIANT_FILES);
  if (variantFile !== undefined) {
    let variants: Manifest;
    try {
      variants = parseYamlFile(join(resolved, variantFile));
    } catch (error) {
      return fail(`${name}: ${variantFile} does not parse — ${firstLine(error)}`);
    }
    const multiple = Object.entries(variants)
      .filter(([, values]) => Array.isArray(values) && values.length > 1)
      .map(([key, values]) => `${key} (${(values as unknown[]).length})`);
    if (multiple.length > 0) {
      return fail(
        `${name} pins multiple values for ${multiple.join(", ")} in ${variantFile} — profile v0 does not evaluate which variant keys a recipe uses, so it cannot show this renders one output`,
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
      scope,
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
 * `projectRoot` and `sourceRoot` are expected to be absolute and symlink-resolved, as a
 * {@link Grade} records them. `platforms` bounds which target tables participate.
 */
export function checkPathDependencies(
  manifest: Manifest,
  options: { projectRoot: string; sourceRoot: string; platforms: readonly string[] },
): PathDependencyReport {
  const { projectRoot, sourceRoot, platforms } = options;
  const dependencies: PathDependency[] = [];
  const reasons: string[] = [];
  const lints: string[] = [];

  // Keyed by resolved directory, so a diamond — two packages depending on the same local recipe —
  // is inspected once, and a cycle terminates instead of recursing forever. Checked before the
  // package is examined so a shared defect is reported once, not once per route to it.
  const seen = new Set<string>();
  const root = scan(manifest, projectRoot, "workspace", platforms);
  reasons.push(...root.reasons);
  const queue = root.declarations;

  while (queue.length > 0) {
    const declaration = queue.shift() as Declaration;
    const { resolved, reason } = locate(declaration, sourceRoot);
    if (resolved === undefined) {
      reasons.push(reason as string);
      continue;
    }
    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);

    const result = examine(declaration, resolved, projectRoot);
    reasons.push(...result.reasons);
    lints.push(...result.lints);
    if (result.dependency === undefined || result.manifest === undefined) {
      continue;
    }

    dependencies.push(result.dependency);
    const nested = scan(result.manifest, resolved, "package", platforms);
    reasons.push(...nested.reasons);
    queue.push(...nested.declarations);
  }

  return { dependencies, reasons, lints };
}
