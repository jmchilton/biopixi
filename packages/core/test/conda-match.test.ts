import { describe, expect, it } from "vitest";

import { artifactChannelUrl } from "../src/channel-url.js";
import {
  channelIdentity,
  channelMatches,
  condaGlobMatches,
  condaVersionDecidable,
  condaVersionMatches,
} from "../src/conda-match.js";

describe("Conda MatchSpec matching", () => {
  it("matches version ranges, alternatives, compatible releases, and normalized releases", () => {
    expect(condaVersionMatches(">=2,<3", "2.5")).toBe(true);
    expect(condaVersionMatches(">=1,<2", "2.5")).toBe(false);
    expect(condaVersionMatches("1.0|2.*", "2.3")).toBe(true);
    expect(condaVersionMatches("~=1.4.5", "1.4.9")).toBe(true);
    expect(condaVersionMatches("~=1.4.5", "1.5.0")).toBe(false);
    expect(condaVersionMatches("==1.0", "1.0.0.0")).toBe(true);
    expect(condaVersionMatches(">1.0b4", "1.0rc1")).toBe(true);
  });

  it("orders multi-digit release segments numerically rather than lexically", () => {
    // The check that catches a genuinely stale lock, and the one a string compare gets wrong.
    expect(condaVersionMatches(">=1.10", "1.9")).toBe(false);
    expect(condaVersionMatches(">=1.10", "1.11")).toBe(true);
  });

  it("matches build globs", () => {
    expect(condaGlobMatches("py*", "py312_0")).toBe(true);
    expect(condaGlobMatches("cuda*", "py312_0")).toBe(false);
  });
});

describe("Conda version decidability", () => {
  it("accepts the ordinary comparisons a Pixi manifest spells", () => {
    expect(condaVersionDecidable(">=2,<3", "2.5")).toBe(true);
    expect(condaVersionDecidable("1.17.*", "1.17.1")).toBe(true);
    expect(condaVersionDecidable("~=1.4.5", "1.4.9")).toBe(true);
  });

  it("abstains on epochs, which dominate ordinary segments rather than preceding them", () => {
    // `compareVersions` tokenizes `!` away, so `1!1.0` and `1.1.0` are indistinguishable to it.
    // Deciding either way here would invent a verdict; the lock is graded on other evidence.
    expect(condaVersionDecidable("<2.0", "1!1.0")).toBe(false);
    expect(condaVersionDecidable("1!2.0", "1.0")).toBe(false);
  });

  it("abstains on local version identifiers", () => {
    expect(condaVersionDecidable(">=1.0", "1.0.0+cuda")).toBe(false);
  });

  it("abstains on clause shapes it does not implement", () => {
    expect(condaVersionDecidable(">= 1.0", "1.2")).toBe(false);
  });
});

describe("Conda channel matching", () => {
  it("keeps named channels stable across their canonical channel URL", () => {
    expect(channelIdentity("conda-forge")).toBe("name:conda-forge");
    expect(channelIdentity("https://conda.anaconda.org/conda-forge")).toBe("name:conda-forge");
  });

  it("requires an explicit URL qualifier to match the artifact channel exactly", () => {
    const artifact = "https://one.example/channels/tools/linux-64/tool-1.0-0.conda";
    const channelUrl = artifactChannelUrl(artifact);

    expect(channelUrl).toBe("https://one.example/channels/tools");
    expect(channelMatches("https://one.example/channels/tools", "tools", channelUrl)).toBe(true);
    expect(channelMatches("https://two.example/channels/tools", "tools", channelUrl)).toBe(false);
  });
});
