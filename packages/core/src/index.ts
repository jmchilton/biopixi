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
} from "./grade.js";
export { parseManifest } from "./manifest.js";
export type { Manifest } from "./manifest.js";
export { checkPathDependencies } from "./path-dependency.js";
export type { PathDependency, PathDependencyReport } from "./path-dependency.js";
export { pullUri, v2ImageName } from "./mulled.js";
export type { Target } from "./mulled.js";
