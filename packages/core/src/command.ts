/**
 * The contract every biopixi executable shares: one exit-code vocabulary and one output shim.
 *
 * These live in core rather than in a CLI package because there is more than one executable —
 * `biopixi`, `wave-biopixi`, and the local builder that follows — and a caller scripting against
 * two of them should not have to learn two meanings for the same number. Core is the one package
 * all of them already depend on.
 */

/**
 * What a biopixi command failed on.
 *
 * The low codes are verdicts about a project, in the order PROFILE.md asks the questions: whether
 * the manifest is in profile, then whether a solve backs it, then how far it travels. Collapsing
 * these onto one code makes "this project is not gradeable" indistinguishable from "this project
 * scored low", which are different problems with different fixes.
 *
 * The sysexits-range codes are faults in the invocation or the environment rather than findings
 * about the project, so a bad source root or a missing external tool can never be read as a
 * statement about the code being graded.
 *
 * A command that runs an external tool and propagates its exit status — `wave-biopixi` does —
 * cannot keep its own codes disjoint from the child's. Such a command reports every project
 * verdict as {@link EXIT_CODES.dataError} so that its low codes belong unambiguously to the child.
 */
export const EXIT_CODES = {
  ok: 0,
  belowThreshold: 1,
  indefinite: 2,
  outOfProfile: 3,
  /** `verify --require-verified` only: a container claim nobody could observe. */
  unconfirmed: 4,
  /** EX_USAGE: the command line itself was wrong. */
  usage: 64,
  /** EX_DATAERR: the project's evidence cannot support what was asked of it. */
  dataError: 65,
  /** EX_UNAVAILABLE: an external tool this command drives could not be started. */
  unavailable: 69,
  /** EX_SOFTWARE: an internal fault, distinct from anything the project or the user did. */
  internal: 70,
} as const;

/**
 * Where a command writes.
 *
 * Injected everywhere so the suite never touches the real streams, and so the rule that normal
 * stdout belongs to the payload — a grade report, or a wrapped tool's own output — is enforced by
 * the type rather than by convention.
 */
export interface CommandIo {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}
