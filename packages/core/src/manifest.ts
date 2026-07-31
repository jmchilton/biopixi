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

/** Read the workspace table, accepting the legacy spelling so profile errors stay specific. */
export function workspaceTable(manifest: Manifest): Manifest {
  return asRecord(manifest.workspace ?? manifest.project);
}

/** Platforms declared by a Pixi workspace, excluding malformed non-string entries. */
export function declaredPlatforms(manifest: Manifest): string[] {
  const platforms = workspaceTable(manifest).platforms;
  return Array.isArray(platforms)
    ? platforms.filter((platform): platform is string => typeof platform === "string")
    : [];
}

/** Direct Conda dependencies effective for one platform, including target overrides. */
export function effectiveCondaDependencies(manifest: Manifest, platform: string): Manifest {
  return {
    ...asRecord(manifest.dependencies),
    ...asRecord(asRecord(asRecord(manifest.target)[platform]).dependencies),
  };
}

/** An explicit per-dependency channel qualifier, if the dependency declares one. */
export function dependencyChannel(value: unknown): string | undefined {
  const channel = asRecord(value).channel;
  return typeof channel === "string" && channel.length > 0 ? channel : undefined;
}

/** The manifest's version constraint for a dependency, if it spells one. */
export function dependencyVersion(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  const version = asRecord(value).version;
  return typeof version === "string" ? version : undefined;
}

/** The manifest's build-string constraint for a dependency, if it spells one. */
export function dependencyBuild(value: unknown): string | undefined {
  const build = asRecord(value).build;
  return typeof build === "string" ? build : undefined;
}

/** Workspace channel spellings in manifest order, with exact duplicates removed. */
export function manifestChannels(manifest: Manifest): string[] {
  const channels = workspaceTable(manifest).channels;
  if (!Array.isArray(channels)) {
    return [];
  }
  return [...new Set(channels.filter((channel): channel is string => typeof channel === "string"))];
}

/** Parse a Pixi TOML manifest from disk. */
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
