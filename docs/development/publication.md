# Publication

`@biopixi/core` and `@biopixi/cli` publish from GitHub Actions through npm trusted publishing.
The release workflow has no npm token: npm exchanges its GitHub OIDC identity for a short-lived
publish credential and records provenance for each public package.

## Normal release flow

1. A package-changing pull request includes a `.changeset/*.md` release note.
2. After it merges to `main`, `release.yml` validates the repository and opens or updates the
   **Version Packages** pull request.
3. Merging that pull request runs the same workflow again and publishes the bumped packages.

The privileged release job publishes the `dist` directories produced by the unprivileged
validation job. `pnpm smoke` also installs both packed tarballs in a clean temporary consumer, so
missing runtime data or entry points fail before publication.

## One-time bootstrap for a new package

npm can only attach a trusted publisher to a package that already exists. The initial package
record therefore has to be created interactively by a maintainer.

### 1. Validate and publish the stubs

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm smoke
npm login

NPM_CONFIG_PROVENANCE=false pnpm --filter @biopixi/core publish --no-git-checks --tag stub
NPM_CONFIG_PROVENANCE=false pnpm --filter @biopixi/cli publish --no-git-checks --tag stub
```

Publish core first because the CLI depends on it. The package manifests make both scoped packages
public. `NPM_CONFIG_PROVENANCE=false` is required for this laptop-only bootstrap because there is
no CI OIDC identity; it overrides `publishConfig.provenance` for this publish only. `--tag stub`
keeps the bootstrap version off the normal `latest` release channel.

These commands publish version `0.1.0`. The pending Changesets bump both linked packages to `0.2.0`
for the first automated release, so no published version is reused.

Confirm both records:

```sh
npm dist-tag ls @biopixi/core
npm dist-tag ls @biopixi/cli
```

### 2. Configure both trusted publishers

On each package's npm **Settings → Trusted publishing** page, choose GitHub Actions and enter:

| Field                | Value         |
| -------------------- | ------------- |
| Organization or user | `jmchilton`   |
| Repository           | `biopixi`     |
| Workflow filename    | `release.yml` |
| Environment          | `npm-publish` |
| Allowed action       | `npm publish` |

The spelling is case-sensitive. The workflow filename is only the filename, not
`.github/workflows/release.yml`. npm permits one trusted-publisher record per package, so repeat
this setup for both packages.

After trusted publishing is configured, set **Publishing access** to **Require two-factor
authentication and disallow tokens**. OIDC publishing continues to work, while long-lived publish
tokens cannot be used.

### 3. Enable the GitHub release settings

- Create or retain the `npm-publish` GitHub environment. It needs no secret. Optional reviewers
  turn each publish into an approval-gated deployment.
- Under **Settings → Actions → General**, enable **Allow GitHub Actions to create and approve pull
  requests** so Changesets can open its version pull request.

Once both trusted publishers are saved, merge the repository changes carrying `release.yml`.
The first main-branch run opens the `0.2.0` Version Packages pull request; merging that pull request
publishes both packages with provenance and moves normal installation to the real release.

## Troubleshooting

- `ENEEDAUTH` or a publish-time `E404`: verify `release.yml`, `jmchilton/biopixi`, the
  `npm-publish` environment, and `id-token: write` exactly match the npm records.
- A package page or `npm view` can briefly return 404 after the first publish. Check
  `npm dist-tag ls <package>` before retrying; a package version can never be republished.
- A Version Packages branch without a pull request usually means the repository-level setting
  allowing Actions to create pull requests is disabled.
