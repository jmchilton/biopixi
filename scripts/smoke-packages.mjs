#!/usr/bin/env node

// Exercise installed tarballs, because source-tree tests cannot prove that each
// package's `files` list includes every runtime asset and entry point.

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporaryRoot = mkdtempSync(path.join(tmpdir(), "biopixi-smoke-"));
const tarballs = path.join(temporaryRoot, "tarballs");
const consumer = path.join(temporaryRoot, "consumer");

function packageVersion(directory) {
  const manifest = JSON.parse(readFileSync(path.join(root, "packages", directory, "package.json")));
  return manifest.version;
}

function run(command, args, cwd = root, env = process.env) {
  execFileSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
  });
}

function cleanNpmEnvironment() {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith("npm_config_")),
  );
  return { ...env, npm_config_cache: path.join(temporaryRoot, "npm-cache") };
}

try {
  mkdirSync(tarballs);
  mkdirSync(consumer);

  run("pnpm", ["--dir", "packages/core", "pack", "--pack-destination", tarballs]);
  run("pnpm", ["--dir", "packages/cli", "pack", "--pack-destination", tarballs]);

  const coreTarball = path.join(tarballs, `biopixi-core-${packageVersion("core")}.tgz`);
  const cliTarball = path.join(tarballs, `biopixi-cli-${packageVersion("cli")}.tgz`);
  writeFileSync(
    path.join(consumer, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", coreTarball, cliTarball],
    consumer,
    cleanNpmEnvironment(),
  );

  const checkPath = path.join(consumer, "check.mjs");
  writeFileSync(
    checkPath,
    `import { grade, pullUri } from "@biopixi/core";
import { buildProgram } from "@biopixi/cli";

if (pullUri([{ package: "samtools", version: "1.20", build: "h50ea8bc_1" }]) !==
    "quay.io/biocontainers/samtools:1.20--h50ea8bc_1") {
  throw new Error("the packed core package returned an unexpected pull URI");
}

const result = grade(process.argv[2]);
if (result.snapshot?.file !== "biocontainers-hash.tsv") {
  throw new Error("the packed core package could not load its metadata snapshot");
}

if (buildProgram().name() !== "biopixi") {
  throw new Error("the packed CLI package did not expose its program builder");
}
`,
  );

  run(process.execPath, [checkPath, path.join(root, "examples/l4-combination")], consumer);
  run(path.join(consumer, "node_modules/.bin/biopixi"), ["--help"], consumer);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
