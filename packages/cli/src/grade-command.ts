import {
  EXIT_CODES,
  grade,
  redactSensitiveUrls,
  SourceRootError,
  type CommandIo,
  type Grade,
} from "@biopixi/core";

import { buildReport, type GradeReportEntry } from "./report.js";

export { EXIT_CODES };

export interface GradeCommandOptions {
  minLevel?: number;
  sourceRoot?: string;
  /** Emit the machine-readable report on stdout instead of the human rendering. */
  json?: boolean;
}

/** @deprecated Use {@link CommandIo}: every biopixi command writes the same way. */
export type GradeCommandIo = CommandIo;

const consoleIo: CommandIo = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

export function renderGrade(directory: string, gradeResult: Grade): string {
  const lines = [``, `${gradeResult.label}  ${directory}`];
  for (const reason of gradeResult.reasons) {
    lines.push(`      · ${reason}`);
  }
  if (gradeResult.sourceRoot !== gradeResult.projectRoot) {
    // Only worth a line once it has been widened past the project: the default is already implied.
    lines.push(`      source root: ${gradeResult.sourceRoot}`);
  }
  for (const dependency of gradeResult.pathDependencies ?? []) {
    // The recipe, not the directory: it is what was actually read to accept the dependency.
    lines.push(`      builds: ${dependency.name} ${dependency.version} from ${dependency.recipe}`);
  }
  if (gradeResult.target !== undefined) {
    lines.push(`      target: ${gradeResult.target}`);
  }
  if (gradeResult.cap !== undefined) {
    const { package: name, version, channel, artifact } = gradeResult.cap;
    const sourceDescription = channel === null ? "built from source" : `from ${channel}`;
    lines.push(
      `      capped by: ${name}${version === undefined ? "" : ` ${version}`} ${sourceDescription}`,
    );
    lines.push(`                 ${artifact}`);
  }
  if (gradeResult.publication !== undefined) {
    // Never print a bare URI: a container name nobody has looked for reads as a checked fact.
    const { uri, state, basis, digest } = gradeResult.publication;
    lines.push(`      container: ${uri}`);
    lines.push(`                 ${state} — ${basis}`);
    if (digest !== undefined) {
      lines.push(`                 ${digest}`);
    }
  }
  if (gradeResult.snapshot !== undefined) {
    const { path, revision, fetched } = gradeResult.snapshot;
    const snapshotRevision = revision === null ? "revision unrecorded" : revision.slice(0, 8);
    lines.push(`      metadata:  ${path} @ ${snapshotRevision}, fetched ${fetched}`);
  }
  for (const action of gradeResult.nextActions) {
    lines.push(`      → ${action}`);
  }
  for (const lint of gradeResult.lints) {
    lines.push(`      lint: ${lint}`);
  }
  // Redact once, at the boundary, rather than at each site that assembles a line. Reasons, next
  // actions, and cap artifacts all embed URLs that came from a lock this renderer never inspected,
  // and a credential that reaches a terminal or a CI log has already leaked.
  return redactSensitiveUrls(lines.join("\n"));
}

function formatNamedEntries(
  entries: GradeReportEntry[],
  describeEntry: (entry: GradeReportEntry) => string,
): string {
  return entries.map((entry) => `${entry.directory} (${describeEntry(entry)})`).join(", ");
}

/** Without `--min-level` this is reporting rather than assertion, and the code is always `ok`. */
export function runGrade(
  directories: string[],
  options: GradeCommandOptions = {},
  io: GradeCommandIo = consoleIo,
): number {
  const reportEntries: GradeReportEntry[] = [];
  for (const directory of directories) {
    let gradeResult: Grade;
    try {
      gradeResult = grade(directory, { sourceRoot: options.sourceRoot });
    } catch (error) {
      if (!(error instanceof SourceRootError)) {
        throw error;
      }
      io.stderr(`biopixi: ${error.message}`);
      return EXIT_CODES.usage;
    }
    reportEntries.push({ directory, ...gradeResult });
    if (!options.json) {
      io.stdout(renderGrade(directory, gradeResult));
    }
  }

  // The payload is emitted before any verdict: a consumer needs it most when the gate fails.
  if (options.json) {
    io.stdout(JSON.stringify(buildReport(reportEntries), null, 2));
  }

  if (options.minLevel === undefined) {
    return EXIT_CODES.ok;
  }

  // Conformance first: an out-of-profile manifest was never solved, so it has no evidence state
  // to report and no level to compare — it fails for a different reason than a low grade.
  const outsideProfile = reportEntries.filter((entry) => !entry.conformant);
  if (outsideProfile.length > 0) {
    const entrySummary = formatNamedEntries(
      outsideProfile,
      (entry) => entry.reasons[0] ?? "out of profile v0",
    );
    io.stderr(`\nfailed: outside profile v0: ${entrySummary} — required L${options.minLevel}`);
    return EXIT_CODES.outOfProfile;
  }

  // In profile but unproven. Not L0 — biopixi has no level to compare against a threshold.
  const ungradedEntries = reportEntries.filter((entry) => entry.level === null);
  if (ungradedEntries.length > 0) {
    const entrySummary = formatNamedEntries(
      ungradedEntries,
      (entry) => entry.evidenceState ?? "no evidence",
    );
    io.stderr(
      `\nfailed: no level could be determined for ${entrySummary} — required L${options.minLevel}`,
    );
    return EXIT_CODES.indefinite;
  }

  const lowestLevel = reportEntries.reduce(
    (lowest, entry) => Math.min(lowest, entry.level ?? 0),
    4,
  );
  if (lowestLevel < options.minLevel) {
    io.stderr(`\nfailed: worst level L${lowestLevel} < required L${options.minLevel}`);
    return EXIT_CODES.belowThreshold;
  }
  return EXIT_CODES.ok;
}
