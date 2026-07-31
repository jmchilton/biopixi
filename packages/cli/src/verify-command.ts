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

function formatNamedEntries(
  entries: GradeReportEntry[],
  describeEntry: (entry: GradeReportEntry) => string,
): string {
  return entries.map((entry) => `${entry.directory} (${describeEntry(entry)})`).join(", ");
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

  const reportEntries: GradeReportEntry[] = [];
  for (const directory of directories) {
    let offlineGrade;
    try {
      offlineGrade = grade(directory, { sourceRoot: options.sourceRoot });
    } catch (error) {
      if (!(error instanceof SourceRootError)) {
        throw error;
      }
      io.stderr(`biopixi: ${error.message}`);
      return EXIT_CODES.usage;
    }

    const verifiedGrade = await verifyGrade(offlineGrade, verifyOptions);
    reportEntries.push({ directory, ...verifiedGrade });
    if (!options.json) {
      io.stdout(renderGrade(directory, verifiedGrade));
      if (verifiedGrade.observation?.outcome === "indeterminate") {
        // Distinguished from a negative in the exit code too: nothing was established here.
        io.stderr(`biopixi: could not check ${directory}: ${verifiedGrade.observation.detail}`);
      }
    }
  }

  if (options.json) {
    io.stdout(JSON.stringify(buildReport(reportEntries), null, 2));
  }

  const outsideProfile = reportEntries.filter((entry) => !entry.conformant);
  if (outsideProfile.length > 0 && options.minLevel !== undefined) {
    const entrySummary = formatNamedEntries(
      outsideProfile,
      (entry) => entry.reasons[0] ?? "out of profile v0",
    );
    io.stderr(`\nfailed: outside profile v0: ${entrySummary} — required L${options.minLevel}`);
    return EXIT_CODES.outOfProfile;
  }

  if (options.requireVerified) {
    const unconfirmedEntries = reportEntries.filter(
      (entry) => entry.publication?.state !== "CONFIRMED",
    );
    if (unconfirmedEntries.length > 0) {
      const entrySummary = formatNamedEntries(
        unconfirmedEntries,
        (entry) => entry.publication?.state ?? "no container claim",
      );
      io.stderr(`\nfailed: no observed container for ${entrySummary}`);
      return EXIT_CODES.unconfirmed;
    }
  }

  if (options.minLevel === undefined) {
    return EXIT_CODES.ok;
  }

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
