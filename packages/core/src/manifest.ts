/**
 * Reading TOML manifests, and the path arithmetic that decides whether one directory is inside
 * another. Shared by the profile check and the path-dependency check so both agree on what a
 * manifest is and on what "inside the source root" means.
 */
import { readFileSync } from "node:fs";
import { sep } from "node:path";

import { parse as parseToml } from "smol-toml";

export type Manifest = Record<string, unknown>;

/** A TOML table as a plain record, or an empty one when the value is not a table. */
export function record(value: unknown): Manifest {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Manifest)
    : {};
}

/** Present as an own key, whatever its value — `no-default-feature = false` is still present. */
export function hasOwn(value: Manifest, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Parse a Pixi TOML manifest from disk.
 */
export function parseManifest(path: string): Manifest {
  return record(parseToml(readFileSync(path, "utf8")));
}

/**
 * Whether `descendant` is `ancestor` or lies beneath it.
 *
 * Compared on whole path segments: `…/exam` is a string prefix of `…/example` but contains none
 * of it. Both arguments are expected to be absolute and already symlink-resolved.
 */
export function containedIn(descendant: string, ancestor: string): boolean {
  return (
    descendant === ancestor ||
    descendant.startsWith(ancestor.endsWith(sep) ? ancestor : ancestor + sep)
  );
}
