import { describe, expect, it } from "vitest";

import { observe, parsePullUri, verifyGrade } from "../src/index.js";
import type { Fetcher, Grade, Publication, PublicationState } from "../src/index.js";

const DIGEST = "sha256:6f88956b747a67b2a39a3ff72c4de30e665239ee11db610624dd4298e30db1bf";
const URI = "quay.io/biocontainers/samtools:1.17--h00cdaf9_0";
const OBSERVED_AT = "2026-07-30T00:00:00.000Z";

/** A fetcher that answers every call the same way, and records what it was asked. */
function answering(body: unknown, status = 200): Fetcher & { calls: string[] } {
  const calls: string[] = [];
  const fetcher = (url: string) => {
    calls.push(url);
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    return Promise.resolve(new Response(payload, { status }));
  };
  return Object.assign(fetcher, { calls });
}

function tagged(digest: string | undefined) {
  return { tags: [digest === undefined ? { name: "t" } : { name: "t", manifest_digest: digest }] };
}

function graded(state: PublicationState, level = 3): Grade {
  const publication: Publication = { uri: URI, state, basis: "because of reasons" };
  return {
    projectRoot: "/p",
    sourceRoot: "/p",
    conformant: true,
    evidenceState: "DEFINITIVE",
    level,
    label: `L${level}`,
    reasons: [],
    lints: [],
    nextActions: ["run `biopixi verify` to observe the container and reach L4"],
    publication,
  };
}

describe("parsePullUri", () => {
  it("splits a tagged biocontainers URI", () => {
    expect(parsePullUri(URI)).toEqual({
      repository: "biocontainers/samtools",
      tag: "1.17--h00cdaf9_0",
    });
  });

  it("refuses an untagged URI, which would mean latest to a registry", () => {
    expect(parsePullUri("quay.io/biocontainers/samtools")).toBeUndefined();
  });

  it("refuses a registry it does not know", () => {
    expect(parsePullUri("docker.io/library/ubuntu:24.04")).toBeUndefined();
  });
});

describe("observe", () => {
  it("reports a digest when the tag is there", async () => {
    const fetcher = answering(tagged(DIGEST));

    await expect(observe(URI, { fetcher })).resolves.toEqual({
      outcome: "present",
      digest: DIGEST,
    });
    expect(fetcher.calls[0]).toContain("specificTag=1.17--h00cdaf9_0");
  });

  it("reports absent when the repository has no such tag", async () => {
    const result = await observe(URI, { fetcher: answering({ tags: [] }) });

    expect(result.outcome).toBe("absent");
  });

  it("treats an anonymous authorization failure as absent, not as unknown", async () => {
    // Anonymity is the property under test, so 401 answers the question this claim asks.
    const result = await observe(URI, { fetcher: answering({}, 401) });

    expect(result.outcome).toBe("absent");
    expect(result).toHaveProperty("detail", expect.stringContaining("not publicly pullable"));
  });

  it("treats a server fault as indeterminate, because it says nothing about the image", async () => {
    const result = await observe(URI, { fetcher: answering({}, 503) });

    expect(result.outcome).toBe("indeterminate");
  });

  it("treats a transport failure as indeterminate", async () => {
    const result = await observe(URI, { fetcher: () => Promise.reject(new Error("ECONNRESET")) });

    expect(result).toEqual({
      outcome: "indeterminate",
      detail: "could not reach https://quay.io/api/v1/repository: ECONNRESET",
    });
  });

  it("refuses to confirm a tag reported without a digest", async () => {
    // CONFIRMED has to be auditable, and there is nothing to record here.
    const result = await observe(URI, { fetcher: answering(tagged(undefined)) });

    expect(result.outcome).toBe("indeterminate");
  });

  it("treats an unparseable body as indeterminate", async () => {
    const result = await observe(URI, { fetcher: answering("<html>nope</html>") });

    expect(result.outcome).toBe("indeterminate");
  });
});

describe("verifyGrade", () => {
  const options = (body: unknown, status = 200) => ({
    fetcher: answering(body, status),
    observedAt: OBSERVED_AT,
  });

  for (const state of ["REGISTERED", "INFERRED"] as PublicationState[]) {
    it(`promotes an observed ${state} candidate to L4`, async () => {
      const result = await verifyGrade(graded(state), options(tagged(DIGEST)));

      expect(result.level).toBe(4);
      expect(result.label).toBe("L4");
      expect(result.publication).toEqual({
        uri: URI,
        state: "CONFIRMED",
        digest: DIGEST,
        observedAt: OBSERVED_AT,
        basis: `observed at quay.io on ${OBSERVED_AT}`,
      });
      expect(result.nextActions).toEqual([]);
    });
  }

  it("does not promote an unregistered target set, even when an image exists", async () => {
    // Something is published under that name, but it is not the container the ecosystem would
    // build for this target set, so it is recorded rather than promoted on.
    const result = await verifyGrade(graded("UNREGISTERED"), options(tagged(DIGEST)));

    expect(result.level).toBe(3);
    expect(result.publication?.state).toBe("UNREGISTERED");
    expect(result.publication?.digest).toBe(DIGEST);
  });

  it("leaves the level alone when the image is not publicly pullable", async () => {
    const result = await verifyGrade(graded("REGISTERED"), options({ tags: [] }));

    expect(result.level).toBe(3);
    expect(result.publication?.state).toBe("REGISTERED");
    expect(result.publication?.basis).toContain("no tag");
    expect(result.observation?.outcome).toBe("absent");
  });

  it("records only the attempt when nothing was established", async () => {
    const result = await verifyGrade(graded("REGISTERED"), options({}, 503));

    expect(result.level).toBe(3);
    expect(result.publication).toEqual({
      uri: URI,
      state: "REGISTERED",
      basis: "because of reasons",
      observedAt: OBSERVED_AT,
    });
  });

  it("leaves a result with no container claim untouched", async () => {
    const withoutPublication: Grade = { ...graded("REGISTERED"), publication: undefined };

    const result = await verifyGrade(withoutPublication, options(tagged(DIGEST)));

    expect(result).toEqual(withoutPublication);
    expect(result.observation).toBeUndefined();
  });
});
