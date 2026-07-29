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
        ("l3-ecosystem-ready", "L3"),
        ("l4-combination", "L4"),
        ("l4-single", "L4"),
    ],
)
def test_example_levels(name, expected):
    assert grade(EXAMPLES / name).label == expected


def test_one_patch_version_separates_l3_from_l4():
    """The only difference between these two manifests is samtools 1.17 vs 1.16.1. The level
    is a fact about what BioContainers has published, not about how the manifest is written."""
    l3 = grade(EXAMPLES / "l3-ecosystem-ready")
    l4 = grade(EXAMPLES / "l4-combination")
    assert (l3.level, l4.level) == (3, 4)
    assert l3.target == "bamtools=2.5.2,samtools=1.17"
    assert l4.target == "bamtools=2.5.2,samtools=1.16.1"


def test_adding_a_package_can_lower_the_level():
    """samtools alone is L4; samtools plus bamtools is L3. L4 is a property of the
    assembled environment, not the minimum over its packages."""
    assert grade(EXAMPLES / "l4-single").level == 4
    assert grade(EXAMPLES / "l3-ecosystem-ready").level == 3


def test_out_of_profile_still_reports_lints():
    g = grade(EXAMPLES / "l0-out-of-profile")
    assert g.level is None
    assert any("pypi-dependencies" in r for r in g.reasons)
    assert any("install instruction" in lint for lint in g.lints)


def test_public_noncommunity_channel_is_l2(tmp_path):
    """L2 is public distribution without conda-forge/Bioconda community maintenance."""
    (tmp_path / "pixi.toml").write_text(
        """
[workspace]
channels = ["https://conda.anaconda.org/project"]
platforms = ["linux-64"]

[dependencies]
custom-tool = "==1.0"
""".lstrip()
    )
    (tmp_path / "pixi.lock").write_text(
        """
environments:
  default:
    packages:
      linux-64:
        - conda: https://conda.anaconda.org/project/linux-64/custom-tool-1.0-0.conda
""".lstrip()
    )

    g = grade(tmp_path)
    assert g.label == "L2"
    assert g.target == "custom-tool=1.0"
    assert any("non-community channels: project" in reason for reason in g.reasons)


def test_registered_custom_channel_container_cannot_skip_l3(tmp_path):
    """The historical OME combination is in hash.tsv, but L4 strictly requires L3 first."""
    (tmp_path / "pixi.toml").write_text(
        """
[workspace]
channels = ["conda-forge", "https://conda.anaconda.org/ome"]
platforms = ["linux-64"]

[dependencies]
openjdk = "*"
bioformats2raw = { version = "==0.7.0", channel = "ome" }
""".lstrip()
    )
    (tmp_path / "pixi.lock").write_text(
        """
environments:
  default:
    packages:
      linux-64:
        - conda: https://conda.anaconda.org/conda-forge/linux-64/openjdk-17.0.3-h1e1ecb3_1.tar.bz2
        - conda: https://conda.anaconda.org/ome/linux-64/bioformats2raw-0.7.0-0.tar.bz2
""".lstrip()
    )

    g = grade(tmp_path)
    assert g.label == "L2"
    assert g.target == "bioformats2raw=0.7.0,openjdk=17.0.3"
    assert any("non-community channels: ome" in reason for reason in g.reasons)
    assert g.evidence is None


def test_grade_touches_no_network(monkeypatch):
    import socket

    def forbidden(*a, **k):
        raise AssertionError("grade attempted a network connection")

    monkeypatch.setattr(socket, "socket", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)
    for name in (
        "l0-out-of-profile",
        "l1-local-recipe",
        "l3-ecosystem-ready",
        "l4-combination",
        "l4-single",
    ):
        grade(EXAMPLES / name)
