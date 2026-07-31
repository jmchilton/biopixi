import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Fetcher } from "@biopixi/core";
import { describe, expect, it } from "vitest";

import { EXIT_CODES, runVerify } from "../src/index.js";

const examples = join(fileURLToPath(new URL("../../../", import.meta.url)), "examples");
const DIGEST = "sha256:6f88956b747a67b2a39a3ff72c4de30e665239ee11db610624dd4298e30db1bf";

/** Never reaches the network: the suite must not depend on quay.io being up or on its contents. */
function createRegistryFetcher(body: unknown, status = 200): Fetcher {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const PRESENT_IMAGE_FETCHER = createRegistryFetcher({
  tags: [{ name: "t", manifest_digest: DIGEST }],
});
const ABSENT_IMAGE_FETCHER = createRegistryFetcher({ tags: [] });

function createIoCapture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (message: string) => stdout.push(message),
      stderr: (message: string) => stderr.push(message),
    },
  };
}

describe("runVerify", () => {
  it("promotes an observed candidate to L4 and prints the digest", async () => {
    const { stdout, io } = createIoCapture();

    const code = await runVerify(
      [join(examples, "l4-single")],
      { verify: { fetcher: PRESENT_IMAGE_FETCHER, observedAt: "2026-07-30T00:00:00.000Z" } },
      io,
    );

    expect(code).toBe(EXIT_CODES.ok);
    expect(stdout.join("\n")).toContain("L4");
    expect(stdout.join("\n")).toContain("CONFIRMED");
    expect(stdout.join("\n")).toContain(DIGEST);
  });

  it("leaves an unobservable candidate at L3", async () => {
    const { stdout, io } = createIoCapture();

    await runVerify(
      [join(examples, "l4-single")],
      { verify: { fetcher: ABSENT_IMAGE_FETCHER } },
      io,
    );

    expect(stdout.join("\n")).toContain("L3");
    expect(stdout.join("\n")).toContain("INFERRED");
  });

  it("satisfies --min-level 4 only once the container is observed", async () => {
    const { io } = createIoCapture();
    const directory = join(examples, "l4-single");

    await expect(
      runVerify([directory], { minLevel: 4, verify: { fetcher: PRESENT_IMAGE_FETCHER } }, io),
    ).resolves.toBe(EXIT_CODES.ok);
    await expect(
      runVerify([directory], { minLevel: 4, verify: { fetcher: ABSENT_IMAGE_FETCHER } }, io),
    ).resolves.toBe(EXIT_CODES.belowThreshold);
  });

  it("fails --require-verified with its own code, distinct from a low level", async () => {
    const { stderr, io } = createIoCapture();

    const code = await runVerify(
      [join(examples, "l4-single")],
      { requireVerified: true, verify: { fetcher: ABSENT_IMAGE_FETCHER } },
      io,
    );

    expect(code).toBe(EXIT_CODES.unconfirmed);
    expect(stderr.join("\n")).toContain("no observed container");
  });

  it("reports an unreachable registry on stderr without calling it a negative", async () => {
    const { stderr, io } = createIoCapture();

    const code = await runVerify(
      [join(examples, "l4-single")],
      { verify: { fetcher: () => Promise.reject(new Error("ENETDOWN")) } },
      io,
    );

    expect(code).toBe(EXIT_CODES.ok);
    expect(stderr.join("\n")).toContain("could not check");
  });

  it("carries the observation into the JSON report", async () => {
    const { stdout, io } = createIoCapture();

    await runVerify(
      [join(examples, "l4-single")],
      {
        json: true,
        verify: { fetcher: PRESENT_IMAGE_FETCHER, observedAt: "2026-07-30T00:00:00.000Z" },
      },
      io,
    );

    const [entry] = JSON.parse(stdout.join("\n")).results;
    expect(entry.level).toBe(4);
    expect(entry.observation).toEqual({ outcome: "present", digest: DIGEST });
    expect(entry.publication.digest).toBe(DIGEST);
  });
});
