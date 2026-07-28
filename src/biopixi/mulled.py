"""Offline mulled-v2 naming.

A stdlib-only reimplementation of what `mulled-hash` computes — kept here to prove a point
rather than to replace the tool: the BioContainers name for a target string is a pure function
of that string, so `grade` can name the image it is talking about with no network round-trip
and no conda toolchain. Verified against upstream's own doctest vectors in tests/test_mulled.py.

Note what is *not* derivable from the targets: the trailing `-<image_build>` on a multi-package
tag. That is a BioContainers registration fact, and it lives in column 3 of
`combinations/hash.tsv` — so it is still offline, just sourced from the vendored snapshot
rather than computed.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass


@dataclass(frozen=True)
class Target:
    package: str
    version: str | None = None
    build: str | None = None


def _sha1(lines: list[str]) -> str:
    return hashlib.sha1("\n".join(lines).encode()).hexdigest()


def v2_image_name(targets: list[Target], image_build: str | None = None) -> str:
    """Repository:tag for a set of conda targets. Mirrors galaxy-tool-util's v2_image_name."""
    if len(targets) == 1:
        return _simple_image_name(targets[0], image_build)

    ordered = sorted(targets, key=lambda t: t.package)
    package_hash = _sha1([t.package for t in ordered])

    # Versions are hashed only if at least one target carries one. Build strings never are.
    if any(t.version for t in ordered):
        version_hash = _sha1([t.version or "null" for t in ordered])
    else:
        version_hash = ""

    if not image_build:
        build_suffix = ""
    elif version_hash:
        build_suffix = f"-{image_build}"
    else:
        build_suffix = image_build

    suffix = f":{version_hash}{build_suffix}" if (version_hash or build_suffix) else ""
    return f"mulled-v2-{package_hash}{suffix}"


def _simple_image_name(target: Target, image_build: str | None = None) -> str:
    """A lone target is not hashed at all — it is just name:version--build."""
    if target.version is None:
        return target.package
    build = target.build
    if build is None and image_build is not None and image_build != "0":
        build = image_build
    return f"{target.package}:{target.version}" + (f"--{build}" if build is not None else "")


def pull_uri(targets: list[Target], image_build: str | None = None) -> str:
    return f"quay.io/biocontainers/{v2_image_name(targets, image_build=image_build)}"
