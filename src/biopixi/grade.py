# /// script
# requires-python = ">=3.11"
# dependencies = ["pyyaml"]
# ///
"""biopixi grade — static readiness grading for a pixi manifest.

Pure: reads pixi.toml, pixi.lock, and a vendored snapshot of public metadata. No conda, no
Docker, no network. Runs in CI or a pre-commit hook with nothing installed but Python.
"""

from __future__ import annotations

import argparse
import re
import sys
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from biopixi.mulled import Target, pull_uri  # noqa: E402

PUBLIC_CHANNEL_HOSTS = {"conda.anaconda.org", "repo.anaconda.com", "prefix.dev"}
COMMUNITY_CHANNELS = {"conda-forge", "bioconda"}

# Bioconda auto-builds a BioContainers image for every recipe build; conda-forge does not.
# So a single-package environment reaches L4 iff that package resolved from bioconda.
AUTO_CONTAINER_CHANNELS = {"bioconda"}

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

# Heuristic only — reported as a lint, never as a level input.
INSTALL_ISH = re.compile(r"\b(make install|\./configure|pip install|R CMD INSTALL|cmake|curl|wget)\b")


@dataclass
class Grade:
    level: int | None  # None == out of profile (L0)
    reasons: list[str] = field(default_factory=list)
    lints: list[str] = field(default_factory=list)
    target: str | None = None
    evidence: str | None = None

    @property
    def label(self) -> str:
        return "L0" if self.level is None else f"L{self.level}"


@dataclass
class LockedPkg:
    name: str
    version: str | None
    channel: str | None  # None for source builds
    source: str | None = None
    build: str | None = None


def parse_manifest(path: Path) -> dict:
    with path.open("rb") as fh:
        return tomllib.load(fh)


def _dep_tables(manifest: dict) -> list[tuple[str, dict]]:
    """Every dependency table, including the ones hiding under [feature.*]."""
    out = []
    for key in ("dependencies", "pypi-dependencies", "host-dependencies", "build-dependencies"):
        if key in manifest:
            out.append((key, manifest[key]))
    for fname, feat in (manifest.get("feature") or {}).items():
        for key in ("dependencies", "pypi-dependencies"):
            if key in feat:
                out.append((f"feature.{fname}.{key}", feat[key]))
    return out


def check_profile(manifest: dict) -> tuple[list[str], list[str]]:
    """Mechanical conformance. Returns (out_of_profile_reasons, lints)."""
    reasons, lints = [], []
    ws = manifest.get("workspace") or manifest.get("project") or {}

    if not ws.get("channels"):
        reasons.append("no channels declared — nothing to resolve against")
    if not ws.get("platforms"):
        reasons.append("no platforms declared — the target of the build is unstated")
    if not manifest.get("dependencies"):
        reasons.append("no [dependencies] — nothing to package")

    for label, table in _dep_tables(manifest):
        if "pypi-dependencies" in label:
            names = ", ".join(sorted(table))
            reasons.append(f"[{label}] present ({names}) — outside the conda universe")
            continue
        for name, spec in table.items():
            if isinstance(spec, dict):
                for k in ("git", "url"):
                    if k in spec:
                        reasons.append(f"{name} declared by {k}= — no recipe can name this source")

    for tname, body in (manifest.get("tasks") or {}).items():
        text = body if isinstance(body, str) else str(body.get("cmd", ""))
        if INSTALL_ISH.search(text):
            lints.append(f"task '{tname}' looks like an install instruction — that belongs in a recipe")

    return reasons, lints


def load_lock(path: Path) -> tuple[list[LockedPkg], list[str]]:
    """Flatten the default environment's locked closure. Direct deps come from the manifest."""
    data = yaml.safe_load(path.read_text())
    envs = data.get("environments") or {}
    env = envs.get("default") or next(iter(envs.values()), {})
    pkgs, problems = [], []

    for _platform, entries in (env.get("packages") or {}).items():
        for entry in entries:
            if "conda" in entry:
                pkgs.append(_from_url(entry["conda"]))
            elif "conda_source" in entry:
                raw = entry["conda_source"]
                name = raw.split("[", 1)[0].split(" ", 1)[0].strip()
                loc = raw.split("@", 1)[1].strip() if "@" in raw else "?"
                pkgs.append(LockedPkg(name=name, version=None, channel=None, source=loc))
            elif "pypi" in entry:
                problems.append(f"lock contains a PyPI wheel: {entry['pypi'].rsplit('/', 1)[-1]}")
    return pkgs, problems


def _from_url(url: str) -> LockedPkg:
    # https://conda.anaconda.org/<channel>/<subdir>/<name>-<version>-<build>.<ext>
    parts = url.split("/")
    filename = parts[-1]
    channel = parts[-3] if len(parts) >= 3 else "?"
    if not url.startswith("http"):
        channel = f"local:{channel}"
    stem = re.sub(r"\.(conda|tar\.bz2)$", "", filename)
    bits = stem.rsplit("-", 2)
    if len(bits) == 3:
        name, version, build = bits
    else:
        name, version, build = stem, None, None
    return LockedPkg(name=name, version=version, channel=channel, source=url, build=build)


