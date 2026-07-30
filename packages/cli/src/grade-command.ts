import { grade, SourceRootError, type Grade } from "@biopixi/core";

import { buildReport, type GradeReportEntry } from "./report.js";

/**
 * What `--min-level` failed on, in the order PROFILE.md asks the questions: whether the manifest
 * is in profile, then whether a solve backs it, then how far it travels. Collapsing these onto one
 * code makes "this project is not gradeable" indistinguishable from "this project scored low",
 * which are different problems with different fixes.
 *
 * Invocation faults use EX_USAGE, well clear of the verdicts, so a bad source root can never be
 * read as a statement about the project.
 */
export const EXIT_CODES = {
  ok: 0,
  belowThreshold: 1,
  indefinite: 2,
  outOfProfile: 3,
  usage: 64,
} as const;

export interface GradeCommandOptions {
  minLevel?: number;
  sourceRoot?: string;
  /** Emit the machine-readable report on stdout instead of the human rendering. */
  json?: boolean;
}

export interface GradeCommandIo {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

const consoleIo: GradeCommandIo = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

/**
 * Render one grade in the human-readable command-line format.
 */
export function renderGrade(directory: string, result: Grade): string {
  const lines = [``, `${result.label}  ${directory}`];
  for (const reason of result.reasons) {
    lines.push(`      · ${reason}`);
  }
  if (result.sourceRoot !== result.projectRoot) {
    // Only worth a line once it has been widened past the project: the default is already implied.
    lines.push(`      source root: ${result.sourceRoot}`);
  }
  for (const dependency of result.pathDependencies ?? []) {
    // The recipe, not the directory: it is what was actually read to accept the dependency.
    lines.push(`      builds: ${dependency.name} ${dependency.version} from ${dependency.recipe}`);
  }
  if (result.target !== undefined) {
    lines.push(`      target: ${result.target}`);
  }
  if (result.cap !== undefined) {
    const { package: name, version, channel, artifact } = result.cap;
    const from = channel === null ? "built from source" : `from ${channel}`;
    lines.push(`      capped by: ${name}${version === undefined ? "" : ` ${version}`} ${from}`);
    lines.push(`                 ${artifact}`);
  }
  if (result.publication !== undefined) {
    // Never print a bare URI: an unverified container name reads as a checked fact otherwise.
    const state = result.publication.verified ? "verified" : "UNVERIFIED";
    lines.push(`      container: ${result.publication.uri}`);
    lines.push(`                 ${state} — ${result.publication.basis}`);
  }
  if (result.snapshot !== undefined) {
    const { path, revision, fetched } = result.snapshot;
    const at = revision === null ? "revision unrecorded" : revision.slice(0, 8);
    lines.push(`      metadata:  ${path} @ ${at}, fetched ${fetched}`);
  }
  for (const action of result.nextActions) {
    lines.push(`      → ${action}`);
  }
  for (const lint of result.lints) {
    lines.push(`      lint: ${lint}`);
  }
  return lines.join("\n");
}

function named(entries: GradeReportEntry[], detail: (entry: GradeReportEntry) => string): string {
  return entries.map((entry) => `${entry.directory} (${detail(entry)})`).join(", ");
}

/**
 * Grade one or more directories and return one of {@link EXIT_CODES}.
 *
 * Without `--min-level` this is reporting rather than assertion, and the code is always `ok`.
 */
export function runGrade(
  directories: string[],
  options: GradeCommandOptions = {},
  io: GradeCommandIo = consoleIo,
): number {
  const results: GradeReportEntry[] = [];
  for (const directory of directories) {
    let result: Grade;
    try {
      result = grade(directory, { sourceRoot: options.sourceRoot });
    } catch (error) {
      if (!(error instanceof SourceRootError)) {
        throw error;
      }
      io.stderr(`biopixi: ${error.message}`);
      return EXIT_CODES.usage;
    }
    results.push({ directory, ...result });
    if (!options.json) {
      io.stdout(renderGrade(directory, result));
    }
  }

  // The payload is emitted before any verdict: a consumer needs it most when the gate fails.
  if (options.json) {
    io.stdout(JSON.stringify(buildReport(results), null, 2));
  }

  if (options.minLevel === undefined) {
    return EXIT_CODES.ok;
  }

  // Conformance first: an out-of-profile manifest was never solved, so it has no evidence state
  // to report and no level to compare — it fails for a different reason than a low grade.
  const outside = results.filter((entry) => !entry.conformant);
  if (outside.length > 0) {
    const detail = named(outside, (entry) => entry.reasons[0] ?? "out of profile v0");
    io.stderr(`\nfailed: outside profile v0: ${detail} — required L${options.minLevel}`);
    return EXIT_CODES.outOfProfile;
  }

  // In profile but unproven. Not L0 — biopixi has no level to compare against a threshold.
  const undeterminable = results.filter((entry) => entry.level === null);
  if (undeterminable.length > 0) {
    const detail = named(undeterminable, (entry) => entry.evidenceState ?? "no evidence");
    io.stderr(
      `\nfailed: no level could be determined for ${detail} — required L${options.minLevel}`,
    );
    return EXIT_CODES.indefinite;
  }

  const worst = results.reduce((lowest, entry) => Math.min(lowest, entry.level ?? 0), 4);
  if (worst < options.minLevel) {
    io.stderr(`\nfailed: worst level L${worst} < required L${options.minLevel}`);
    return EXIT_CODES.belowThreshold;
  }
  return EXIT_CODES.ok;
}
