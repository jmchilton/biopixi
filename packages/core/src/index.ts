/**
 * @module @biopixi/core
 *
 * Offline grading primitives for Pixi portability and BioContainers publication.
 */

export {
  checkProfile,
  grade,
  loadCombinations,
  loadLock,
  parseManifest,
  SourceRootError,
} from "./grade.js";
export type {
  Cap,
  EvidenceState,
  Grade,
  GradeOptions,
  LockedPackage,
  Manifest,
  MetadataSnapshot,
  Publication,
} from "./grade.js";
export { pullUri, v2ImageName } from "./mulled.js";
export type { Target } from "./mulled.js";
