# @biopixi/cli

`@biopixi/cli` exposes the `biopixi` executable and reusable command functions.

```bash
biopixi grade
biopixi grade project-a project-b
biopixi grade project-a --min-level 3
```

Without a directory, `grade` uses the current working directory. `--min-level` makes the command
exit nonzero when the worst result falls below the requested level.

Programmatic callers can import `runGrade`, `renderGrade`, or `buildProgram`.
