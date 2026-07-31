# Agent Notes

## GitHub CLI authentication

Do not treat `gh auth status` alone as proof that GitHub access is blocked in this environment. It
may report a stale stored token while repository API requests still authenticate through another
credential path.

Before stopping a GitHub workflow for authentication, try a harmless repository read such as:

```sh
gh repo view --json nameWithOwner,defaultBranchRef
```

Only report an authentication blocker when an actual API request fails for an authentication
reason. Distinguish that from sandbox or transient network failures.
