# /// script
# requires-python = ">=3.11"
# dependencies = ["pytest", "pyyaml"]
# ///
"""The examples are the specification made executable. Each one is a real solve against real
channels, so these assertions are claims about the world, not about our own fixtures."""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from biopixi.grade import grade  # noqa: E402

EXAMPLES = ROOT / "examples"


@pytest.mark.parametrize(
    "name,expected",
    [
        ("l0-out-of-profile", "L0"),
        ("l1-local-recipe", "L1"),
        ("l2-published", "L2"),
        ("l3-combination", "L3"),
        ("l3-single", "L3"),
    ],
)
def test_example_levels(name, expected):
    assert grade(EXAMPLES / name).label == expected


def test_one_patch_version_separates_l2_from_l3():
    """The only difference between these two manifests is samtools 1.17 vs 1.16.1. The level
    is a fact about what BioContainers has published, not about how the manifest is written."""
    l2 = grade(EXAMPLES / "l2-published")
    l3 = grade(EXAMPLES / "l3-combination")
    assert (l2.level, l3.level) == (2, 3)
    assert l2.target == "bamtools=2.5.2,samtools=1.17"
    assert l3.target == "bamtools=2.5.2,samtools=1.16.1"


def test_adding_a_package_can_lower_the_level():
    """samtools alone is L3; samtools plus bamtools is L2. L3 is a property of the
    environment, not the minimum over its packages."""
    assert grade(EXAMPLES / "l3-single").level == 3
    assert grade(EXAMPLES / "l2-published").level == 2


def test_out_of_profile_still_reports_lints():
    g = grade(EXAMPLES / "l0-out-of-profile")
    assert g.level is None
    assert any("pypi-dependencies" in r for r in g.reasons)
    assert any("install instruction" in lint for lint in g.lints)


def test_grade_touches_no_network(monkeypatch):
    import socket

    def forbidden(*a, **k):
        raise AssertionError("grade attempted a network connection")

    monkeypatch.setattr(socket, "socket", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    for name in ("l0-out-of-profile", "l1-local-recipe", "l2-published", "l3-combination", "l3-single"):
        grade(EXAMPLES / name)
