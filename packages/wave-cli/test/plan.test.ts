import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CondaBuildPlanError } from "@biopixi/core";
import { describe, expect, it } from "vitest";

import { planWaveBuild } from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("planWaveBuild", () => {
  it("accepts definitive public evidence", () => {
    expect(planWaveBuild(join(root, "examples/l3-ecosystem-ready")).targets).toHaveLength(2);
  });

  it("refuses a local path project and points at a local builder", () => {
    expect(() => planWaveBuild(join(root, "examples/l1-local-recipe"))).toThrowError(
      expect.objectContaining<Partial<CondaBuildPlanError>>({
        kind: "insufficient-level",
        message: expect.stringContaining("needs a local builder"),
      }),
    );
  });
});
