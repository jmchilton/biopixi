import type { CondaBuildPlan, CondaBuildTarget } from "@biopixi/core";

export type WaveOutput = "json" | "yaml";

export interface WaveCommandOptions {
  executable?: string;
  dryRun?: boolean;
  await?: boolean | string;
  freeze?: boolean;
  buildRepo?: string;
  buildTemplate?: string;
  singularity?: boolean;
  output?: WaveOutput;
}

export interface WaveCommand {
  executable: string;
  args: string[];
}

/** Remove URL userinfo and parameters before a value is shown to a person. */
export function redactSensitiveUrls(value: string): string {
  return value.replace(/https?:\/\/[^\s,'");]+/g, (raw) => {
    try {
      const url = new URL(raw);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch {
      return "[redacted URL]";
    }
  });
}

/** Render one exact Conda root in Wave's accepted MatchSpec spelling. */
export function waveTarget(target: CondaBuildTarget): string {
  const name = `${target.channel === undefined ? "" : `${target.channel}::`}${target.name}`;
  return `${name}=${target.version}=${target.build}`;
}

/** Build a shell-free Wave invocation from a reconciled core plan. */
export function buildWaveCommand(
  plan: CondaBuildPlan,
  options: WaveCommandOptions = {},
): WaveCommand {
  const args = plan.targets.flatMap((target) => ["--conda-package", waveTarget(target)]);
  args.push("--conda-channels", plan.channels.join(","), "--platform", "linux/amd64");

  if (options.dryRun === true) {
    args.push("--dry-run");
  }
  if (options.await !== undefined && options.await !== false) {
    args.push("--await");
    if (typeof options.await === "string") {
      args.push(options.await);
    }
  }
  if (options.freeze === true) {
    args.push("--freeze");
  }
  if (options.buildRepo !== undefined) {
    args.push("--build-repo", options.buildRepo);
  }
  if (options.buildTemplate !== undefined) {
    args.push("--build-template", options.buildTemplate);
  }
  if (options.singularity === true) {
    args.push("--singularity");
  }
  if (options.output !== undefined) {
    args.push("--output", options.output);
  }

  return { executable: options.executable ?? "wave", args };
}

function shellWord(value: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'"'"'`)}'`;
}

/** A copy-pasteable diagnostic rendering; execution always uses the argv array instead. */
export function renderWaveCommand(command: WaveCommand): string {
  return [command.executable, ...command.args]
    .map((word) => shellWord(redactSensitiveUrls(word)))
    .join(" ");
}
