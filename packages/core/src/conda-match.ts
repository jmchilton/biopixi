/**
 * Offline matching for the subset of Conda MatchSpec that Pixi dependencies use.
 *
 * This is a deliberate partial implementation, and the partiality is the point. biopixi uses these
 * comparisons only to *accuse* a lock of being stale, so a wrong answer costs a project its grade
 * entirely. Anything this module cannot decide with confidence is reported as undecidable rather
 * than guessed at — see {@link condaVersionDecidable}.
 */

import { canonicalChannelUrl } from "./channel-url.js";

/** Stable identity for comparing a manifest channel with its lock representation. */
export function channelIdentity(channel: string): string {
  const canonical = canonicalChannelUrl(channel);
  if (canonical === undefined) {
    return `name:${channel}`;
  }
  const url = new URL(canonical);
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.host === "conda.anaconda.org" && parts.length === 1) {
    return `name:${parts[0]}`;
  }
  return `url:${canonical}`;
}

/** Compare URL qualifiers exactly and named qualifiers by the lock's logical channel name. */
export function channelMatches(
  qualifier: string,
  lockedChannel: string | null,
  lockedChannelUrl?: string,
): boolean {
  const qualifierUrl = canonicalChannelUrl(qualifier);
  return qualifierUrl === undefined
    ? qualifier === lockedChannel
    : qualifierUrl === lockedChannelUrl;
}

/** Match the `*` glob syntax used by Conda version and build constraints. */
export function condaGlobMatches(pattern: string, value: string): boolean {
  const expression = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}$`, "i").test(value);
}

/**
 * Split a version into comparable runs of digits and letters.
 *
 * Every other character is dropped, which is why an epoch (`1!2.0`) and a local version
 * (`1.0+cuda`) are not comparable here: `1!2.0` and `1.2.0` tokenize identically, and an epoch
 * dominates every ordinary segment in Conda's ordering rather than sitting in front of it.
 * {@link condaVersionDecidable} refuses those inputs so the ambiguity never reaches a verdict.
 */
function versionParts(value: string): Array<number | string> {
  return (value.toLowerCase().match(/[0-9]+|[a-z]+/g) ?? []).map((part) =>
    /^\d+$/.test(part) ? Number.parseInt(part, 10) : part,
  );
}

const VERSION_TAG_ORDER = new Map([
  ["dev", -4],
  ["a", -3],
  ["alpha", -3],
  ["b", -2],
  ["beta", -2],
  ["pre", -1],
  ["preview", -1],
  ["rc", -1],
  ["post", 1],
  ["rev", 1],
]);

function compareVersions(left: string, right: string): number {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === rightPart) {
      continue;
    }
    if (leftPart === undefined) {
      if (typeof rightPart === "number" && rightPart === 0) {
        continue;
      }
      return typeof rightPart === "string" && (VERSION_TAG_ORDER.get(rightPart) ?? 0) < 0 ? 1 : -1;
    }
    if (rightPart === undefined) {
      if (typeof leftPart === "number" && leftPart === 0) {
        continue;
      }
      return typeof leftPart === "string" && (VERSION_TAG_ORDER.get(leftPart) ?? 0) < 0 ? -1 : 1;
    }
    if (typeof leftPart === "number" && typeof rightPart === "number") {
      return leftPart < rightPart ? -1 : 1;
    }
    if (typeof leftPart === "string" && typeof rightPart === "string") {
      const leftRank = VERSION_TAG_ORDER.get(leftPart);
      const rightRank = VERSION_TAG_ORDER.get(rightPart);
      if (leftRank !== undefined || rightRank !== undefined) {
        return (leftRank ?? 0) < (rightRank ?? 0) ? -1 : 1;
      }
      return leftPart < rightPart ? -1 : 1;
    }
    return typeof leftPart === "number" ? 1 : -1;
  }
  return 0;
}

function compatibleUpperBound(value: string): string | undefined {
  const release = value.match(/^\d+(?:\.\d+)*/)?.[0];
  if (release === undefined) {
    return undefined;
  }
  const parts = release.split(".").map((part) => Number.parseInt(part, 10));
  const index = parts.length > 2 ? parts.length - 2 : 0;
  parts[index] += 1;
  return parts.slice(0, index + 1).join(".");
}

function versionClauseMatches(clause: string, locked: string): boolean {
  const match = /^(<=|>=|==|!=|~=|<|>|=)?(.+)$/.exec(clause.trim());
  if (match === null) {
    return false;
  }
  const operator = match[1] ?? "==";
  const expected = match[2];
  if (expected === "*") {
    return true;
  }
  if (expected.includes("*")) {
    const matches = condaGlobMatches(expected, locked);
    return operator === "!=" ? !matches : matches;
  }
  if (operator === "=") {
    return condaGlobMatches(`${expected}*`, locked);
  }
  const comparison = compareVersions(locked, expected);
  switch (operator) {
    case "==":
      return comparison === 0;
    case "!=":
      return comparison !== 0;
    case "<":
      return comparison < 0;
    case "<=":
      return comparison <= 0;
    case ">":
      return comparison > 0;
    case ">=":
      return comparison >= 0;
    case "~=": {
      const upper = compatibleUpperBound(expected);
      return comparison >= 0 && upper !== undefined && compareVersions(locked, upper) < 0;
    }
  }
  return false;
}

/** Version syntax this module tokenizes away, and so cannot order correctly. */
const UNORDERABLE_VERSION_SYNTAX = /[!+]/;
/** The clause shapes {@link versionClauseMatches} implements. */
const SUPPORTED_CLAUSE = /^(<=|>=|==|!=|~=|<|>|=)?[^\s]+$/;

/**
 * Whether a mismatch between this specification and this locked version would be a finding rather
 * than a guess.
 *
 * Callers that use a mismatch to accuse a lock of being stale MUST consult this first. An epoch or
 * a local version identifier is ordered by rules {@link compareVersions} does not implement, and a
 * clause shape that is merely unrecognized would otherwise fall through to `false` and read as a
 * confident disagreement. Silence about a real mismatch is recoverable; a project told to re-lock
 * a lock that is already correct has no way forward.
 */
export function condaVersionDecidable(specification: string, locked: string): boolean {
  if (UNORDERABLE_VERSION_SYNTAX.test(specification) || UNORDERABLE_VERSION_SYNTAX.test(locked)) {
    return false;
  }
  return specification
    .split("|")
    .flatMap((alternative) => alternative.split(","))
    .map((clause) => clause.trim())
    .filter(Boolean)
    .every((clause) => SUPPORTED_CLAUSE.test(clause));
}

/**
 * Match Conda's `|` alternatives, comma intersections, comparisons, compatibility, and globs.
 *
 * Only meaningful when {@link condaVersionDecidable} accepts the same pair.
 */
export function condaVersionMatches(specification: string, locked: string): boolean {
  return specification.split("|").some((alternative) =>
    alternative
      .split(",")
      .map((clause) => clause.trim())
      .filter(Boolean)
      .every((clause) => versionClauseMatches(clause, locked)),
  );
}
