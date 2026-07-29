import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runGrade } from "../src/index.js";

const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("runGrade", () => {
  it("renders a grade", () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const code = runGrade(
      [join(root, "examples/l4-single")],
      {},
      {
        stdout: (message) => stdout.push(message),
        stderr: (message) => stderr.push(message),
      },
    );

    expect(code).toBe(0);
    expect(stdout.join("\n")).toContain("L4");
    expect(stderr).toEqual([]);
  });

  it("enforces a minimum level", () => {
    const stderr: string[] = [];
    const code = runGrade(
      [join(root, "examples/l1-local-recipe")],
      { minLevel: 3 },
      {
        stdout: () => undefined,
        stderr: (message) => stderr.push(message),
      },
    );

    expect(code).toBe(1);
    expect(stderr.join("\n")).toContain("L1 < required L3");
  });
});
