/**
 * Generate the JSON Schema for `biopixi grade --json` from the TypeScript types that produce it.
 *
 * The schema is committed rather than built on demand: it is a contract with consumers outside
 * this workspace, and a contract change should be visible in a diff. `--check` re-derives it and
 * fails if the committed copy has drifted from the types.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createGenerator } from "ts-json-schema-generator";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const reportTypePath = join(repositoryRoot, "packages/cli/src/report.ts");
const schemaPath = join(repositoryRoot, "docs/schema/grade-report-v0.schema.json");
const referencePagePath = join(repositoryRoot, "docs/schema/grade-report-v0.md");

/** Kept in step with REPORT_SCHEMA_URL, which every payload carries as its `$schema`. */
function readReportSchemaUrl() {
  const reportSource = readFileSync(reportTypePath, "utf8");
  const schemaUrl = /REPORT_SCHEMA_URL =\s*"([^"]+)"/.exec(reportSource)?.[1];
  if (schemaUrl === undefined) {
    throw new Error(`could not read REPORT_SCHEMA_URL from ${reportTypePath}`);
  }
  return schemaUrl;
}

function generateSchema() {
  const { $schema, ...rest } = createGenerator({
    path: reportTypePath,
    tsconfig: join(repositoryRoot, "packages/cli/tsconfig.json"),
    type: "GradeReport",
  }).createSchema("GradeReport");

  return formatGeneratedOutput({
    $schema,
    $id: readReportSchemaUrl(),
    title: "biopixi grade report",
    ...rest,
  });
}

/** Prettier owns docs/, so committed output has to be written the way prettier would. */
function formatGeneratedOutput(value, filePath = schemaPath) {
  const input = typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`;
  return execFileSync(
    join(repositoryRoot, "node_modules/.bin/prettier"),
    ["--stdin-filepath", filePath],
    { input, encoding: "utf8" },
  );
}

/** Render one property's type the way a reader would say it, not the way JSON Schema spells it. */
function describeType(property) {
  if (property.$ref !== undefined) {
    const name = property.$ref.replace("#/definitions/", "");
    return `[${name}](#${name.toLowerCase()})`;
  }
  if (property.enum !== undefined) {
    return property.enum.map((value) => `\`"${value}"\``).join(" \\| ");
  }
  if (property.anyOf !== undefined) {
    return property.anyOf.map(describeType).join(" \\| ");
  }
  if (Array.isArray(property.type)) {
    return property.type.map((type) => `\`${type}\``).join(" \\| ");
  }
  if (property.type === "array") {
    return `${describeType(property.items)}[]`;
  }
  return `\`${property.type}\``;
}

function renderDefinition(name, definition) {
  const lines = [`## ${name}`, ""];
  if (definition.description !== undefined) {
    lines.push(definition.description, "");
  }
  if (definition.enum !== undefined) {
    lines.push(`One of: ${definition.enum.map((value) => `\`${value}\``).join(", ")}.`, "");
    return lines;
  }

  const requiredFields = new Set(definition.required ?? []);
  lines.push("| Field | Type | Always present | Description |", "| --- | --- | --- | --- |");
  for (const [field, property] of Object.entries(definition.properties ?? {})) {
    const description = (property.description ?? "").replace(/\s*\n\s*/g, " ");
    const presenceMarker = requiredFields.has(field) ? "yes" : "no";
    lines.push(`| \`${field}\` | ${describeType(property)} | ${presenceMarker} | ${description} |`);
  }
  lines.push("");
  return lines;
}

function renderReferencePage(schema) {
  const lines = [
    "<!-- Generated from packages/cli/src/report.ts by scripts/generate-schema.mjs. Do not edit. -->",
    "",
    "# Grade report",
    "",
    "`biopixi grade --json` writes one of these to stdout. It is the only output on stdout in that",
    "mode; diagnostics go to stderr, and the payload is written even when `--min-level` fails, since",
    "that is when a consumer needs it most.",
    "",
    `The schema is committed at \`docs/schema/grade-report-v0.schema.json\` and published at`,
    `[\`${schema.$id}\`](${schema.$id}), which is the string every payload carries as its`,
    "`$schema`. Both this page and the schema are generated from the TypeScript types that produce",
    "the payload, and CI fails if either has drifted from them.",
    "",
    "A field marked *no* under **Always present** is omitted entirely rather than set to null, except",
    "where null is listed as one of its types.",
    "",
  ];

  // GradeReport first: the reader meets the envelope before the things inside it.
  const definitionNames = Object.keys(schema.definitions).sort((left, right) =>
    left === "GradeReport" ? -1 : right === "GradeReport" ? 1 : left.localeCompare(right),
  );
  for (const name of definitionNames) {
    lines.push(...renderDefinition(name, schema.definitions[name]));
  }
  return formatGeneratedOutput(`${lines.join("\n")}\n`, referencePagePath);
}

const serializedSchema = generateSchema();
const generatedFiles = [
  [schemaPath, serializedSchema],
  [referencePagePath, renderReferencePage(JSON.parse(serializedSchema))],
];

if (process.argv.includes("--check")) {
  for (const [path, expected] of generatedFiles) {
    let committedContents;
    try {
      committedContents = readFileSync(path, "utf8");
    } catch {
      console.error(`missing ${path} — run \`pnpm schema\``);
      process.exit(1);
    }
    if (committedContents !== expected) {
      console.error(
        `${path} is out of date with the types in packages/cli/src/report.ts — run \`pnpm schema\``,
      );
      process.exit(1);
    }
  }
  console.log("Grade report schema and reference match the types they are generated from.");
} else {
  for (const [path, contents] of generatedFiles) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, contents);
    console.log(`Wrote ${path}`);
  }
}
