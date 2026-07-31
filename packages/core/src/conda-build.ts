import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  grade,
  loadLock,
  resolveDirectRoots,
  resolveProjectDirectory,
  type CondaRoot,
  type EvidenceState,
  type Grade,
} from "./grade.js";
import { effectiveCondaDependencies, manifestChannels, parseManifest } from "./manifest.js";

const BUILD_PLATFORM = "linux-64" as const;

/**
 * One exact direct root in a portable Conda build request.
 *
 * A {@link CondaRoot} whose version and build are known to be present — the distinction a builder
 * cares about, since it has nothing to ask for without them.
 */
export interface CondaBuildTarget extends CondaRoot {
  version: string;
  build: string;
}

/** Deterministic, builder-independent projection of a Biopixi project's Linux solve. */
export interface CondaBuildPlan {
  projectRoot: string;
  platform: typeof BUILD_PLATFORM;
  /**
   * Workspace channels in manifest order, duplicates removed.
   *
   * Safe to forward to a builder because grading has already refused any project whose lock
   * records a different channel list or order than the manifest declares; by the time a plan
   * exists, the two spellings are known to describe the same solve.
   */
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
  /** Widen the path-dependency bound to an ancestor of the project root, as `grade` does. */
  sourceRoot?: string;
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
 * evidence rules, and {@link resolveDirectRoots} decides what a direct root is. This function only
 * asserts that the evidence is good enough to build from and that every root is exactly pinned.
 * Nothing here re-derives a rule the grader already applied: if the two ever disagreed about a
 * project, the container built would not be the one that was graded.
 *
 * Accepts the project directory or the `pixi.toml` inside it.
 */
export function planCondaBuild(input: string, options: CondaBuildPlanOptions = {}): CondaBuildPlan {
  const projectRoot = resolveProjectDirectory(input);
  const manifestPath = join(projectRoot, "pixi.toml");
  if (!existsSync(manifestPath)) {
    throw new CondaBuildPlanError("invalid-project", `no pixi.toml in ${projectRoot}`);
  }

  let result: Grade;
  try {
    result = grade(projectRoot, { sourceRoot: options.sourceRoot });
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

  let roots: CondaRoot[];
  let channels: string[];
  try {
    const manifest = parseManifest(manifestPath);
    const locked = loadLock(join(projectRoot, "pixi.lock"), BUILD_PLATFORM);
    roots = resolveDirectRoots(
      effectiveCondaDependencies(manifest, BUILD_PLATFORM),
      new Map(locked.packages.map((lockedPackage) => [lockedPackage.name, lockedPackage])),
    );
    channels = manifestChannels(manifest);
  } catch (error) {
    throw new CondaBuildPlanError(
      "invalid-project",
      "project evidence could not be read or parsed",
      result,
      { cause: error },
    );
  }

  const targets = roots.map((root): CondaBuildTarget => {
    if (root.version === undefined || root.build === undefined) {
      // Reachable only below L2, where a root can be built from source and have neither. A caller
      // that set no minimum level gets a clear refusal rather than an underspecified request.
      throw new CondaBuildPlanError(
        "unsupported-lock",
        `pixi.lock does not record an exact version and build for direct dependency ${root.name}`,
        result,
      );
    }
    return { ...root, version: root.version, build: root.build };
  });

  return { projectRoot, platform: BUILD_PLATFORM, channels, targets };
}
