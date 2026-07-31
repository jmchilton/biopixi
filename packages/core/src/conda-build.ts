import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import { grade, loadLock, type EvidenceState, type Grade } from "./grade.js";
import {
  dependencyChannel,
  effectiveCondaDependencies,
  manifestChannels,
  parseManifest,
  type Manifest,
} from "./manifest.js";

const BUILD_PLATFORM = "linux-64" as const;

/** One exact direct root in a portable Conda build request. */
export interface CondaBuildTarget {
  name: string;
  version: string;
  build: string;
  /** Present only when the manifest explicitly qualifies this dependency. */
  channel?: string;
  /** Resolved artifact URL retained as evidence, not for display in wrapper diagnostics. */
  source?: string;
}

/** Deterministic, builder-independent projection of a Biopixi project's Linux solve. */
export interface CondaBuildPlan {
  projectRoot: string;
  platform: typeof BUILD_PLATFORM;
  channels: string[];
  targets: CondaBuildTarget[];
}

export type CondaBuildPlanErrorKind =
  "invalid-project" | "unresolved" | "stale" | "unsupported-lock" | "insufficient-level";

/** A project cannot safely be projected into an exact Conda build request. */
export class CondaBuildPlanError extends Error {
  constructor(
    public readonly kind: CondaBuildPlanErrorKind,
    message: string,
    public readonly result?: Grade,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CondaBuildPlanError";
  }
}

export interface CondaBuildPlanOptions {
  /** Reject definitive evidence below this portability level. */
  minimumLevel?: number;
}

function projectDirectory(input: string): string {
  const absolute = resolve(input);
  const directory = basename(absolute) === "pixi.toml" ? dirname(absolute) : absolute;
  try {
    return realpathSync(directory);
  } catch {
    return directory;
  }
}

function evidenceKind(state: EvidenceState | null): CondaBuildPlanErrorKind {
  switch (state) {
    case "STALE":
      return "stale";
    case "UNSUPPORTED_LOCK":
      return "unsupported-lock";
    default:
      return "unresolved";
  }
}

/**
 * Project one Biopixi-compatible Pixi workspace into exact, sorted direct Conda roots.
 *
 * The grader supplies the conformance, lock reconciliation, channel, path-package, and public
 * evidence rules. This function only turns that reconciled evidence into a builder-neutral plan.
 */
export function planCondaBuild(input: string, options: CondaBuildPlanOptions = {}): CondaBuildPlan {
  const projectRoot = projectDirectory(input);
  const manifestPath = join(projectRoot, "pixi.toml");
  if (!existsSync(manifestPath)) {
    throw new CondaBuildPlanError("invalid-project", `no pixi.toml in ${projectRoot}`);
  }

  let result: Grade;
  try {
    result = grade(projectRoot);
  } catch (error) {
    throw new CondaBuildPlanError(
      "invalid-project",
      "project evidence could not be read or parsed",
      undefined,
      { cause: error },
    );
  }
  if (!result.conformant) {
    throw new CondaBuildPlanError(
      "invalid-project",
      `project is outside profile v0: ${result.reasons.join("; ")}`,
      result,
    );
  }
  if (result.evidenceState !== "DEFINITIVE" || result.level === null) {
    throw new CondaBuildPlanError(
      evidenceKind(result.evidenceState),
      `${result.label}: ${result.reasons.join("; ")}`,
      result,
    );
  }
  if (options.minimumLevel !== undefined && result.level < options.minimumLevel) {
    throw new CondaBuildPlanError(
      "insufficient-level",
      `build plan requires definitive L${options.minimumLevel} or higher evidence; this project is ${result.label}`,
      result,
    );
  }

  let manifest: Manifest;
  let locked: ReturnType<typeof loadLock>;
  try {
    manifest = parseManifest(manifestPath);
    locked = loadLock(join(projectRoot, "pixi.lock"), BUILD_PLATFORM);
  } catch (error) {
    throw new CondaBuildPlanError(
      "invalid-project",
      "project evidence could not be read or parsed",
      result,
      { cause: error },
    );
  }
  const dependencies = effectiveCondaDependencies(manifest, BUILD_PLATFORM);
  const byName = new Map(locked.packages.map((pkg) => [pkg.name, pkg]));

  const targets = Object.keys(dependencies)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((name): CondaBuildTarget => {
      const pkg = byName.get(name);
      if (pkg?.version === undefined || pkg.build === undefined) {
        throw new CondaBuildPlanError(
          "unsupported-lock",
          `pixi.lock does not record an exact version and build for direct dependency ${name}`,
          result,
        );
      }
      const target: CondaBuildTarget = { name, version: pkg.version, build: pkg.build };
      const channel = dependencyChannel(dependencies[name]);
      if (channel !== undefined) {
        target.channel = channel;
      }
      if (pkg.source !== undefined) {
        target.source = pkg.source;
      }
      return target;
    });

  return {
    projectRoot,
    platform: BUILD_PLATFORM,
    channels: manifestChannels(manifest),
    targets,
  };
}
