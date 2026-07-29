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
  if (result.evidence !== undefined) {
    lines.push(`      evidence: ${result.evidence}`);
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
  for (const directory of directories) {
    const result = grade(directory);
    io.stdout(renderGrade(directory, result));
    worst = Math.min(worst, result.level ?? 0);
  }

  if (options.minLevel !== undefined && worst < options.minLevel) {
    io.stderr(`\nfailed: worst level L${worst} < required L${options.minLevel}`);
    return 1;
  }
  return 0;
}
