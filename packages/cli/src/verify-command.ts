import { grade, SourceRootError, verifyGrade, type VerifyOptions } from "@biopixi/core";

import { EXIT_CODES, renderGrade, type GradeCommandIo } from "./grade-command.js";
import { buildReport, type GradeReportEntry } from "./report.js";

export interface VerifyCommandOptions {
  minLevel?: number;
  sourceRoot?: string;
  json?: boolean;
  /** Fail unless every result carries a container that was actually observed. */
  requireVerified?: boolean;
  /** Injected in tests so the suite never reaches the network. */
  verify?: VerifyOptions;
}

const consoleIo: GradeCommandIo = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

function named(entries: GradeReportEntry[], detail: (entry: GradeReportEntry) => string): string {
  return entries.map((entry) => `${entry.directory} (${detail(entry)})`).join(", ");
}

/**
 * Grade one or more directories, then observe each container claim at its registry.
 *
 * This is the only command that reaches the network, and the only route to L4: the offline grade
 * stops at L3 because no file in a project records that an image was built and can be pulled.
 */
export async function runVerify(
  directories: string[],
  options: VerifyCommandOptions = {},
  io: GradeCommandIo = consoleIo,
): Promise<number> {
  // One timestamp for the whole run, so every result in a report refers to the same observation.
  const verifyOptions: VerifyOptions = {
    observedAt: new Date().toISOString(),
    ...options.verify,
  };

  const results: GradeReportEntry[] = [];
  for (const directory of directories) {
    let graded;
    try {
      graded = grade(directory, { sourceRoot: options.sourceRoot });
    } catch (error) {
      if (!(error instanceof SourceRootError)) {
        throw error;
      }
      io.stderr(`biopixi: ${error.message}`);
      return EXIT_CODES.usage;
    }

    const verified = await verifyGrade(graded, verifyOptions);
    results.push({ directory, ...verified });
    if (!options.json) {
      io.stdout(renderGrade(directory, verified));
      if (verified.observation?.outcome === "indeterminate") {
        // Distinguished from a negative in the exit code too: nothing was established here.
        io.stderr(`biopixi: could not check ${directory}: ${verified.observation.detail}`);
      }
    }
  }

  if (options.json) {
    io.stdout(JSON.stringify(buildReport(results), null, 2));
  }

  const outside = results.filter((entry) => !entry.conformant);
  if (outside.length > 0 && options.minLevel !== undefined) {
    const detail = named(outside, (entry) => entry.reasons[0] ?? "out of profile v0");
    io.stderr(`\nfailed: outside profile v0: ${detail} — required L${options.minLevel}`);
    return EXIT_CODES.outOfProfile;
  }

  if (options.requireVerified) {
    const unconfirmed = results.filter((entry) => entry.publication?.state !== "CONFIRMED");
    if (unconfirmed.length > 0) {
      const detail = named(
        unconfirmed,
        (entry) => entry.publication?.state ?? "no container claim",
      );
      io.stderr(`\nfailed: no observed container for ${detail}`);
      return EXIT_CODES.unconfirmed;
    }
  }

  if (options.minLevel === undefined) {
    return EXIT_CODES.ok;
  }

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