def _host(url: str) -> str:
    m = re.match(r"https?://([^/]+)/", url)
    return m.group(1) if m else ""


def load_combinations(path: Path) -> dict[frozenset, tuple[str, str]]:
    """hash.tsv keyed by the set of name=version targets, channel prefixes stripped.

    Columns are targets, base_image, image_build. The third is the `-N` suffix on the
    published tag — not derivable from the targets, which is why it must be vendored.
    """
    table = {}
    for line in path.read_text().splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        cols = line.split("\t")
        targets = cols[0]
        image_build = cols[2].strip() if len(cols) > 2 and cols[2].strip() else "0"
        key = frozenset(t.split("::")[-1].strip() for t in targets.split(","))
        table[key] = (targets, image_build)
    return table


def grade(directory: Path) -> Grade:
    manifest_path = directory / "pixi.toml"
    if not manifest_path.exists():
        return Grade(level=None, reasons=["no pixi.toml"])

    manifest = parse_manifest(manifest_path)
    reasons, lints = check_profile(manifest)
    if reasons:
        return Grade(level=None, reasons=reasons, lints=lints)

    lock_path = directory / "pixi.lock"
    if not lock_path.exists():
        return Grade(
            level=1,
            reasons=["no pixi.lock — publication is a claim about a solve, and there is no solve"],
            lints=lints,
        )

    locked, problems = load_lock(lock_path)
    reasons.extend(problems)
    by_name = {p.name: p for p in locked}

    # L1: anything in the closure that a stranger cannot fetch.
    held_back = []
    for pkg in locked:
        if pkg.channel is None:
            held_back.append(f"{pkg.name} built from source at {pkg.source}")
        elif pkg.channel.startswith("local:") or _host(pkg.source or "") not in PUBLIC_CHANNEL_HOSTS:
            held_back.append(f"{pkg.name} resolved from a non-public channel ({pkg.source})")
    if held_back:
        return Grade(level=1, reasons=held_back, lints=lints)

    direct = sorted(manifest["dependencies"])
    missing = [d for d in direct if d not in by_name]
    if missing:
        return Grade(level=1, reasons=[f"lock is stale — {', '.join(missing)} not resolved"], lints=lints)

    targets = [f"{d}={by_name[d].version}" for d in direct]
    target_str = ",".join(targets)
    mulled = [Target(d, by_name[d].version, by_name[d].build) for d in direct]

    # L2: public, but outside the community channels whose feedstocks participate in the
    # conda-forge/Bioconda migration machinery.
    outside_community = sorted({p.channel for p in locked if p.channel not in COMMUNITY_CHANNELS})
    if outside_community:
        channels = ", ".join(outside_community)
        return Grade(
            level=2,
            target=target_str,
            lints=lints,
            reasons=[
                f"every package is public, but the resolved closure uses non-community channels: {channels}",
                "L3 requires every package to resolve from conda-forge or bioconda",
            ],
        )

    # L4, route A: a lone bioconda package is auto-containerized, one image per recipe build.
    if len(direct) == 1:
        pkg = by_name[direct[0]]
        if pkg.channel in AUTO_CONTAINER_CHANNELS:
            return Grade(
                level=4, target=target_str, lints=lints,
                reasons=[f"single {pkg.channel} package — BioContainers builds one image per recipe build"],
                evidence=pull_uri(mulled),
            )
        return Grade(
            level=3, target=target_str, lints=lints,
            reasons=[
                f"{pkg.name} is ecosystem-ready on {pkg.channel}, which does not auto-build containers"
            ],
            evidence=f"would be {pull_uri(mulled)} if registered",
        )

    # L4, route B: the combination is registered with BioContainers. Build strings are not
    # part of a multi-package name, so drop them before computing it.
    versions_only = [Target(t.package, t.version) for t in mulled]
    combos = load_combinations(DATA_DIR / "biocontainers-hash.tsv")
    key = frozenset(targets)
    if key in combos:
        raw, image_build = combos[key]
        return Grade(
            level=4, target=target_str, lints=lints,
            reasons=[f"registered in BioContainers combinations/hash.tsv as: {raw}"],
            evidence=pull_uri(versions_only, image_build=image_build),
        )

    return Grade(
        level=3, target=target_str, lints=lints,
        reasons=[
            "every package is ecosystem-ready, but this combination has no hash.tsv line",
            "L4 is one pull request away — add the target string above to combinations/hash.tsv",
        ],
        evidence=f"would be {pull_uri(versions_only, image_build='0')} once built",
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="biopixi grade")
    ap.add_argument("dirs", nargs="+", type=Path)
    ap.add_argument("--min-level", type=int, default=None, help="exit nonzero below this level")
    args = ap.parse_args(argv)

    worst = 4
    for d in args.dirs:
        g = grade(d)
        print(f"\n{g.label}  {d}")
        for r in g.reasons:
            print(f"      · {r}")
        if g.target:
            print(f"      target: {g.target}")
        if g.evidence:
            print(f"      evidence: {g.evidence}")
        for lint in g.lints:
            print(f"      lint: {lint}")
        worst = min(worst, g.level if g.level is not None else 0)

    if args.min_level is not None and worst < args.min_level:
        print(f"\nfailed: worst level L{worst} < required L{args.min_level}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
