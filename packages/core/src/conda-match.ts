/** Offline matching helpers for the subset of Conda MatchSpec used by Pixi dependencies. */

/** Normalize a channel URL for identity comparison, excluding credentials and URL parameters. */
export function canonicalChannelUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
}

/** Derive a channel URL by removing an artifact's platform and filename path segments. */
export function artifactChannelUrl(value: string): string | undefined {
  const canonical = canonicalChannelUrl(value);
  if (canonical === undefined) {
    return undefined;
  }
  const url = new URL(canonical);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    return undefined;
  }
  url.pathname = `/${parts.slice(0, -2).join("/")}`;
  return url.toString().replace(/\/$/, "");
}

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

/** Match Conda's `|` alternatives, comma intersections, comparisons, compatibility, and globs. */
export function condaVersionMatches(specification: string, locked: string): boolean {
  return specification.split("|").some((alternative) =>
    alternative
      .split(",")
      .map((clause) => clause.trim())
      .filter(Boolean)
      .every((clause) => versionClauseMatches(clause, locked)),
  );
}
