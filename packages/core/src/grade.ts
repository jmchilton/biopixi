import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";

import { pullUri, type Target } from "./mulled.js";

const PUBLIC_CHANNEL_HOSTS = new Set(["conda.anaconda.org", "repo.anaconda.com", "prefix.dev"]);
const COMMUNITY_CHANNELS = new Set(["conda-forge", "bioconda"]);
const AUTO_CONTAINER_CHANNELS = new Set(["bioconda"]);
const DEFAULT_COMBINATIONS_PATH = fileURLToPath(
  new URL("../data/biocontainers-hash.tsv", import.meta.url),
);
const INSTALL_ISH = /\b(make install|\.\/configure|pip install|R CMD INSTALL|cmake|curl|wget)\b/;

export type Manifest = Record<string, unknown>;

export interface Grade {
  level: number | null;
  label: string;
  reasons: string[];
  lints: string[];
  target?: string;
  evidence?: string;
}

export interface LockedPackage {
  name: string;
  version?: string;
  channel: string | null;
  source?: string;
  build?: string;
}

export interface GradeOptions {
  combinationsPath?: string;
}

function record(value: unknown): Manifest {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Manifest)
    : {};
}

function makeGrade(level: number | null, options: Omit<Grade, "level" | "label">): Grade {
  return {
    level,
    label: level === null ? "L0" : `L${level}`,
    ...options,
  };
}

/**
 * Parse a Pixi TOML manifest from disk.
 */
export function parseManifest(path: string): Manifest {
  return record(parseToml(readFileSync(path, "utf8")));
}

function dependencyTables(manifest: Manifest): Array<[string, Manifest]> {
  const tables: Array<[string, Manifest]> = [];
  for (const key of [
    "dependencies",
    "pypi-dependencies",
    "host-dependencies",
    "build-dependencies",
  ]) {
    if (manifest[key] !== undefined) {
      tables.push([key, record(manifest[key])]);
    }
  }

  for (const [featureName, featureValue] of Object.entries(record(manifest.feature))) {
    const feature = record(featureValue);
    for (const key of ["dependencies", "pypi-dependencies"]) {
      if (feature[key] !== undefined) {
        tables.push([`feature.${featureName}.${key}`, record(feature[key])]);
      }
    }
  }
  return tables;
}

/**
 * Run the prototype's mechanical profile checks without solving or executing tasks.
 */
export function checkProfile(manifest: Manifest): {
  reasons: string[];
  lints: string[];
} {
  const reasons: string[] = [];
  const lints: string[] = [];
  const workspace = record(manifest.workspace ?? manifest.project);

  if (!Array.isArray(workspace.channels) || workspace.channels.length === 0) {
    reasons.push("no channels declared — nothing to resolve against");
  }
  if (!Array.isArray(workspace.platforms) || workspace.platforms.length === 0) {
    reasons.push("no platforms declared — the target of the build is unstated");
  }
  if (Object.keys(record(manifest.dependencies)).length === 0) {
    reasons.push("no [dependencies] — nothing to package");
  }

  for (const [label, table] of dependencyTables(manifest)) {
    if (label.includes("pypi-dependencies")) {
      reasons.push(
        `[${label}] present (${Object.keys(table).sort().join(", ")}) — outside the conda universe`,
      );
      continue;
    }

    for (const [name, value] of Object.entries(table)) {
      const specification = record(value);
      for (const sourceKind of ["git", "url"]) {
        if (specification[sourceKind] !== undefined) {
          reasons.push(`${name} declared by ${sourceKind}= — no recipe can name this source`);
        }
      }
    }
  }

  for (const [taskName, taskValue] of Object.entries(record(manifest.tasks))) {
    const task = record(taskValue);
    const command = typeof taskValue === "string" ? taskValue : String(task.cmd ?? "");
    if (INSTALL_ISH.test(command)) {
      lints.push(`task '${taskName}' looks like an install instruction — that belongs in a recipe`);
    }
  }

  return { reasons, lints };
}

function lockedPackageFromUrl(url: string): LockedPackage {
  const parts = url.split("/");
  const filename = parts.at(-1) ?? url;
  let channel = parts.length >= 3 ? (parts.at(-3) ?? "?") : "?";
  if (!url.startsWith("http")) {
    channel = `local:${channel}`;
  }

  const stem = filename.replace(/\.(conda|tar\.bz2)$/, "");
  const pieces = stem.split("-");
  if (pieces.length < 3) {
    return { name: stem, channel, source: url };
  }

  const build = pieces.pop();
  const version = pieces.pop();
  return {
    name: pieces.join("-"),
    version,
    build,
    channel,
    source: url,
  };
}

/**
 * Load and flatten the prototype's default-environment lock closure.
 */
