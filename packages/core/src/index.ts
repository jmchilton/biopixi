/**
 * @module @biopixi/core
 *
 * Offline grading primitives for Pixi portability and BioContainers publication.
 */

export { checkProfile, grade, loadCombinations, loadLock, SourceRootError } from "./grade.js";
export type {
  Cap,
  EvidenceState,
  Grade,
  GradeOptions,
  LockedPackage,
  MetadataSnapshot,
  Publication,
  PublicationState,
} from "./grade.js";
export { observe, parsePullUri, verifyGrade } from "./verify.js";
export type { Fetcher, Observation, VerifiedGrade, VerifyOptions } from "./verify.js";
export { parseManifest } from "./manifest.js";
export type { Manifest } from "./manifest.js";
export { checkPathDependencies } from "./path-dependency.js";
export type { PathDependency, PathDependencyReport } from "./path-dependency.js";
export { pullUri, v2ImageName } from "./mulled.js";
export type { Target } from "./mulled.js";
export { CondaBuildPlanError, planCondaBuild } from "./conda-build.js";
export type {
  CondaBuildPlan,
  CondaBuildPlanErrorKind,
  CondaBuildPlanOptions,
  CondaBuildTarget,
} from "./conda-build.js";
