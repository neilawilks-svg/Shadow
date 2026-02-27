from __future__ import annotations

import json
from pathlib import Path

from build_member_agent_profiles import build_profiles


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def test_build_profiles_fuses_exec_and_disc_docs(tmp_path: Path) -> None:
    vault_dir = tmp_path / "local" / "board-vault"
    people_dir = vault_dir / "people"
    output = vault_dir / "agent-profiles.json"

    _write(
        people_dir / "anthony-battle-executive-persona-profile-aaaa1111.md",
        """---
id: anthony-exec
source_path: /tmp/anthony-exec.pdf
---
Professional Snapshot
Anthony leads enterprise transformation with practical execution discipline.

Decision Posture
He requires evidence before full rollout and asks for measurable outcomes.

Triggers for Challenge or Support
When He Supports: ideas aligned to strategy and data.
When He Challenges: weak ownership or unclear downside controls.

Boardroom Language & Phrasing
\"What evidence supports this recommendation?\"
\"Who owns this decision checkpoint?\"
""",
    )

    _write(
        people_dir / "disc-profile-anthony-battle-bbbb2222.md",
        """---
id: anthony-disc
source_path: /tmp/anthony-disc.docx
---
DISC Type: Dc
DISC Archetype: Architect

Energizers
- Achieving goals
- Speed & efficiency

Drainers
- Long conversations with an unclear objective

Strengths
- Working independently

Blind Spots
- May share opinions too bluntly
""",
    )

    payload = build_profiles(vault_dir=vault_dir, output_path=output, force=True)

    assert output.exists()
    assert payload["profiles"]
    anthony = next(item for item in payload["profiles"] if item["personaId"] == "anthony-battle")

    assert anthony["discType"] == "Dc"
    assert anthony["discArchetype"] == "Architect"
    assert "Achieving goals" in anthony["coreMotivations"]
    assert anthony["sourceDocIds"] == ["anthony-exec", "anthony-disc"]
    assert "/tmp/anthony-exec.pdf" in anthony["sourcePaths"]
    assert "/tmp/anthony-disc.docx" in anthony["sourcePaths"]


def test_build_profiles_is_stable_without_force(tmp_path: Path) -> None:
    vault_dir = tmp_path / "local" / "board-vault"
    people_dir = vault_dir / "people"
    output = vault_dir / "agent-profiles.json"

    _write(
        people_dir / "disc-profile-constantin-beier-cccc3333.md",
        """---
id: c-disc
source_path: /tmp/c-disc.docx
---
DISC Type: D
DISC Archetype: Captain
Energizers
- Producing results
""",
    )

    first = build_profiles(vault_dir=vault_dir, output_path=output, force=True)
    _write(
        people_dir / "disc-profile-constantin-beier-dddd4444.md",
        """---
id: c-disc-2
source_path: /tmp/c-disc-2.docx
---
DISC Type: D
DISC Archetype: Captain
Energizers
- New value should be ignored without force
""",
    )

    second = build_profiles(vault_dir=vault_dir, output_path=output, force=False)
    assert second["generatedAt"] == first["generatedAt"]

    loaded = json.loads(output.read_text(encoding="utf-8"))
    assert loaded["generatedAt"] == first["generatedAt"]
