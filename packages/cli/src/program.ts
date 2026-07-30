import { Command, Option } from "commander";

import packageMetadata from "../package.json" with { type: "json" };
import { runGrade } from "./grade-command.js";

/**
 * Construct the biopixi command tree without parsing process arguments.
 */
export function buildProgram(): Command {
  const program = new Command()
    .name("biopixi")
    .description("Grade how far a Pixi environment can travel outside its project")
    .version(packageMetadata.version);

  program
    .command("grade")
    .description("grade one or more Pixi project directories")
    .argument("[directories...]", "project directories", ["."])
    .addOption(
      new Option("--min-level <level>", "exit nonzero below this level")
        .argParser((value) => Number.parseInt(value, 10))
        .choices(["0", "1", "2", "3", "4"]),
    )
    .option("--source-root <path>", "bound path dependencies to this ancestor of each project")
    .option("--json", "write the machine-readable report to stdout instead of the rendering")
    .action(
      (
        directories: string[],
        options: { minLevel?: string; sourceRoot?: string; json?: boolean },
      ) => {
        const minLevel =
          options.minLevel === undefined ? undefined : Number.parseInt(options.minLevel, 10);
        process.exitCode = runGrade(directories, {
          minLevel,
          sourceRoot: options.sourceRoot,
          json: options.json,
        });
      },
    );

  return program;
}
