import { describe, expect, it } from "vitest";

import {
  artifactChannelUrl,
  channelIdentity,
  channelMatches,
  condaGlobMatches,
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

  it("matches build globs", () => {
    expect(condaGlobMatches("py*", "py312_0")).toBe(true);
    expect(condaGlobMatches("cuda*", "py312_0")).toBe(false);
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
