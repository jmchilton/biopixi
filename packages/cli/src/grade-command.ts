import { grade, type Grade } from "@biopixi/core";

export interface GradeCommandOptions {
  minLevel?: number;
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
  let worst = 4;
  const undeterminable: string[] = [];
  for (const directory of directories) {
    const result = grade(directory);
    io.stdout(renderGrade(directory, result));
    if (result.level === null && result.conformant) {
      // In profile but unproven. Not L0 — biopixi has no level to compare against a threshold.
      undeterminable.push(`${directory} (${result.evidenceState})`);
    }
    worst = Math.min(worst, result.level ?? 0);
  }

  if (options.minLevel === undefined) {
    return 0;
  }
  if (undeterminable.length > 0) {
    io.stderr(
      `\nfailed: no level could be determined for ${undeterminable.join(", ")} — required L${options.minLevel}`,
    );
    return 1;
  }
  if (worst < options.minLevel) {
    io.stderr(`\nfailed: worst level L${worst} < required L${options.minLevel}`);
    return 1;
  }
  return 0;
}
