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
const SNAPSHOT_PATH = fileURLToPath(new URL("../data/snapshot.json", import.meta.url));
const INSTALL_ISH = /\b(make install|\.\/configure|pip install|R CMD INSTALL|cmake|curl|wget)\b/;
const CONDA_TABLE_KEYS = ["dependencies", "host-dependencies", "build-dependencies"];

export type Manifest = Record<string, unknown>;

/**
 * Whether there is a solve biopixi can stand behind. Separate from readiness: a level is only
 * meaningful when the evidence is `DEFINITIVE`.
 */
export type EvidenceState = "DEFINITIVE" | "UNRESOLVED" | "STALE" | "UNSUPPORTED_LOCK";

/** The dependency and resolved artifact holding a platform below L4. */
export interface Cap {
  package: string;
  version?: string;
  channel: string | null;
  artifact: string;
}

/**
 * A container claim and the basis for it. `verified` stays false while grading is offline: naming
 * an image is not the same as reaching a registry and finding it there.
 */
export interface Publication {
  uri: string;
  verified: boolean;
  basis: string;
}

/** Provenance of the vendored public metadata a claim rests on. */
export interface MetadataSnapshot {
  file: string;
  source: string;
  path: string;
  ref: string;
  revision: string | null;
  revisionDate: string;
  fetched: string;
  sha1: string;
}

