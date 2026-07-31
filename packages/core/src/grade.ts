import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml } from "yaml";

import { artifactChannelUrl, channelHasSensitiveData } from "./channel-url.js";
import {
  channelIdentity,
  channelMatches,
  condaGlobMatches,
  condaVersionDecidable,
  condaVersionMatches,
} from "./conda-match.js";
import {
  asRecord,
  declaredPlatforms,
  dependencyBuild,
  dependencyChannel,
  dependencyTables,
  dependencyVersion,
  effectiveCondaDependencies,
  hasOwn,
  isContainedIn,
  manifestChannels,
  parseManifest,
  workspaceTable,
  CONDA_DEPENDENCY_TABLES,
  type Manifest,
} from "./manifest.js";
import { pullUri, type Target } from "./mulled.js";
import { checkPathDependencies, type PathDependency } from "./path-dependency.js";

/**
 * The platform every level is a statement about.
 *
 * The ladder ends in a linux-64 BioContainer, so that is the solve the levels describe. The profile
 * requires exactly one `linux-64`, so this platform is always present by the time a solve is read.
 * A declared `osx-arm64` is checked for conformance and then left ungraded — see PROFILE.md.
 */
const GRADING_PLATFORM = "linux-64";
const PUBLIC_CHANNEL_HOSTS = new Set(["conda.anaconda.org", "repo.anaconda.com", "prefix.dev"]);
const COMMUNITY_CHANNELS = new Set(["conda-forge", "bioconda"]);
const AUTO_CONTAINER_CHANNELS = new Set(["bioconda"]);
const DEFAULT_COMBINATIONS_PATH = fileURLToPath(
  new URL("../data/biocontainers-hash.tsv", import.meta.url),
);
const SNAPSHOT_PATH = fileURLToPath(new URL("../data/snapshot.json", import.meta.url));
const INSTALL_COMMAND_PATTERN =
  /\b(make install|\.\/configure|pip install|R CMD INSTALL|cmake|curl|wget)\b/;
/** The one PyPI table, walked by the same machinery so target spellings stay consistent. */
const PYPI_TABLE_KEYS = ["pypi-dependencies"];
/** The only route from an L4-eligible candidate to L4, since no file in a project records it. */
const CONFIRM_ACTION = "run `biopixi verify` to observe the container and reach L4";
/** Pixi refuses to solve a conda source dependency without this preview feature enabled. */
const PIXI_BUILD_PREVIEW = "pixi-build";

/**
 * Why a project with credential-bearing channels cannot pass the hosted-build boundary.
 *
 * Named because callers act on it. `Grade.reasons` is prose meant for a person, so a downstream
 * command that needs to know *which* cap it hit — to say something more useful than the generic
 * refusal — would otherwise have to pattern-match a sentence, and would silently start saying the
 * wrong thing the first time that sentence was reworded. Comparing against this constant fails
 * loudly instead.
 */
export const CREDENTIAL_CHANNEL_REASON =
  "manifest channels contain embedded credentials or URL parameters that hosted builds must not expose";

/**
 * Whether there is a solve biopixi can stand behind. Separate from readiness: a level is only
 * meaningful when the evidence is `DEFINITIVE`.
 */
export type EvidenceState = "DEFINITIVE" | "UNRESOLVED" | "STALE" | "UNSUPPORTED_LOCK";

/** The dependency and resolved artifact holding a platform below L4. */
export interface Cap {
  /** The dependency name, as the manifest and the lock both spell it. */
  package: string;
  /** The locked version, absent only when the lock records none. */
  version?: string;
  /** The channel it resolved from, or null when it was built from source. */
  channel: string | null;
  /** The resolved artifact URL, or the path it is built from. */
  artifact: string;
}

/**
 * How much is known about a container image, from the name alone up to having seen it.
 *
 * Only `CONFIRMED` is L4, and only an observation produces it. The two middle states are the
 * grounds on which an observation is worth attempting; neither is evidence the image exists.
 */
export type PublicationState = "UNREGISTERED" | "INFERRED" | "REGISTERED" | "CONFIRMED";

/**
 * A container claim and the basis for it. Naming an image is not the same as reaching a registry
 * and finding it there, so the two are different states rather than one URI with a caveat.
 */
export interface Publication {
  /** The container image this environment corresponds to. */
  uri: string;
  /** How much is known about the image. Only `CONFIRMED` supports L4. */
  state: PublicationState;
  /** How the URI was arrived at, so an unconfirmed claim can be judged rather than trusted. */
  basis: string;
  /** The manifest digest observed at the registry. Present only when `CONFIRMED`. */
  digest?: string;
  /** When the registry was reached, ISO 8601. Present only when a registry was reached. */
  observedAt?: string;
}

