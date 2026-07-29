import { createHash } from "node:crypto";

/**
 * One direct Conda target used to derive a BioContainers repository and tag.
 */
export interface Target {
  package: string;
  version?: string;
  build?: string;
}

function sha1(lines: string[]): string {
  return createHash("sha1").update(lines.join("\n")).digest("hex");
}

function simpleImageName(target: Target, imageBuild?: string): string {
  if (target.version === undefined) {
    return target.package;
  }

  let build = target.build;
  if (build === undefined && imageBuild !== undefined && imageBuild !== "0") {
    build = imageBuild;
  }

  return `${target.package}:${target.version}${build === undefined ? "" : `--${build}`}`;
}

/**
 * Compute the offline mulled-v2 `repository:tag` for a set of Conda targets.
 *
 * This mirrors the naming algorithm used by Galaxy's mulled tooling. A single
 * target is not hashed; multi-target names hash sorted package names and versions.
 */
export function v2ImageName(targets: Target[], imageBuild?: string): string {
  if (targets.length === 0) {
    throw new Error("at least one target is required");
  }
  if (targets.length === 1) {
    return simpleImageName(targets[0], imageBuild);
  }

  const ordered = [...targets].sort((left, right) => left.package.localeCompare(right.package));
  const packageHash = sha1(ordered.map((target) => target.package));
  const hasVersion = ordered.some((target) => target.version !== undefined);
  const versionHash = hasVersion ? sha1(ordered.map((target) => target.version ?? "null")) : "";

  let buildSuffix = "";
  if (imageBuild !== undefined && imageBuild !== "") {
    buildSuffix = versionHash === "" ? imageBuild : `-${imageBuild}`;
  }

  const suffix = versionHash !== "" || buildSuffix !== "" ? `:${versionHash}${buildSuffix}` : "";
  return `mulled-v2-${packageHash}${suffix}`;
}

/**
 * Return the canonical quay.io pull URI for a target set.
 */
export function pullUri(targets: Target[], imageBuild?: string): string {
  return `quay.io/biocontainers/${v2ImageName(targets, imageBuild)}`;
}
