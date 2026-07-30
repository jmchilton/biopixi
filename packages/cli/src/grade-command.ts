import { grade, SourceRootError, type Grade } from "@biopixi/core";

import { buildReport, type GradeReportEntry } from "./report.js";

/**
 * Invocation faults are reported as EX_USAGE so they can never be read as a grading verdict:
 * a bad source root says nothing about how far the project can travel.
 */
const EXIT_USAGE = 64;

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

/**
 * Grade one or more directories and return a process exit code.
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
      return EXIT_USAGE;
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
    return 0;
  }
  // In profile but unproven. Not L0 — biopixi has no level to compare against a threshold.
  const undeterminable = results.filter((entry) => entry.conformant && entry.level === null);
  if (undeterminable.length > 0) {
    const named = undeterminable
      .map((entry) => `${entry.directory} (${entry.evidenceState})`)
      .join(", ");
    io.stderr(
      `\nfailed: no level could be determined for ${named} — required L${options.minLevel}`,
    );
    return 1;
  }
  const worst = results.reduce((lowest, entry) => Math.min(lowest, entry.level ?? 0), 4);
  if (worst < options.minLevel) {
    io.stderr(`\nfailed: worst level L${worst} < required L${options.minLevel}`);
    return 1;
  }
  return 0;
}