/** Provenance of the vendored public metadata a claim rests on. */
export interface MetadataSnapshot {
  /** The vendored copy's filename inside this package. */
  file: string;
  /** The upstream repository it was taken from. */
  source: string;
  /** The path within that repository. */
  path: string;
  /** The branch or tag followed. */
  ref: string;
  /** The exact upstream commit vendored, or null if it was not recorded. */
  revision: string | null;
  /** The date of that commit, ISO 8601. */
  revisionDate: string;
  /** The date the copy was taken, ISO 8601. */
  fetched: string;
  /** SHA-1 of the vendored copy, so the claim stays checkable offline. */
  sha1: string;
}

export interface Grade {
  /** The graded directory, absolute and symlink-resolved. */
  projectRoot: string;
  /**
   * The absolute, symlink-resolved directory bounding local path dependencies. Defaults to the
   * project root; a caller grading a collection may widen it to any ancestor. Recorded on every
   * result because it is a property of the invocation, not of the project.
   */
  sourceRoot: string;
  /** Whether the manifest is inside profile v0. Everything below is unanswerable when false. */
  conformant: boolean;
  /** Whether a solve backs the result. Null when the manifest never got as far as being solved. */
  evidenceState: EvidenceState | null;
  /** How far the environment travels, 1–4. Null unless `evidenceState` is `DEFINITIVE`. */
  level: number | null;
  /** The level, evidence state, or `L0`, as one token for display. */
  label: string;
  /** Why the result is what it is, most specific first. */
  reasons: string[];
  /** Portability concerns that did not change the result. */
  lints: string[];
  /** What to do to move the result up, in the order it would have to be done. */
  nextActions: string[];
  /** The `name=version` set a container claim would be built from. */
  target?: string;
  /** What holds the environment at this level. Absent at L4, where nothing does. */
  cap?: Cap;
  /** The container this environment can be published as, and how that was arrived at. */
  publication?: Publication;
  /** Provenance of the vendored metadata behind `publication`, when any was consulted. */
  snapshot?: MetadataSnapshot;
  /**
   * Every conformant local path dependency the manifest reaches, including those reached through
   * another path dependency. Absent when the manifest declares none, which is the common case.
   */
  pathDependencies?: PathDependency[];
}

export interface LockedPackage {
  name: string;
  version?: string;
  channel: string | null;
  source?: string;
  build?: string;
  /** Canonical channel URL derived from the artifact URL, without credentials or a subdir. */
  channelUrl?: string;
}

export interface GradeOptions {
  combinationsPath?: string;
  /** Widen the path-dependency bound to an ancestor of the project root. Defaults to that root. */
  sourceRoot?: string;
}

/**
 * A source root that cannot bound the project it was given with. This is a fault in the
 * invocation rather than a finding about the project, so it is raised instead of graded.
 */
export class SourceRootError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceRootError";
  }
}