export function loadLock(path: string): {
  packages: LockedPackage[];
  problems: string[];
} {
  const data = record(parseYaml(readFileSync(path, "utf8")));
  const environments = record(data.environments);
  const defaultEnvironment = record(environments.default);
  const environment =
    Object.keys(defaultEnvironment).length > 0
      ? defaultEnvironment
      : record(Object.values(environments)[0]);
  const packages: LockedPackage[] = [];
  const problems: string[] = [];

  for (const entriesValue of Object.values(record(environment.packages))) {
    const entries = Array.isArray(entriesValue) ? entriesValue : [];
    for (const entryValue of entries) {
      const entry = record(entryValue);
      if (typeof entry.conda === "string") {
        packages.push(lockedPackageFromUrl(entry.conda));
      } else if (typeof entry.conda_source === "string") {
        const raw = entry.conda_source;
        const name = raw.split("[", 1)[0].split(" ", 1)[0].trim();
        const source = raw.includes("@") ? raw.split("@", 2)[1].trim() : "?";
        packages.push({ name, channel: null, source });
      } else if (typeof entry.pypi === "string") {
        problems.push(`lock contains a PyPI wheel: ${entry.pypi.split("/").at(-1)}`);
      }
    }
  }

  return { packages, problems };
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function combinationKey(targets: Iterable<string>): string {
  return [...new Set(targets)].sort().join("\n");
}

/**
 * Load BioContainers combination registrations keyed by their target set.
 */
export function loadCombinations(path: string): Map<string, [string, string]> {
  const table = new Map<string, [string, string]>();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (line.trim() === "" || line.startsWith("#")) {
      continue;
    }
    const columns = line.split("\t");
    const targets = columns[0];
    const imageBuild = columns[2]?.trim() || "0";
    const key = combinationKey(
      targets.split(",").map((target) => target.split("::").at(-1)?.trim() ?? target.trim()),
    );
    table.set(key, [targets, imageBuild]);
  }
  return table;
}

/**
 * Grade one project directory using only its manifest, lock, and vendored metadata.
 */
export function grade(directory: string, options: GradeOptions = {}): Grade {
  const manifestPath = join(directory, "pixi.toml");
  if (!existsSync(manifestPath)) {
    return makeGrade(null, { reasons: ["no pixi.toml"], lints: [] });
  }

  const manifest = parseManifest(manifestPath);
  const profile = checkProfile(manifest);
  if (profile.reasons.length > 0) {
    return makeGrade(null, profile);
  }

  const lockPath = join(directory, "pixi.lock");
  if (!existsSync(lockPath)) {
    return makeGrade(1, {
      reasons: ["no pixi.lock — publication is a claim about a solve, and there is no solve"],
      lints: profile.lints,
    });
  }

  const locked = loadLock(lockPath);
  if (locked.problems.length > 0) {
    return makeGrade(null, {
      reasons: locked.problems,
      lints: profile.lints,
    });
  }
  const byName = new Map(locked.packages.map((pkg) => [pkg.name, pkg]));
  const heldBack: string[] = [];
  for (const pkg of locked.packages) {
    if (pkg.channel === null) {
      heldBack.push(`${pkg.name} built from source at ${pkg.source}`);
    } else if (
      pkg.channel.startsWith("local:") ||
      !PUBLIC_CHANNEL_HOSTS.has(host(pkg.source ?? ""))
    ) {
      heldBack.push(`${pkg.name} resolved from a non-public channel (${pkg.source})`);
    }
  }
  if (heldBack.length > 0) {
    return makeGrade(1, { reasons: heldBack, lints: profile.lints });
  }

  const direct = Object.keys(record(manifest.dependencies)).sort();
  const missing = direct.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    return makeGrade(1, {
      reasons: [`lock is stale — ${missing.join(", ")} not resolved`],
      lints: profile.lints,
    });
  }

  const targets = direct.map((name) => `${name}=${byName.get(name)?.version}`);
  const target = targets.join(",");
  const mulled: Target[] = direct.map((name) => {
    const pkg = byName.get(name);
    return {
      package: name,
      version: pkg?.version,
      build: pkg?.build,
    };
  });

  const outsideCommunity = [
    ...new Set(
      locked.packages
        .map((pkg) => pkg.channel)
        .filter(
          (channel): channel is string => channel !== null && !COMMUNITY_CHANNELS.has(channel),
        ),
    ),
  ].sort();
  if (outsideCommunity.length > 0) {
    return makeGrade(2, {
      target,
      lints: profile.lints,
      reasons: [
        `every package is public, but the resolved closure uses non-community channels: ${outsideCommunity.join(", ")}`,
        "L3 requires every package to resolve from conda-forge or bioconda",
      ],
    });
  }

  if (direct.length === 1) {
    const pkg = byName.get(direct[0]);
    if (pkg !== undefined && pkg.channel !== null && AUTO_CONTAINER_CHANNELS.has(pkg.channel)) {
      return makeGrade(4, {
        target,
        lints: profile.lints,
        reasons: [
          `single ${pkg.channel} package — BioContainers builds one image per recipe build`,
        ],
        evidence: pullUri(mulled),
      });
    }
    return makeGrade(3, {
      target,
      lints: profile.lints,
      reasons: [
        `${pkg?.name} is ecosystem-ready on ${pkg?.channel}, which does not auto-build containers`,
      ],
      evidence: `would be ${pullUri(mulled)} if registered`,
    });
  }

  const versionsOnly = mulled.map(({ package: packageName, version }) => ({
    package: packageName,
    version,
  }));
  const combinations = loadCombinations(options.combinationsPath ?? DEFAULT_COMBINATIONS_PATH);
  const registration = combinations.get(combinationKey(targets));
  if (registration !== undefined) {
    const [raw, imageBuild] = registration;
    return makeGrade(4, {
      target,
      lints: profile.lints,
      reasons: [`registered in BioContainers combinations/hash.tsv as: ${raw}`],
      evidence: pullUri(versionsOnly, imageBuild),
    });
  }

  return makeGrade(3, {
    target,
    lints: profile.lints,
    reasons: [
      "every package is ecosystem-ready, but this combination has no hash.tsv line",
      "L4 is one pull request away — add the target string above to combinations/hash.tsv",
    ],
    evidence: `would be ${pullUri(versionsOnly, "0")} once built`,
  });
}
