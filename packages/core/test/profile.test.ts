import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { checkProfile, parseManifest } from "../src/index.js";

const fixtures = fileURLToPath(new URL("fixtures/profile/", import.meta.url));

function profileResult(kind: "accepted" | "rejected", name: string) {
  return checkProfile(parseManifest(join(fixtures, kind, name, "pixi.toml")));
}

describe("profile boundary", () => {
  for (const name of [
    "minimal-linux",
    "linux-and-macos-targets",
    "explicit-default",
    "target-only-dependency",
    "unused-target-pypi",
    "path-dependency",
  ]) {
    it(`accepts the real Pixi project ${name}`, () => {
      expect(profileResult("accepted", name).reasons).toEqual([]);
    });
  }

  // Each fixture isolates one boundary, so the complete reason list is asserted: an extra reason
  // means the fixture, or the check that fired, is describing something other than its subject.
  for (const [name, expectedReasons] of [
    ["legacy-project", ["legacy [project]"]],
    ["missing-channels", ["no channels declared"]],
    ["no-conda-dependencies", ["no Conda dependencies"]],
    ["named-feature", ["named feature"]],
    ["named-environment", ["named environment"]],
    ["empty-environments", ["must define only default = []"]],
    ["composed-default", ["environments.default must be []"]],
    ["no-default-feature", ["environments.default must be []", "no-default-feature"]],
    ["solve-group", ["environments.default must be []", "solve-group"]],
    ["missing-linux", ["requires linux-64"]],
    ["extra-platform", ["permits only optional osx-arm64"]],
    ["pypi", ["[pypi-dependencies]"]],
    ["target-pypi", ["[target.linux-64.pypi-dependencies]"]],
    ["path-without-preview", ['path dependency without preview = ["pixi-build"]']],
  ] as Array<[string, string[]]>) {
    it(`rejects the Pixi-valid project ${name}`, () => {
      const { reasons } = profileResult("rejected", name);
      expect(reasons).toHaveLength(expectedReasons.length);
      expectedReasons.forEach((expected, index) => {
        expect(reasons[index]).toContain(expected);
      });
    });
  }
});