/** Absolute and symlink-free, without demanding that the path exist. */
function realpathOrResolve(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

/**
 * The project directory a caller meant, from either a directory or the `pixi.toml` inside it.
 *
 * Shared by every entry point so that one biopixi command cannot accept an argument another
 * rejects. Tab completion offers the manifest, so someone will pass it.
 */
export function resolveProjectDirectory(input: string): string {
  const absolute = resolve(input);
  return realpathOrResolve(basename(absolute) === "pixi.toml" ? dirname(absolute) : absolute);
}

function resolveSourceRoot(projectRoot: string, requestedRoot: string | undefined): string {
  if (requestedRoot === undefined) {
    return projectRoot;
  }

  let sourceRoot: string;
  try {
    sourceRoot = realpathSync(resolve(requestedRoot));
  } catch {
    throw new SourceRootError(`source root does not exist: ${requestedRoot}`);
  }

  if (!isContainedIn(projectRoot, sourceRoot)) {
    throw new SourceRootError(
      `source root ${sourceRoot} is not an ancestor of project root ${projectRoot}`,
    );
  }
  return sourceRoot;
}

/** Everything decided by reading the project; the invocation's roots are stamped on around it. */
type ProjectGrade = Omit<Grade, "projectRoot" | "sourceRoot">;

type GradeDetails = Omit<ProjectGrade, "conformant" | "evidenceState" | "level" | "label">;

/** Outside the profile: no solve was considered, so there is no evidence state to report. */
function outOfProfileGrade(options: GradeDetails): ProjectGrade {
  return { conformant: false, evidenceState: null, level: null, label: "L0", ...options };
}

/** In profile, but the solve cannot carry a number. */
function indefiniteGrade(
  state: Exclude<EvidenceState, "DEFINITIVE">,
  options: GradeDetails,
): ProjectGrade {
  return { conformant: true, evidenceState: state, level: null, label: state, ...options };
}

function definitiveGrade(level: number, options: GradeDetails): ProjectGrade {
  return {
    conformant: true,
    evidenceState: "DEFINITIVE",
    level,
    label: `L${level}`,
    ...options,
  };
}

function packageCap(lockedPackage: LockedPackage): Cap {
  const source = lockedPackage.source ?? "?";
  const levelCap: Cap = {
    package: lockedPackage.name,
    channel: lockedPackage.channel,
    artifact: channelHasSensitiveData(source) ? "[credential-bearing channel URL]" : source,
  };
  if (lockedPackage.version !== undefined) {
    levelCap.version = lockedPackage.version;
  }
  return levelCap;
}

function loadSnapshot(): MetadataSnapshot | undefined {
  try {
    const snapshotData = asRecord(JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")));
    const snapshotEntry = asRecord(snapshotData["biocontainers-hash"]);
    return Object.keys(snapshotEntry).length > 0
      ? (snapshotEntry as unknown as MetadataSnapshot)
      : undefined;
  } catch {
    return undefined;
  }
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
        ? asRecord(manifest.dependencies)
        : effectiveCondaDependencies(manifest, platform);
    if (Object.keys(dependencies).length === 0) {
      const suffix = platform === "" ? "" : ` for ${platform}`;
      reasons.push(`default environment has no Conda dependencies${suffix} — nothing to package`);
    }
  }

  const featureNames = Object.keys(asRecord(manifest.feature)).sort();
  if (featureNames.length > 0) {
    reasons.push(
      `named feature tables (${featureNames.join(", ")}) — profile v0 supports only the default feature`,
    );
  }

  if (manifest.environments !== undefined) {
    const environments = asRecord(manifest.environments);
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
      const definition = asRecord(definitionValue);
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

  for (const [label, table] of dependencyTables(manifest, PYPI_TABLE_KEYS, effectivePlatforms)) {
    if (Object.keys(table).length > 0) {
      reasons.push(
        `[${label}] present (${Object.keys(table).sort().join(", ")}) — outside the conda universe`,
      );
    }
  }

  let declaresPathDependency = false;
  for (const [label, table] of dependencyTables(
    manifest,
    CONDA_DEPENDENCY_TABLES,
    effectivePlatforms,
  )) {
    for (const [name, value] of Object.entries(table)) {
      const specification = asRecord(value);
      declaresPathDependency ||= specification.path !== undefined;
      for (const sourceKind of ["git", "url"]) {
        if (specification[sourceKind] !== undefined) {
          reasons.push(
            `${name} in [${label}] declared by ${sourceKind}= — no recipe can name this source`,
          );
        }
      }
    }
  }

  // Without the preview feature Pixi refuses to solve a conda source dependency at all, so this
  // manifest can never produce the lock a level would be argued from.
  const previewFeatures = workspace.preview;
  if (
    declaresPathDependency &&
    !(Array.isArray(previewFeatures) && previewFeatures.includes(PIXI_BUILD_PREVIEW))
  ) {
    reasons.push(
      `path dependency without preview = ["${PIXI_BUILD_PREVIEW}"] — Pixi will not solve a conda source dependency without it`,
    );
  }

  for (const [taskName, taskValue] of Object.entries(asRecord(manifest.tasks))) {
    const task = asRecord(taskValue);
    const command = typeof taskValue === "string" ? taskValue : String(task.cmd ?? "");
    if (INSTALL_COMMAND_PATTERN.test(command)) {
      lints.push(`task '${taskName}' looks like an install instruction — that belongs in a recipe`);
    }
  }

  return { reasons, lints };
}

function parseLockedPackageUrl(url: string): LockedPackage {
  const urlSegments = url.split("/");
  const filename = urlSegments.at(-1) ?? url;
  let channel = urlSegments.length >= 3 ? (urlSegments.at(-3) ?? "?") : "?";
  if (!url.startsWith("http")) {
    channel = `local:${channel}`;
  }

  const stem = filename.replace(/\.(conda|tar\.bz2)$/, "");
  const filenameSegments = stem.split("-");
  if (filenameSegments.length < 3) {
    return { name: stem, channel, source: url };
  }

  const build = filenameSegments.pop();
  const version = filenameSegments.pop();
  const result: LockedPackage = {
    name: filenameSegments.join("-"),
    version,
    build,
    channel,
    source: url,
  };
  const channelUrl = artifactChannelUrl(url);
  if (channelUrl !== undefined) {
    result.channelUrl = channelUrl;
  }
  return result;
}

/**
 * Load one platform's default-environment lock closure.
 *
 * A lock records a separate solve under `environments.<name>.packages.<platform>`, and the same
 * package can resolve to a different build, or from a different channel, on each. Reading them
 * together would let one platform's artifacts answer a question asked about another, so the
 * platform is named by the caller rather than inferred.
 *
 * `covered` reports whether the lock has a section for that platform at all, which is a different
 * failure from a section that is merely out of date.
 */
export function loadLock(
  lockPath: string,
  platform: string,
): {
  packages: LockedPackage[];
  channels: string[];
  problems: string[];
  covered: boolean;
  version?: number;
} {
  const lockData = asRecord(parseYaml(readFileSync(lockPath, "utf8")));
  const environments = asRecord(lockData.environments);
  const defaultEnvironment = asRecord(environments.default);
  const selectedEnvironment =
    Object.keys(defaultEnvironment).length > 0
      ? defaultEnvironment
      : asRecord(Object.values(environments)[0]);
  const packages: LockedPackage[] = [];
  const problems: string[] = [];
  const channels = (
    Array.isArray(selectedEnvironment.channels) ? selectedEnvironment.channels : []
  ).flatMap((entry): string[] => {
    if (typeof entry === "string") {
      return [entry];
    }
    const url = asRecord(entry).url;
    return typeof url === "string" ? [url] : [];
  });

  const packagesByPlatform = asRecord(selectedEnvironment.packages);
  const covered = hasOwn(packagesByPlatform, platform);
  const packageEntries = Array.isArray(packagesByPlatform[platform])
    ? (packagesByPlatform[platform] as unknown[])
    : [];

  for (const entryValue of packageEntries) {
    const packageEntry = asRecord(entryValue);
    if (typeof packageEntry.conda === "string") {
      packages.push(parseLockedPackageUrl(packageEntry.conda));
    } else if (typeof packageEntry.conda_source === "string") {
      const sourceRecord = packageEntry.conda_source;
      const name = sourceRecord.split("[", 1)[0].split(" ", 1)[0].trim();
      // Split on the separator, not on the character: a path may itself contain an `@`.
      const pathSeparator = sourceRecord.indexOf(" @ ");
      const source = pathSeparator === -1 ? "?" : sourceRecord.slice(pathSeparator + 3).trim();
      packages.push({ name, channel: null, source });
    } else if (typeof packageEntry.pypi === "string") {
      problems.push(`lock contains a PyPI wheel: ${packageEntry.pypi.split("/").at(-1)}`);
    }
  }

  const version = typeof lockData.version === "number" ? lockData.version : undefined;
  return { packages, channels, problems, covered, version };
}

function publicArtifact(url: string): boolean {
  try {
    const parsed = new URL(url);
    return !channelHasSensitiveData(url) && PUBLIC_CHANNEL_HOSTS.has(parsed.host);
  } catch {
    return false;
  }
}

/**
 * One reconciled direct root: what the manifest asked for, resolved to what the lock recorded.
 *
 * This is the single description of "the packages this project is built from". Grading turns it
 * into a target string and a container identity; a build adapter turns it into an exact package
 * argument. Both must mean the same thing by "direct root", including how a target table overrides
 * a top-level entry and how an explicit channel qualifier survives, which is why neither derives
 * it independently — see {@link resolveDirectRoots}.
 */
export interface CondaRoot {
  /** The dependency name, as the manifest and the lock both spell it. */
  name: string;
  /** The locked version, absent only when the lock records none. */
  version?: string;
  /** The locked build string, absent only when the lock records none. */
  build?: string;
  /** The manifest's explicit channel qualifier, when it spells one. */
  channel?: string;
  /** The resolved artifact URL, retained as evidence. */
  source?: string;
}

/**
 * The direct roots of one platform's solve, sorted by name.
 *
 * Sorted so that two manifests differing only in declaration order produce the same result
 * everywhere this feeds: a target string, a mulled hash, and a build request.
 */
export function resolveDirectRoots(
  dependencies: Manifest,
  lockedPackagesByName: ReadonlyMap<string, LockedPackage>,
): CondaRoot[] {
  return Object.keys(dependencies)
    .sort()
    .map((name) => {
      const lockedPackage = lockedPackagesByName.get(name);
      const root: CondaRoot = { name };
      if (lockedPackage?.version !== undefined) {
        root.version = lockedPackage.version;
      }
      if (lockedPackage?.build !== undefined) {
        root.build = lockedPackage.build;
      }
      const qualifier = dependencyChannel(dependencies[name]);
      if (qualifier !== undefined) {
        root.channel = qualifier;
      }
      if (lockedPackage?.source !== undefined) {
        root.source = lockedPackage.source;
      }
      return root;
    });
}

/**
 * Drop a `channel::` qualifier from one target specification.
 *
 * A qualifier is a statement about where a package was fetched from, and two manifests that
 * differ only in whether they spell it resolve to the same artifact. Anything comparing target
 * sets for identity has to see through it.
 */
function unqualifiedTarget(target: string): string {
  return target.split("::").at(-1)?.trim() ?? target.trim();
}

/** Prefix a package name with its channel qualifier, when the manifest spells one. */
function qualifiedName(name: string, qualifier: string | undefined): string {
  return qualifier === undefined ? name : `${qualifier}::${name}`;
}

/**
 * The identity of a target set, independent of channel qualifiers and ordering.
 *
 * Normalization happens here, on every caller at once, rather than at each site that builds a key.
 * The registry side and the project side have to agree, and the only way to guarantee that is to
 * give them no opportunity to disagree: `hash.tsv` writes a qualifier on 4 of its 951 lines, and a
 * manifest may write one on any dependency, so keying on the raw spelling means a cosmetic edit to
 * either side silently loses a match.
 */
function combinationKey(targets: Iterable<string>): string {
  return [...new Set([...targets].map(unqualifiedTarget))].sort().join("\n");
}

export function loadCombinations(combinationsPath: string): Map<string, [string, string]> {
  const combinations = new Map<string, [string, string]>();
  for (const line of readFileSync(combinationsPath, "utf8").split(/\r?\n/)) {
    if (line.trim() === "" || line.startsWith("#")) {
      continue;
    }
    const columns = line.split("\t");
    const registeredTargets = columns[0];
    const imageBuild = columns[2]?.trim() || "0";
    combinations.set(combinationKey(registeredTargets.split(",")), [registeredTargets, imageBuild]);
  }
  return combinations;
}

/**
 * Parse a `hash.tsv` target column into mulled targets.
 *
 * A registered line is the authority on the image that was actually built: BioContainers hashed
 * exactly these strings, qualifiers included, so reproducing that name means using the registry's
 * spelling and not the manifest's.
 */
function parseRegisteredTargets(registeredTargets: string): Target[] {
  return registeredTargets.split(",").map((entry) => {
    const [packageName, version] = entry.trim().split("=", 2);
    return version === undefined ? { package: packageName } : { package: packageName, version };
  });
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
 * Grade one project using only its manifest, lock, and vendored metadata.
 *
 * Accepts the project directory or the `pixi.toml` inside it.
 *
 * @throws {SourceRootError} if `options.sourceRoot` is missing or does not contain the project.
 */
export function grade(directory: string, options: GradeOptions = {}): Grade {
  const projectRoot = resolveProjectDirectory(directory);
  const sourceRoot = resolveSourceRoot(projectRoot, options.sourceRoot);
  return { projectRoot, sourceRoot, ...gradeProject(projectRoot, sourceRoot, options) };
}

function gradeProject(
  projectRoot: string,
  sourceRoot: string,
  options: GradeOptions,
): ProjectGrade {
  const manifestPath = join(projectRoot, "pixi.toml");
  if (!existsSync(manifestPath)) {
    return outOfProfileGrade({
      reasons: ["no pixi.toml"],
      lints: [],
      nextActions: ["run `pixi init` to create a workspace manifest"],
    });
  }

  const manifest = parseManifest(manifestPath);
  const profileCheck = checkProfile(manifest);
  if (profileCheck.reasons.length > 0) {
    return outOfProfileGrade({
      ...profileCheck,
      nextActions: profileNextActions(profileCheck.reasons),
    });
  }

  // Conformance is still being decided here: a path dependency the profile cannot read is an L0
  // manifest, settled before any question about a solve.
  const pathDependencyCheck = checkPathDependencies(manifest, {
    projectRoot,
    sourceRoot,
    platforms: declaredPlatforms(manifest),
  });
  const lints = [...profileCheck.lints, ...pathDependencyCheck.lints];
  if (pathDependencyCheck.reasons.length > 0) {
    return outOfProfileGrade({
      reasons: pathDependencyCheck.reasons,
      lints,
      nextActions: [
        "make each path dependency a readable single-output source package — see PROFILE.md",
      ],
    });
  }

  const projectGrade = gradeSolve(
    projectRoot,
    manifest,
    { lints, pathDependencies: pathDependencyCheck.dependencies },
    options,
  );
  return pathDependencyCheck.dependencies.length > 0
    ? { ...projectGrade, pathDependencies: pathDependencyCheck.dependencies }
    : projectGrade;
}

/**
 * A lock source record and a declared path resolved to the same absolute form.
 *
 * Compared as paths rather than as strings: `./recipes/x`, `recipes/x`, and `recipes/./x` are one
 * directory, and a URL — what the lock holds for an ordinary registry package — resolves to
 * something no relative path can equal.
 */
function resolveProjectPath(projectRoot: string, path: string): string {
  return resolve(projectRoot, path);
}

function gradeSolve(
  projectRoot: string,
  manifest: Manifest,
  conformance: { lints: string[]; pathDependencies: PathDependency[] },
  options: GradeOptions,
): ProjectGrade {
  const { lints } = conformance;
  const lockPath = join(projectRoot, "pixi.lock");
  if (!existsSync(lockPath)) {
    return indefiniteGrade("UNRESOLVED", {
      reasons: ["no pixi.lock — publication is a claim about a solve, and there is no solve"],
      lints,
      nextActions: ["run `pixi lock` and commit pixi.lock"],
    });
  }

  const lock = loadLock(lockPath, GRADING_PLATFORM);
  if (!lock.covered) {
    return indefiniteGrade("STALE", {
      reasons: [
        `lock has no ${GRADING_PLATFORM} solve, which is the platform every level describes`,
      ],
      lints,
      nextActions: [`run \`pixi lock\` — the lock does not cover ${GRADING_PLATFORM}`],
    });
  }
  if (lock.problems.length > 0) {
    return indefiniteGrade("UNSUPPORTED_LOCK", {
      reasons: lock.problems,
      lints,
      nextActions: ["give every dependency a conda identity, then re-lock"],
    });
  }
  if (lock.version !== undefined && lock.version >= 7 && lock.channels.length === 0) {
    return indefiniteGrade("STALE", {
      reasons: ["lock does not record the default environment's channel configuration"],
      lints,
      nextActions: ["run `pixi lock` — the lock is missing channel evidence"],
    });
  }

  const declaredChannels = manifestChannels(manifest);
  if (lock.channels.length > 0) {
    const manifestChannelIdentities = declaredChannels.map(channelIdentity);
    const lockChannelIdentities = lock.channels.map(channelIdentity);
    if (
      manifestChannelIdentities.length !== lockChannelIdentities.length ||
      manifestChannelIdentities.some((channel, index) => channel !== lockChannelIdentities[index])
    ) {
      return indefiniteGrade("STALE", {
        reasons: ["lock channels do not match the manifest channel list and order"],
        lints,
        nextActions: ["run `pixi lock` — the configured channels have changed"],
      });
    }
  }
  const lockedPackagesByName = new Map(
    lock.packages.map((lockedPackage) => [lockedPackage.name, lockedPackage]),
  );

  // The grading platform's target table participates: a target-only dependency is a root.
  const dependencies = effectiveCondaDependencies(manifest, GRADING_PLATFORM);
  const directDependencyNames = Object.keys(dependencies).sort();

  // Evidence before readiness: an incomplete solve cannot be argued down to a level, so staleness
  // is settled before any package is allowed to cap one.
  const missingDependencies = directDependencyNames.filter(
    (name) => !lockedPackagesByName.has(name),
  );
  if (missingDependencies.length > 0) {
    return indefiniteGrade("STALE", {
      reasons: [`lock is stale — ${missingDependencies.join(", ")} not resolved`],
      lints,
      nextActions: [
        `run \`pixi lock\` — the lock does not cover ${missingDependencies.join(", ")}`,
      ],
    });
  }
  // Every check below only ever *accuses*: a disagreement between the manifest and the lock costs
  // the project its level entirely. So each one must be able to abstain. Where biopixi's offline
  // MatchSpec support runs out — epochs, local version identifiers, clause shapes it does not
  // implement — it says nothing rather than reporting a mismatch it cannot stand behind. Pixi
  // itself re-checks all of this on the next solve; a missed staleness is caught there, whereas a
  // project wrongly told to re-lock an already-correct lock has nowhere to go.
  const rootMismatches = directDependencyNames.flatMap((name) => {
    const qualifier = dependencyChannel(dependencies[name]);
    const lockedPackage = lockedPackagesByName.get(name);
    const lockedChannel = lockedPackage?.channel;
    const problems: string[] = [];
    if (
      qualifier !== undefined &&
      (lockedPackage === undefined ||
        lockedChannel === null ||
        lockedChannel === undefined ||
        !channelMatches(qualifier, lockedPackage.channel, lockedPackage.channelUrl))
    ) {
      problems.push(`${name} requires an explicit channel that does not match its locked artifact`);
    }
    const version = dependencyVersion(dependencies[name]);
    if (
      version !== undefined &&
      lockedPackage?.version !== undefined &&
      condaVersionDecidable(version, lockedPackage.version) &&
      !condaVersionMatches(version, lockedPackage.version)
    ) {
      problems.push(
        `${name} requires version ${version}, but the lock resolves ${lockedPackage.version}`,
      );
    }
    const build = dependencyBuild(dependencies[name]);
    if (
      build !== undefined &&
      lockedPackage?.build !== undefined &&
      !condaGlobMatches(build, lockedPackage.build)
    ) {
      problems.push(
        `${name} requires build ${build}, but the lock resolves ${lockedPackage.build}`,
      );
    }
    return problems;
  });
  if (rootMismatches.length > 0) {
    return indefiniteGrade("STALE", {
      reasons: rootMismatches,
      lints,
      nextActions: ["run `pixi lock` — direct dependency requirements must agree with the lock"],
    });
  }

  // A source record naming somewhere else is evidence about a manifest that no longer exists. The
  // manifest is in profile and the recipe is readable; what is wrong is the solve, so this is
  // stale rather than L0.
  const movedPathDependencies = conformance.pathDependencies.flatMap((dependency) => {
    // Workspace scope only. A recursively reached dependency's path is relative to its parent
    // recipe, and Pixi never writes it to the lock, so a same-named locked package is a different
    // package rather than a disagreement.
    if (dependency.scope !== "workspace") {
      return [];
    }
    const source = lockedPackagesByName.get(dependency.name)?.source;
    return source === undefined ||
      resolveProjectPath(projectRoot, source) ===
        resolveProjectPath(projectRoot, dependency.declared)
      ? []
      : [
          `${dependency.name} is locked from ${source}, but the manifest declares ${dependency.declared}`,
        ];
  });
  if (movedPathDependencies.length > 0) {
    return indefiniteGrade("STALE", {
      reasons: movedPathDependencies,
      lints,
      nextActions: ["run `pixi lock` — the lock does not describe the current path dependencies"],
    });
  }
  const sensitiveChannels = declaredChannels.filter(channelHasSensitiveData);
  const sensitiveQualifiers = directDependencyNames.filter((name) => {
    const qualifier = dependencyChannel(dependencies[name]);
    return qualifier !== undefined && channelHasSensitiveData(qualifier);
  });
  if (sensitiveChannels.length > 0 || sensitiveQualifiers.length > 0) {
    return definitiveGrade(1, {
      reasons: [CREDENTIAL_CHANNEL_REASON],
      lints,
      nextActions: [
        "remove credentials and URL parameters from pixi.toml; configure authentication outside the manifest",
      ],
    });
  }

  const portabilityCaps: Array<{ reason: string; package: LockedPackage }> = [];
  for (const lockedPackage of lock.packages) {
    if (lockedPackage.channel === null) {
      portabilityCaps.push({
        reason: `${lockedPackage.name} built from source at ${lockedPackage.source}`,
        package: lockedPackage,
      });
    } else if (
      lockedPackage.channel.startsWith("local:") ||
      !publicArtifact(lockedPackage.source ?? "")
    ) {
      portabilityCaps.push({
        reason: channelHasSensitiveData(lockedPackage.source ?? "")
          ? `${lockedPackage.name} resolved from a credential-bearing channel URL`
          : `${lockedPackage.name} resolved from a non-public channel (${lockedPackage.source})`,
        package: lockedPackage,
      });
    }
  }
  if (portabilityCaps.length > 0) {
    const cappingPackage = portabilityCaps[0].package;
    return definitiveGrade(1, {
      reasons: portabilityCaps.map(({ reason }) => reason),
      lints,
      cap: packageCap(cappingPackage),
      nextActions: [
        cappingPackage.channel === null
          ? `publish ${cappingPackage.name} to conda-forge or bioconda — it is built from source at ${cappingPackage.source}`
          : channelHasSensitiveData(cappingPackage.source ?? "")
            ? `configure ${cappingPackage.name} without embedding channel credentials in project evidence`
            : `republish ${cappingPackage.name} from a public channel — it resolves from ${cappingPackage.source}`,
      ],
    });
  }

  const roots = resolveDirectRoots(dependencies, lockedPackagesByName);
  const resolvedTargets = roots.map(
    (root) => `${qualifiedName(root.name, root.channel)}=${root.version}`,
  );
  const target = resolvedTargets.join(",");

  /**
   * Mulled targets for a multi-package image, where the qualifier is part of the hashed identity.
   *
   * BioContainers hashes the target strings exactly as `hash.tsv` records them, so a qualifier
   * genuinely changes which image a combination names — see PROFILE.md's channel-qualifier rule.
   * That only holds for the multi-package form, which is the one that hashes.
   */
  const qualifiedContainerTargets: Target[] = roots.map((root) => ({
    package: qualifiedName(root.name, root.channel),
    version: root.version,
    build: root.build,
  }));

  const outsideCommunityPackages = lock.packages.filter(
    (lockedPackage) =>
      lockedPackage.channel !== null && !COMMUNITY_CHANNELS.has(lockedPackage.channel),
  );
  if (outsideCommunityPackages.length > 0) {
    const outsideCommunityChannels = [
      ...new Set(outsideCommunityPackages.map((lockedPackage) => lockedPackage.channel as string)),
    ].sort();
    const cappingPackage = outsideCommunityPackages[0];
    return definitiveGrade(2, {
      target,
      lints,
      cap: packageCap(cappingPackage),
      reasons: [
        `every package is public, but ${cappingPackage.name} resolves from ${cappingPackage.channel} — the closure uses non-community channels: ${outsideCommunityChannels.join(", ")}`,
        "L3 requires every package to resolve from conda-forge or bioconda",
      ],
      nextActions: [`get ${cappingPackage.name} into conda-forge or bioconda`],
    });
  }

  if (directDependencyNames.length === 1) {
    const lockedPackage = lockedPackagesByName.get(directDependencyNames[0]);
    /**
     * A single-package image is named, not hashed: the repository component is the package name
     * itself. A `channel::` qualifier there would not merely name a different image, it would make
     * the reference unparseable — `quay.io/biocontainers/bioconda::samtools:1.17` is not a
     * container reference at all. The qualifier stays in `target`, where it is a claim about
     * provenance, and is dropped here, where the string has to be pullable.
     */
    const singleContainerTarget: Target[] = [
      {
        package: directDependencyNames[0],
        version: lockedPackage?.version,
        build: lockedPackage?.build,
      },
    ];
    if (
      lockedPackage !== undefined &&
      lockedPackage.channel !== null &&
      AUTO_CONTAINER_CHANNELS.has(lockedPackage.channel)
    ) {
      return definitiveGrade(3, {
        target,
        lints,
        reasons: [
          `single ${lockedPackage.channel} package — BioContainers builds one image per recipe build`,
          "L4 needs that image observed at a registry, which offline grading cannot do",
        ],
        publication: {
          uri: pullUri(singleContainerTarget),
          state: "INFERRED",
          basis: `a single ${lockedPackage.channel} package, and BioContainers builds one image per recipe build`,
        },
        nextActions: [CONFIRM_ACTION],
      });
    }
    return definitiveGrade(3, {
      target,
      lints,
      reasons: [
        `${lockedPackage?.name} is ecosystem-ready on ${lockedPackage?.channel}, which does not auto-build containers`,
      ],
      publication: {
        uri: pullUri(singleContainerTarget),
        state: "UNREGISTERED",
        basis: `${lockedPackage?.channel} does not auto-build containers, so this is only the name an image would have`,
      },
      nextActions: [
        `publish a container for ${target} — ${lockedPackage?.channel} packages are not built automatically`,
      ],
    });
  }

  const combinations = loadCombinations(options.combinationsPath ?? DEFAULT_COMBINATIONS_PATH);
  // A caller-supplied table is not the copy the vendored snapshot describes, so claim no provenance.
  const snapshot = options.combinationsPath === undefined ? loadSnapshot() : undefined;
  const registration = combinations.get(combinationKey(resolvedTargets));
  if (registration !== undefined) {
    const [registeredTargetSpec, imageBuild] = registration;
    return definitiveGrade(3, {
      target,
      lints,
      snapshot,
      reasons: [
        `registered in BioContainers combinations/hash.tsv as: ${registeredTargetSpec}`,
        "L4 needs that image observed at a registry, which offline grading cannot do",
      ],
      publication: {
        // Named from the registry's own spelling, not the manifest's. The image already exists;
        // reproducing its name means hashing what BioContainers hashed, and a manifest that
        // qualifies a dependency the registered line leaves bare would otherwise compute a
        // different — and unbuilt — name for the very container just found.
        uri: pullUri(parseRegisteredTargets(registeredTargetSpec), imageBuild),
        state: "REGISTERED",
        basis: `listed in the combinations/hash.tsv snapshot fetched ${snapshot?.fetched ?? "at an unrecorded time"}`,
      },
      nextActions: [CONFIRM_ACTION],
    });
  }

  // Nothing is registered, so there is no registry spelling to defer to and `target` is exactly
  // the line the next action asks for. Name the image from the same string.
  const proposedTargets = qualifiedContainerTargets.map(({ package: packageName, version }) => ({
    package: packageName,
    version,
  }));
  return definitiveGrade(3, {
    target,
    lints,
    snapshot,
    reasons: [
      "every package is ecosystem-ready, but this combination has no hash.tsv line",
      "L4 is one pull request away — add the target string above to combinations/hash.tsv",
    ],
    publication: {
      uri: pullUri(proposedTargets, "0"),
      state: "UNREGISTERED",
      basis: "this is only the name an image would have once built",
    },
    nextActions: [`add \`${target}\` to BioContainers combinations/hash.tsv`],
  });
}
