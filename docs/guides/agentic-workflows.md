# Agentic workflows

**Go fast alone** _**and**_ **go far together.**

Scientific analysis and software hardening move at different speeds. A dependency can be useful
for today's question long before its release, recipe, tests, license, and public distribution are
ready. Stopping the analysis until every packaging task is finished wastes momentum. Ignoring the
packaging work leaves the environment harder for the wider scientific community to use.

An agentic workflow lets both lines of work continue. Keep the main session focused on the
analysis. When a dependency becomes a packaging problem, branch the context and give another
agent a bounded task: make the dependency easier to build, test, share, or contribute upstream.

<div class="agentic-lanes">
  <section class="agentic-lane agentic-lane--analysis">
    <span class="agentic-lane__label">foreground</span>
    <h3>Continue the analysis</h3>
    <p>Run the workflow, inspect results, and preserve the scientific thread.</p>
  </section>
  <div class="agentic-lanes__and" aria-hidden="true"><span>and</span></div>
  <section class="agentic-lane agentic-lane--package">
    <span class="agentic-lane__label">side branch</span>
    <h3>Harden the dependency</h3>
    <p>Write the recipe, test the package, and prepare a focused contribution.</p>
  </section>
  <p class="agentic-lanes__outcome">One scientific thread keeps moving while one software problem gets focused attention.</p>
</div>

The goal is not to maximize the number of agents. It is to keep packaging work from blocking the
analysis or disappearing behind it.

## Branch the context in the tool you already use

The interfaces differ, but each can preserve the analysis thread while opening another path.

<div class="agent-tabs" data-agent-tabs>
  <div class="agent-tabs__controls" role="tablist" aria-label="Agent interfaces">
    <button class="agent-tabs__tab is-active" id="agent-tab-claude" type="button" role="tab" aria-selected="true" aria-controls="agent-panel-claude" tabindex="0">Claude Code</button>
    <button class="agent-tabs__tab" id="agent-tab-codex" type="button" role="tab" aria-selected="false" aria-controls="agent-panel-codex" tabindex="-1">Codex</button>
    <button class="agent-tabs__tab" id="agent-tab-pi" type="button" role="tab" aria-selected="false" aria-controls="agent-panel-pi" tabindex="-1">pi</button>
  </div>
  <section class="agent-tabs__panel is-active" id="agent-panel-claude" role="tabpanel" aria-labelledby="agent-tab-claude">
    <p>Claude Code now uses <a href="https://code.claude.com/docs/en/sessions#branch-a-session"><code>/branch</code></a>, formerly <code>/fork</code>, to copy the conversation into a new session while leaving the original intact. Use a <a href="https://code.claude.com/docs/en/common-workflows#run-parallel-sessions-with-worktrees">separate worktree</a> when both sessions will edit files.</p>
    <pre><code class="language-text">/branch package-r-designit</code></pre>
  </section>
  <section class="agent-tabs__panel" id="agent-panel-codex" role="tabpanel" aria-labelledby="agent-tab-codex" hidden>
    <p>Codex <a href="https://learn.chatgpt.com/docs/developer-commands?surface=cli#fork-the-current-chat-with-fork"><code>/fork</code></a> starts a new chat with the current transcript. In the Codex app, give parallel editing work an isolated <a href="https://learn.chatgpt.com/docs/environments/git-worktrees">worktree</a>.</p>
    <pre><code class="language-text">/fork</code></pre>
  </section>
  <section class="agent-tabs__panel" id="agent-panel-pi" role="tabpanel" aria-labelledby="agent-tab-pi" hidden>
    <p>pi uses <a href="https://pi.dev/docs/latest/sessions#branching-with-tree"><code>/tree</code></a> to grow another branch in the same session file and <code>/fork</code> to create a separate session. Pair the new session with a worktree if both paths will edit the repository.</p>
    <pre><code class="language-text">/tree    # keep alternatives together
/fork    # create a separate session</code></pre>
  </section>
</div>

A conversation branch preserves context; a worktree isolates file changes. If the fix belongs in
a project you do not control, a repository fork gives the agent somewhere to prepare an upstream
contribution. Use only the boundaries the task needs.

## Guard rails are part of the task

It is easier than ever to write a recipe, build a package, and prepare it for publication. An
agent does not need to know every packaging detail before it can help. But ease is not the same as
quality: an agent can produce a green build while silently changing versions, duplicating an
existing package, overlooking a license, or testing too little.

Best practices should be explicit priorities, not polish left for the end. Tell the packaging
agent to:

- preserve the scientific intent and current versions unless a change is necessary and explained;
- look for an existing package, recipe, feedstock, or open contribution before creating another;
- inspect the authoritative source release and license, and stop on missing or incompatible terms;
- pin and hash sources, declare every dependency, and test behavior rather than installation alone;
- follow conda-forge, Bioconda, and upstream contribution policies; and
- report evidence and blockers without pushing or publishing unless explicitly authorized.

These guard rails do more than prevent mistakes. They steer the agent toward work the community
can review, maintain, and trust.

## Give the side branch a bounded handoff

A useful handoff names the dependency, protects the analysis, and defines what evidence should
come back. For example:

```text
Harden r-designit for this Pixi environment in a separate worktree.

Preserve the analysis and dependency versions unless a build requires a documented
change. Check for existing packaging work and inspect the upstream release and license.
Follow conda-forge and Bioconda best practices as a priority.

If no suitable package exists, create and test a local Conda recipe, then exercise the
package in a container. Return the branch or patch, commands and test results, decisions,
and blockers. Do not push, publish, or open an external pull request without approval.
```

The agent may return a local package, a small patch, a prepared pull request, or a well-supported
reason to stop. All are useful outcomes. “Done” without the source, license, tests, and decisions
is not.

## A practical pattern

1. Notice a dependency-sized problem during the analysis.
2. Branch the conversation and isolate the files if concurrent edits are possible.
3. Give the agent a concrete outcome and the guard rails above.
4. Continue the scientific work without hiding decisions that change its meaning.
5. Review the returned evidence and decide whether the next step is local use, upstream contribution, or a documented stop.

New software may need its first local Conda recipe and container test. Existing software may only
need a version bump, patch, platform build, or dependency correction. In either case, the agent
turns an environmental surprise into a bounded software task while the researcher keeps the
scientific context.

That is how one person can move quickly without making the environment a private dead end: **go
fast alone** _**and**_ **go far together.**

To understand where that packaging work can lead, read
[From Pixi to BioContainers](from-pixi-to-biocontainers.md). To use the resulting environment with
Pixi, Wave, mulled, or a container runtime, read
[Working with Pixi environments](working-with-pixi-environments.md).