export interface Grade {
  conformant: boolean;
  evidenceState: EvidenceState | null;
  level: number | null;
  label: string;
  reasons: string[];
  lints: string[];
  nextActions: string[];
  target?: string;
  cap?: Cap;
  publication?: Publication;
  snapshot?: MetadataSnapshot;
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

function hasOwn(value: Manifest, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * Read the workspace table under either spelling so a legacy manifest is rejected for its
 * spelling alone rather than for everything the profile cannot see inside it.
 */
function workspaceTable(manifest: Manifest): Manifest {
  return record(manifest.workspace ?? manifest.project);
}

function declaredPlatforms(manifest: Manifest): string[] {
  const platforms = workspaceTable(manifest).platforms;
  return Array.isArray(platforms)
    ? platforms.filter((platform): platform is string => typeof platform === "string")
    : [];
}

type Conformance = Omit<Grade, "conformant" | "evidenceState" | "level" | "label">;

/** Outside the profile: no solve was considered, so there is no evidence state to report. */
function outOfProfile(options: Conformance): Grade {
  return { conformant: false, evidenceState: null, level: null, label: "L0", ...options };
}

/** In profile, but the solve cannot carry a number. */
function indefinite(state: Exclude<EvidenceState, "DEFINITIVE">, options: Conformance): Grade {
  return { conformant: true, evidenceState: state, level: null, label: state, ...options };
}

function definitive(level: number, options: Conformance): Grade {
  return {
    conformant: true,
    evidenceState: "DEFINITIVE",
    level,
    label: `L${level}`,
    ...options,
  };
}

function capOf(pkg: LockedPackage): Cap {
  const cap: Cap = { package: pkg.name, channel: pkg.channel, artifact: pkg.source ?? "?" };
  if (pkg.version !== undefined) {
    cap.version = pkg.version;
  }
  return cap;
}

function loadSnapshot(): MetadataSnapshot | undefined {
  try {
    const data = record(JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")));
    const entry = record(data["biocontainers-hash"]);
    return Object.keys(entry).length > 0 ? (entry as unknown as MetadataSnapshot) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parse a Pixi TOML manifest from disk.
 */
export function parseManifest(path: string): Manifest {
  return record(parseToml(readFileSync(path, "utf8")));
}

function dependencyTables(
  manifest: Manifest,
  platforms: readonly string[],
): Array<[string, Manifest]> {
  const tables: Array<[string, Manifest]> = [];
  for (const key of CONDA_TABLE_KEYS) {
    if (manifest[key] !== undefined) {
      tables.push([key, record(manifest[key])]);
    }
  }

  const targets = record(manifest.target);
  for (const platform of platforms) {
    const target = record(targets[platform]);
    for (const key of CONDA_TABLE_KEYS) {
      if (target[key] !== undefined) {
        tables.push([`target.${platform}.${key}`, record(target[key])]);
      }
    }
  }

  return tables;
}

function pypiDependencyTables(
  manifest: Manifest,
  platforms: readonly string[],
): Array<[string, Manifest]> {
  const tables: Array<[string, Manifest]> = [];
  if (manifest["pypi-dependencies"] !== undefined) {
    tables.push(["pypi-dependencies", record(manifest["pypi-dependencies"])]);
  }

  const targets = record(manifest.target);
  for (const platform of platforms) {
    const target = record(targets[platform]);
    if (target["pypi-dependencies"] !== undefined) {
      tables.push([`target.${platform}.pypi-dependencies`, record(target["pypi-dependencies"])]);
    }
  }
  return tables;
}

function effectiveCondaDependencies(manifest: Manifest, platform: string): Manifest {
  return {
    ...record(manifest.dependencies),
    ...record(record(record(manifest.target)[platform]).dependencies),
  };
}

/**
 * Check whether a parsed Pixi manifest is inside the deliberately small profile-v0 boundary.
 */
export function checkProfile(manifest: Manifest): {
  reasons: string[];
  lints: string[];
} {
  const reasons: string[] = [];
  const lints: string[] = [];
  const workspace = workspaceTable(manifest);

  if (manifest.workspace === undefined) {
    reasons.push(
      manifest.project === undefined
        ? "no [workspace] table — profile v0 requires a project-root Pixi workspace"
        : "legacy [project] table — profile v0 requires the [workspace] spelling",
    );
  }
  if (!Array.isArray(workspace.channels) || workspace.channels.length === 0) {
    reasons.push("no channels declared — nothing to resolve against");
  }

  let platforms: string[] = [];
  if (!Array.isArray(workspace.platforms) || workspace.platforms.length === 0) {
    reasons.push("no platforms declared — the target of the build is unstated");
  } else {
    platforms = declaredPlatforms(manifest);
    const linuxCount = platforms.filter((platform) => platform === "linux-64").length;
    const macosCount = platforms.filter((platform) => platform === "osx-arm64").length;
    const unsupported = platforms.filter(
      (platform) => platform !== "linux-64" && platform !== "osx-arm64",
    );
    if (
      platforms.length !== workspace.platforms.length ||
      linuxCount !== 1 ||
      macosCount > 1 ||
      unsupported.length > 0
    ) {
      reasons.push(
        `unsupported platform set (${workspace.platforms.map(String).join(", ")}) — profile v0 requires linux-64 and permits only optional osx-arm64`,
      );
    }
  }

  const effectivePlatforms = platforms.length > 0 ? [...new Set(platforms)] : [""];
  for (const platform of effectivePlatforms) {
    const dependencies =
      platform === ""
        ? record(manifest.dependencies)
        : effectiveCondaDependencies(manifest, platform);
    if (Object.keys(dependencies).length === 0) {
      const suffix = platform === "" ? "" : ` for ${platform}`;
      reasons.push(`default environment has no Conda dependencies${suffix} — nothing to package`);
    }
  }

  const featureNames = Object.keys(record(manifest.feature)).sort();
  if (featureNames.length > 0) {
    reasons.push(
      `named feature tables (${featureNames.join(", ")}) — profile v0 supports only the default feature`,
    );
  }

  if (manifest.environments !== undefined) {
    const environments = record(manifest.environments);
    if (Object.keys(environments).length === 0) {
      reasons.push("[environments] must define only default = [] when present");
    }
    const namedEnvironments = Object.keys(environments)
      .filter((name) => name !== "default")
      .sort();
    if (namedEnvironments.length > 0) {
      reasons.push(
        `named environments (${namedEnvironments.join(", ")}) — profile v0 supports only default`,
      );
    }

    if (hasOwn(environments, "default")) {
      const definition = environments.default;
      if (!Array.isArray(definition) || definition.length !== 0) {
        reasons.push("environments.default must be [] — no other composition is in profile v0");
      }
    }

    for (const [name, definitionValue] of Object.entries(environments)) {
      const definition = record(definitionValue);
      if (hasOwn(definition, "no-default-feature")) {
        reasons.push(
          `environment '${name}' sets no-default-feature — profile v0 always includes the default feature`,
        );
      }
      if (hasOwn(definition, "solve-group")) {
        reasons.push(
          `environment '${name}' sets solve-group — solve groups are outside profile v0`,
        );
      }
    }
  }

  for (const [label, table] of pypiDependencyTables(manifest, effectivePlatforms)) {
    if (Object.keys(table).length > 0) {
      reasons.push(
        `[${label}] present (${Object.keys(table).sort().join(", ")}) — outside the conda universe`,
      );
    }
  }

  for (const [label, table] of dependencyTables(manifest, effectivePlatforms)) {
    for (const [name, value] of Object.entries(table)) {
      const specification = record(value);
      for (const sourceKind of ["git", "url"]) {
        if (specification[sourceKind] !== undefined) {
          reasons.push(
            `${name} in [${label}] declared by ${sourceKind}= — no recipe can name this source`,
          );
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

function profileNextActions(reasons: string[]): string[] {
  if (reasons.some((reason) => reason.includes("pypi-dependencies"))) {
    return [
      "give each PyPI-only dependency a conda identity: write a recipe and depend on it by path",
    ];
  }
  return ["bring the manifest inside profile v0 — see PROFILE.md"];
}

/**
 * Grade one project directory using only its manifest, lock, and vendored metadata.
 */
export function grade(directory: string, options: GradeOptions = {}): Grade {
  const manifestPath = join(directory, "pixi.toml");
  if (!existsSync(manifestPath)) {
    return outOfProfile({
      reasons: ["no pixi.toml"],
      lints: [],
      nextActions: ["run `pixi init` to create a workspace manifest"],
    });
  }

  const manifest = parseManifest(manifestPath);
  const profile = checkProfile(manifest);
  if (profile.reasons.length > 0) {
    return outOfProfile({ ...profile, nextActions: profileNextActions(profile.reasons) });
  }

  const lockPath = join(directory, "pixi.lock");
  if (!existsSync(lockPath)) {
    return indefinite("UNRESOLVED", {
      reasons: ["no pixi.lock — publication is a claim about a solve, and there is no solve"],
      lints: profile.lints,
      nextActions: ["run `pixi lock` and commit pixi.lock"],
    });
  }

  const locked = loadLock(lockPath);
  if (locked.problems.length > 0) {
    return indefinite("UNSUPPORTED_LOCK", {
      reasons: locked.problems,
      lints: profile.lints,
      nextActions: ["give every dependency a conda identity, then re-lock"],
    });
  }
  const byName = new Map(locked.packages.map((pkg) => [pkg.name, pkg]));

  // L4 is a linux-64 claim, and the locked closure is still flattened, so one platform supplies
  // the root target set. Its target table participates: a target-only dependency is a root.
  const platforms = declaredPlatforms(manifest);
  const gradingPlatform = platforms.includes("linux-64") ? "linux-64" : platforms[0];
  const direct = Object.keys(
    gradingPlatform === undefined
      ? record(manifest.dependencies)
      : effectiveCondaDependencies(manifest, gradingPlatform),
  ).sort();

  // Evidence before readiness: an incomplete solve cannot be argued down to a level, so staleness
  // is settled before any package is allowed to cap one.
  const missing = direct.filter((name) => !byName.has(name));
  if (missing.length > 0) {
    return indefinite("STALE", {
      reasons: [`lock is stale — ${missing.join(", ")} not resolved`],
      lints: profile.lints,
      nextActions: [`run \`pixi lock\` — the lock does not cover ${missing.join(", ")}`],
    });
  }

  const heldBack: Array<{ reason: string; pkg: LockedPackage }> = [];
  for (const pkg of locked.packages) {
    if (pkg.channel === null) {
      heldBack.push({ reason: `${pkg.name} built from source at ${pkg.source}`, pkg });
    } else if (
      pkg.channel.startsWith("local:") ||
      !PUBLIC_CHANNEL_HOSTS.has(host(pkg.source ?? ""))
    ) {
      heldBack.push({
        reason: `${pkg.name} resolved from a non-public channel (${pkg.source})`,
        pkg,
      });
    }
  }
  if (heldBack.length > 0) {
    const capping = heldBack[0].pkg;
    return definitive(1, {
      reasons: heldBack.map(({ reason }) => reason),
      lints: profile.lints,
      cap: capOf(capping),
      nextActions: [
        capping.channel === null
          ? `publish ${capping.name} to conda-forge or bioconda — it is built from source at ${capping.source}`
          : `republish ${capping.name} from a public channel — it resolves from ${capping.source}`,
      ],
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

  const outsideCommunityPackages = locked.packages.filter(
    (pkg) => pkg.channel !== null && !COMMUNITY_CHANNELS.has(pkg.channel),
  );
  if (outsideCommunityPackages.length > 0) {
    const outsideCommunity = [
      ...new Set(outsideCommunityPackages.map((pkg) => pkg.channel as string)),
    ].sort();
    const capping = outsideCommunityPackages[0];
    return definitive(2, {
      target,
      lints: profile.lints,
      cap: capOf(capping),
      reasons: [
        `every package is public, but ${capping.name} resolves from ${capping.channel} — the closure uses non-community channels: ${outsideCommunity.join(", ")}`,
        "L3 requires every package to resolve from conda-forge or bioconda",
      ],
      nextActions: [`get ${capping.name} into conda-forge or bioconda`],
    });
  }

  if (direct.length === 1) {
    const pkg = byName.get(direct[0]);
    if (pkg !== undefined && pkg.channel !== null && AUTO_CONTAINER_CHANNELS.has(pkg.channel)) {
      const uri = pullUri(mulled);
      return definitive(4, {
        target,
        lints: profile.lints,
        reasons: [
          `single ${pkg.channel} package — BioContainers builds one image per recipe build`,
        ],
        publication: {
          uri,
          verified: false,
          basis: `inferred: a single ${pkg.channel} package, and BioContainers builds one image per recipe build`,
        },
        nextActions: [
          "confirm the container above is pullable — offline grading cannot reach a registry",
        ],
      });
    }
    return definitive(3, {
      target,
      lints: profile.lints,
      reasons: [
        `${pkg?.name} is ecosystem-ready on ${pkg?.channel}, which does not auto-build containers`,
      ],
      publication: {
        uri: pullUri(mulled),
        verified: false,
        basis: `unregistered: ${pkg?.channel} does not auto-build containers, so this is only the name an image would have`,
      },
      nextActions: [
        `publish a container for ${target} — ${pkg?.channel} packages are not built automatically`,
      ],
    });
  }

  const versionsOnly = mulled.map(({ package: packageName, version }) => ({
    package: packageName,
    version,
  }));
  const combinations = loadCombinations(options.combinationsPath ?? DEFAULT_COMBINATIONS_PATH);
  // A caller-supplied table is not the copy the vendored snapshot describes, so claim no provenance.
  const snapshot = options.combinationsPath === undefined ? loadSnapshot() : undefined;
  const registration = combinations.get(combinationKey(targets));
  if (registration !== undefined) {
    const [raw, imageBuild] = registration;
    return definitive(4, {
      target,
      lints: profile.lints,
      snapshot,
      reasons: [`registered in BioContainers combinations/hash.tsv as: ${raw}`],
      publication: {
        uri: pullUri(versionsOnly, imageBuild),
        verified: false,
        basis: `listed in the combinations/hash.tsv snapshot fetched ${snapshot?.fetched ?? "at an unrecorded time"}`,
      },
      nextActions: [
        "confirm the container above is pullable — offline grading cannot reach a registry",
      ],
    });
  }

  return definitive(3, {
    target,
    lints: profile.lints,
    snapshot,
    reasons: [
      "every package is ecosystem-ready, but this combination has no hash.tsv line",
      "L4 is one pull request away — add the target string above to combinations/hash.tsv",
    ],
    publication: {
      uri: pullUri(versionsOnly, "0"),
      verified: false,
      basis: "unregistered: this is only the name an image would have once built",
    },
    nextActions: [`add \`${target}\` to BioContainers combinations/hash.tsv`],
  });
}
