# /// script
# requires-python = ">=3.11"
# dependencies = ["pytest"]
# ///
"""Vectors lifted verbatim from galaxy-tool-util's v2_image_name doctests, plus two verified
live against quay.io on 2026-07-28. If these pass, the mulled name is offline-computable —
which is the whole claim the L3 row rests on.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from biopixi.mulled import Target, v2_image_name  # noqa: E402

UPSTREAM_DOCTEST_VECTORS = [
    ([Target("samtools", "1.3.1")], None, "samtools:1.3.1"),
    ([Target("samtools", "1.3.1", "py_1")], None, "samtools:1.3.1--py_1"),
    ([Target("samtools", "1.3.1")], "0", "samtools:1.3.1"),
    ([Target("samtools", "1.3.1", "py_1")], "0", "samtools:1.3.1--py_1"),
    (
        [Target("samtools", "1.3.1"), Target("bwa", "0.7.13")],
        None,
        "mulled-v2-fe8faa35dbf6dc65a0f7f5d4ea12e31a79f73e40:4d0535c94ef45be8459f429561f0894c3fe0ebcf",
    ),
    (
        [Target("samtools", "1.3.1"), Target("bwa")],
        None,
        "mulled-v2-fe8faa35dbf6dc65a0f7f5d4ea12e31a79f73e40:b0c847e4fb89c343b04036e33b2daa19c4152cf5",
    ),
    (
        [Target("samtools"), Target("bwa")],
        None,
        "mulled-v2-fe8faa35dbf6dc65a0f7f5d4ea12e31a79f73e40",
    ),
    (
        [Target("samtools", "1.3.1", "h9071d68_10"), Target("bedtools", "2.26.0", "0")],
        None,
        "mulled-v2-8186960447c5cb2faa697666dc1e6d919ad23f3e:a6419f25efff953fc505dbd5ee734856180bb619",
    ),
]

# Confirmed against quay.io/v2/biocontainers/... on 2026-07-28.
LIVE_VERIFIED = [
    (
        [Target("bamtools", "2.5.2"), Target("samtools", "1.16.1")],
        "0",
        "mulled-v2-0560a8046fc82aa4338588eca29ff18edab2c5aa:b99cea629ebb7008000f322a53ee051ee7fee74a-0",
    ),
    ([Target("samtools", "1.17", "hd87286a_2")], None, "samtools:1.17--hd87286a_2"),
]


@pytest.mark.parametrize("targets,image_build,expected", UPSTREAM_DOCTEST_VECTORS + LIVE_VERIFIED)
def test_image_name(targets, image_build, expected):
    assert v2_image_name(targets, image_build=image_build) == expected


def test_order_does_not_matter():
    a = v2_image_name([Target("samtools", "1.3.1"), Target("bwa", "0.7.13")])
    b = v2_image_name([Target("bwa", "0.7.13"), Target("samtools", "1.3.1")])
    assert a == b


def test_repo_hash_is_names_only():
    """Same packages, different versions -> same repository, different tag. This is why an
    L2 manifest and its L3 neighbour share a repo name and differ only after the colon."""
    l2 = v2_image_name([Target("bamtools", "2.5.2"), Target("samtools", "1.17")])
    l3 = v2_image_name([Target("bamtools", "2.5.2"), Target("samtools", "1.16.1")])
    assert l2.split(":")[0] == l3.split(":")[0]
    assert l2.split(":")[1] != l3.split(":")[1]
