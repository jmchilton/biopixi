/**
 * @module @biopixi/cli
 *
 * Programmatic entry points for the `biopixi` command.
 */

export { EXIT_CODES, renderGrade, runGrade } from "./grade-command.js";
export type { GradeCommandIo, GradeCommandOptions } from "./grade-command.js";
export { buildProgram } from "./program.js";
export { buildReport, REPORT_SCHEMA_URL } from "./report.js";
export type { GradeReport, GradeReportEntry } from "./report.js";
