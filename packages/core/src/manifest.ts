/**
 * Reading TOML manifests, and the path arithmetic that decides whether one directory is inside
 * another. Shared by the profile check and the path-dependency check so both agree on what a
 * manifest is and on what "inside the source root" means.
 */
import { readFileSync } from "node:fs";
import { sep } from "node:path";

import { parse as parseToml } from "smol-toml";

export type Manifest = Record<string, unknown>;

/** Conda dependency tables in a workspace manifest, at the top level. */
export const CONDA_DEPENDENCY_TABLES = ["dependencies", "host-dependencies", "build-dependencies"];
/**
 * Dependency tables in a package manifest, which live under `[package.*]`. The runtime table is
 * spelled `run-dependencies` here rather than `dependencies`.
 */
export const PACKAGE_DEPENDENCY_TABLES = [
  "run-dependencies",
  "host-dependencies",
  "build-dependencies",
];

/** A TOML table as a plain record, or an empty one when the value is not a table. */
export function asRecord(value: unknown): Manifest {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Manifest)
    : {};
}

/** Present as an own key, whatever its value — `no-default-feature = false` is still present. */
export function hasOwn(value: Manifest, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function parseManifest(path: string): Manifest {
  return asRecord(parseToml(readFileSync(path, "utf8")));
}

/**
 * Every named dependency table that participates on `platforms`, labelled as a manifest author
 * would write it.
 *
 * Only the listed platforms are consulted, so a table under a platform the workspace does not
 * declare takes no part in anything: it is inert in Pixi and must be inert here too.
 */
export function dependencyTables(
  manifestRoot: Manifest,
  keys: readonly string[],
  platforms: readonly string[],
): Array<[string, Manifest]> {
  const tables: Array<[string, Manifest]> = [];
  for (const key of keys) {
    if (manifestRoot[key] !== undefined) {
      tables.push([key, asRecord(manifestRoot[key])]);
    }
  }

  const targetTables = asRecord(manifestRoot.target);
  for (const platform of platforms) {
    const platformTarget = asRecord(targetTables[platform]);
    for (const key of keys) {
      if (platformTarget[key] !== undefined) {
        tables.push([`target.${platform}.${key}`, asRecord(platformTarget[key])]);
      }
    }
  }
  return tables;
}

/**
 * Whether `descendant` is `ancestor` or lies beneath it.
 *
 * Compared on whole path segments: `…/exam` is a string prefix of `…/example` but contains none
 * of it. Both arguments are expected to be absolute and already symlink-resolved.
 */
export function isContainedIn(descendant: string, ancestor: string): boolean {
  return (
    descendant === ancestor ||
    descendant.startsWith(ancestor.endsWith(sep) ? ancestor : ancestor + sep)
  );
}
