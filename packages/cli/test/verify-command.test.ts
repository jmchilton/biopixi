import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type { Fetcher } from "@biopixi/core";
import { describe, expect, it } from "vitest";

import { EXIT_CODES, runVerify } from "../src/index.js";

const examples = join(fileURLToPath(new URL("../../../", import.meta.url)), "examples");
const DIGEST = "sha256:6f88956b747a67b2a39a3ff72c4de30e665239ee11db610624dd4298e30db1bf";

/** Never reaches the network: the suite must not depend on quay.io being up or on its contents. */
function registry(body: unknown, status = 200): Fetcher {
  return () => Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const present = registry({ tags: [{ name: "t", manifest_digest: DIGEST }] });
const absent = registry({ tags: [] });

function collect() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: { stdout: (m: string) => out.push(m), stderr: (m: string) => err.push(m) },
  };
}

describe("runVerify", () => {
  it("promotes an observed candidate to L4 and prints the digest", async () => {
    const { out, io } = collect();

    const code = await runVerify(
      [join(examples, "l4-single")],
      { verify: { fetcher: present, observedAt: "2026-07-30T00:00:00.000Z" } },
      io,
    );

    expect(code).toBe(EXIT_CODES.ok);
    expect(out.join("\n")).toContain("L4");
    expect(out.join("\n")).toContain("CONFIRMED");
    expect(out.join("\n")).toContain(DIGEST);
  });

  it("leaves an unobservable candidate at L3", async () => {
    const { out, io } = collect();

    await runVerify([join(examples, "l4-single")], { verify: { fetcher: absent } }, io);

    expect(out.join("\n")).toContain("L3");
    expect(out.join("\n")).toContain("INFERRED");
  });

  it("satisfies --min-level 4 only once the container is observed", async () => {
    const { io } = collect();
    const at = join(examples, "l4-single");

    await expect(runVerify([at], { minLevel: 4, verify: { fetcher: present } }, io)).resolves.toBe(
      EXIT_CODES.ok,
    );
    await expect(runVerify([at], { minLevel: 4, verify: { fetcher: absent } }, io)).resolves.toBe(
      EXIT_CODES.belowThreshold,
    );
  });

  it("fails --require-verified with its own code, distinct from a low level", async () => {
    const { err, io } = collect();

    const code = await runVerify(
      [join(examples, "l4-single")],
      { requireVerified: true, verify: { fetcher: absent } },
      io,
    );

    expect(code).toBe(EXIT_CODES.unconfirmed);
    expect(err.join("\n")).toContain("no observed container");
  });

  it("reports an unreachable registry on stderr without calling it a negative", async () => {
    const { err, io } = collect();

    const code = await runVerify(
      [join(examples, "l4-single")],
      { verify: { fetcher: () => Promise.reject(new Error("ENETDOWN")) } },
      io,
    );

    expect(code).toBe(EXIT_CODES.ok);
    expect(err.join("\n")).toContain("could not check");
  });

  it("carries the observation into the JSON report", async () => {
    const { out, io } = collect();

    await runVerify(
      [join(examples, "l4-single")],
      { json: true, verify: { fetcher: present, observedAt: "2026-07-30T00:00:00.000Z" } },
      io,
    );

    const [entry] = JSON.parse(out.join("\n")).results;
    expect(entry.level).toBe(4);
    expect(entry.observation).toEqual({ outcome: "present", digest: DIGEST });
    expect(entry.publication.digest).toBe(DIGEST);
  });
});
