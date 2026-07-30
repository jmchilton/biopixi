/**
 * Observing a container claim at a public registry.
 *
 * This is the one part of biopixi that reaches the network, and it exists because L4 is not
 * decidable offline: no file in a project records that an image was built and can be pulled.
 * `grade` stays pure; a caller that wants L4 asks for it explicitly.
 */
import type { Grade, Publication } from "./grade.js";

/** quay.io's tag listing, which answers anonymously and needs no credentials. */
const QUAY_API = "https://quay.io/api/v1/repository";
const DEFAULT_TIMEOUT_MS = 15_000;

/** What a registry lookup established. Absence and ignorance are deliberately not the same. */
export type Observation =
  | { outcome: "present"; digest: string }
  | { outcome: "absent"; detail: string }
  | { outcome: "indeterminate"; detail: string };

/** Injected so tests are offline and deterministic, and so a caller can supply its own client. */
export type Fetcher = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

export interface VerifyOptions {
  fetcher?: Fetcher;
  timeoutMs?: number;
  /** Supplied rather than read from the clock, so a caller can stamp a whole run identically. */
  observedAt?: string;
}

/** A `quay.io/biocontainers/<repository>:<tag>` claim split into what the API needs. */
export function parsePullUri(uri: string): { repository: string; tag: string } | undefined {
  const match = /^quay\.io\/([^:]+?)\/([^/:]+)(?::(.+))?$/.exec(uri);
  if (match === null) {
    return undefined;
  }
  const [, namespace, name, tag] = match;
  // An untagged claim means `latest` to a registry, which is never what a grade is about.
  return tag === undefined ? undefined : { repository: `${namespace}/${name}`, tag };
}

/**
 * Ask a registry whether one image is anonymously pullable.
 *
 * Anonymity is the property under test, so an authorization failure is a negative rather than an
 * unknown: whatever may exist behind those credentials is not what this claim asserts. Only a
 * transport failure leaves the question genuinely open.
 */
export async function observe(uri: string, options: VerifyOptions = {}): Promise<Observation> {
  const target = parsePullUri(uri);
  if (target === undefined) {
    return { outcome: "indeterminate", detail: `not a recognized registry URI: ${uri}` };
  }

  const fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const url = `${QUAY_API}/${target.repository}/tag/?specificTag=${encodeURIComponent(target.tag)}&onlyActiveTags=true`;

  let response: Response;
  try {
    response = await fetcher(url, { signal: controller.signal });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { outcome: "indeterminate", detail: `could not reach ${QUAY_API}: ${detail}` };
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) {
    return {
      outcome: "absent",
      detail: `the registry refused an anonymous request (${response.status}), so the image is not publicly pullable`,
    };
  }
  if (response.status === 404) {
    return { outcome: "absent", detail: "no such repository at the registry" };
  }
  // A server-side fault says nothing about the image, so it must not be recorded as a negative.
  if (!response.ok) {
    return { outcome: "indeterminate", detail: `registry returned ${response.status}` };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    return {
      outcome: "indeterminate",
      detail: `registry response was not JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const tags = (payload as { tags?: unknown }).tags;
  const first = Array.isArray(tags)
    ? (tags[0] as { manifest_digest?: unknown } | undefined)
    : [][0];
  if (first === undefined) {
    return { outcome: "absent", detail: `the repository has no tag ${target.tag}` };
  }
  if (typeof first.manifest_digest !== "string") {
    // Presence without a digest is not evidence we can record: CONFIRMED must be auditable.
    return { outcome: "indeterminate", detail: "registry reported the tag without a digest" };
  }
  return { outcome: "present", digest: first.manifest_digest };
}

/** A grade with its container claim observed, and whatever the observation established. */
export interface VerifiedGrade extends Grade {
  /** Absent when the result carried no publication to observe. */
  observation?: Observation;
}

/**
 * Observe a graded result's container claim and apply what was learned.
 *
 * Promotion is deliberately narrow: only a candidate the offline grade already found L4-eligible
 * can become L4, and only on a recorded digest. An observation never lowers a level — the level
 * below L4 is a statement about the lock, which the registry has nothing to say about.
 */
export async function verifyGrade(
  result: Grade,
  options: VerifyOptions = {},
): Promise<VerifiedGrade> {
  const { publication } = result;
  if (publication === undefined) {
    return result;
  }

  const observation = await observe(publication.uri, options);
  const observedAt = options.observedAt ?? new Date().toISOString();
  const eligible = publication.state === "INFERRED" || publication.state === "REGISTERED";

  if (observation.outcome === "indeterminate") {
    // Nothing was established, so nothing is recorded but the attempt.
    return { ...result, observation, publication: { ...publication, observedAt } };
  }

  if (observation.outcome === "absent") {
    const confirmed: Publication = {
      ...publication,
      observedAt,
      basis: `${publication.basis}; ${observation.detail}`,
    };
    return { ...result, observation, publication: confirmed };
  }

  const confirmed: Publication = {
    ...publication,
    state: "CONFIRMED",
    digest: observation.digest,
    observedAt,
    basis: `observed at quay.io on ${observedAt}`,
  };
  if (!eligible) {
    // The image exists but the target set is not registered, so this is not the container the
    // ecosystem would build for it. Worth recording; not worth promoting on.
    return { ...result, observation, publication: { ...confirmed, state: publication.state } };
  }

  return {
    ...result,
    observation,
    level: 4,
    label: "L4",
    publication: confirmed,
    reasons: [`container observed at ${publication.uri}`, `digest ${observation.digest}`],
    nextActions: [],
  };
}
