import type { Grade } from "@biopixi/core";

import packageMetadata from "../package.json" with { type: "json" };

/**
 * Where the schema for this payload is published. The generated schema carries the same string as
 * its `$id`, and a test holds the two together.
 */
export const REPORT_SCHEMA_URL =
  "https://jmchilton.github.io/biopixi/schema/grade-report-v0.schema.json";

/** One graded directory: the path as the caller wrote it, plus everything grading decided. */
export interface GradeReportEntry extends Grade {
  /** As supplied on the command line, so a caller can match results back to its own arguments. */
  directory: string;
}

/**
 * The `biopixi grade --json` payload.
 *
 * The envelope carries the versions a consumer needs to interpret `results`: `profile` is the
 * grading profile the levels are defined by, `biopixi` is the release that produced them.
 */
export interface GradeReport {
  /** Where this payload's schema is published. */
  $schema: string;
  /** The biopixi release that produced the results. */
  biopixi: string;
  /** The grading profile the levels are defined by. */
  profile: string;
  /** One entry per directory given, in the order they were given. */
  results: GradeReportEntry[];
}

export function buildReport(results: GradeReportEntry[]): GradeReport {
  return {
    $schema: REPORT_SCHEMA_URL,
    biopixi: packageMetadata.version,
    profile: "v0",
    results,
  };
}
