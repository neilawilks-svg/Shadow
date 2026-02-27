#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

PROFILE_TARGETS: list[tuple[str, str]] = [
    ("morgan-core", "Morgan"),
    ("anthony-battle", "Anthony Battle"),
    ("constantin-beier", "Constantin Beier"),
    ("dean-curtis", "Dean Curtis"),
    ("gabi-wagenhofer", "Gabi Wagenhofer"),
    ("karan-khanna", "Karan Khanna"),
    ("marco-van-den-berg", "Marco van den Berg"),
    ("sophie-bailes", "Sophie Bailes"),
    ("vivek-ganotra", "Vivek Ganotra"),
    ("dave-williams", "Dave Williams"),
    ("davi-quintiere", "Davi Quintiere"),
]

STOP_HEADINGS = [
    "Professional Snapshot",
    "Operating Context",
    "Behavioural Style in Board Settings",
    "Behavioral Style in Board Settings",
    "Stance on AI & Modernisation",
    "Stance on AI & Modernization",
    "Decision Posture",
    "Triggers for Challenge or Support",
    "Boardroom Language & Phrasing",
    "Likely Contributions in a CAB Discussion",
    "General Information",
    "Personality Overview",
    "Personality Traits",
    "General Behaviors",
    "Energizers",
    "Drainers",
    "Strengths",
    "Blind Spots",
    "Tips for interacting",
]


@dataclass
class ParsedMarkdown:
    path: Path
    front_matter: Dict[str, object]
    body: str


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def slugify(text: str) -> str:
    lowered = text.lower()
    lowered = re.sub(r"[^a-z0-9]+", "-", lowered)
    lowered = re.sub(r"-+", "-", lowered).strip("-")
    return lowered


def normalize_text(text: str) -> str:
    text = text.replace("\u2013", "-").replace("\u2014", "-")
    text = text.replace("\u2018", "'").replace("\u2019", "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    text = text.replace("\u00a0", " ")
    text = text.replace("ΓÇô", "-")
    text = text.replace("ΓÇÖ", "'")
    text = text.replace("ΓÇ£", '"')
    text = text.replace("ΓÇ¥", '"')
    text = text.replace("\u2022", "- ")
    text = text.replace("\u2219", "- ")
    text = text.replace("\f", "\n")
    text = text.replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def parse_front_matter(raw: str) -> tuple[Dict[str, object], str]:
    match = re.match(r"^---\n(.*?)\n---\n?(.*)$", raw, re.DOTALL)
    if not match:
        return {}, raw

    block = match.group(1)
    body = match.group(2)
    parsed: Dict[str, object] = {}
    current_list_key: str | None = None

    for line in block.splitlines():
        if not line.strip():
            continue

        list_match = re.match(r"^\s*-\s+(.*)$", line)
        if list_match and current_list_key:
            parsed.setdefault(current_list_key, [])
            if isinstance(parsed[current_list_key], list):
                parsed[current_list_key].append(list_match.group(1).strip())
            continue

        kv_match = re.match(r"^([a-zA-Z0-9_\-]+):\s*(.*)$", line)
        if not kv_match:
            current_list_key = None
            continue

        key = kv_match.group(1).strip()
        value = kv_match.group(2).strip()
        if value == "":
            parsed[key] = []
            current_list_key = key
            continue

        if value.lower() == "null":
            parsed[key] = None
        else:
            parsed[key] = value
        current_list_key = None

    return parsed, body


def load_markdown_file(path: Path) -> ParsedMarkdown:
    raw = normalize_text(path.read_text(encoding="utf-8", errors="ignore"))
    front_matter, body = parse_front_matter(raw)
    return ParsedMarkdown(path=path, front_matter=front_matter, body=normalize_text(body))


def pick_best_candidate(paths: Iterable[Path]) -> Path | None:
    items = sorted(set(paths))
    if not items:
        return None

    def score(path: Path) -> tuple[int, int, str]:
        name = path.name.lower()
        has_hash = 1 if re.search(r"-[0-9a-f]{8}\.md$", name) else 0
        size = path.stat().st_size if path.exists() else 0
        return (has_hash, size, name)

    return sorted(items, key=score, reverse=True)[0]


def find_person_docs(people_dir: Path, person_name: str) -> tuple[Path | None, Path | None]:
    slug = slugify(person_name)
    files = sorted(people_dir.glob("*.md"))

    exec_candidates: list[Path] = []
    disc_candidates: list[Path] = []

    for path in files:
        lower = path.name.lower()
        if slug not in lower:
            continue

        if "disc-profile" in lower:
            disc_candidates.append(path)
        if "executive-persona-profile" in lower or "executive-persona" in lower:
            exec_candidates.append(path)

    if person_name == "Morgan":
        for path in files:
            lower = path.name.lower()
            if "morgan-executive-persona" in lower or "overview-morgan-virtual-board-member" in lower:
                exec_candidates.append(path)

    return pick_best_candidate(exec_candidates), pick_best_candidate(disc_candidates)


def split_sentences(text: str) -> list[str]:
    compact = re.sub(r"\s+", " ", text).strip()
    if not compact:
        return []

    raw = re.split(r"(?<=[.!?])\s+", compact)
    return [item.strip() for item in raw if item.strip()]


def is_noisy_fragment(text: str) -> bool:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned:
        return True

    if len(cleaned) < 8:
        return True

    weird_char_ratio = len(re.findall(r"[^a-zA-Z0-9\s,.:;!?()'\"/&%-]", cleaned)) / max(1, len(cleaned))
    if weird_char_ratio > 0.12:
        return True

    alpha_chars = re.findall(r"[A-Za-z]", cleaned)
    if not alpha_chars:
        return True

    uppercase_ratio = sum(1 for ch in alpha_chars if ch.isupper()) / max(1, len(alpha_chars))
    if len(cleaned) > 24 and uppercase_ratio > 0.82:
        return True

    return False


def quality_sentences(text: str, *, max_items: int = 8, min_words: int = 5) -> list[str]:
    items: list[str] = []
    for sentence in split_sentences(text):
        compact = re.sub(r"\s+", " ", sentence).strip()
        if not compact:
            continue
        if is_noisy_fragment(compact):
            continue
        if len(compact.split()) < min_words:
            continue
        items.append(compact)
        if len(items) >= max_items:
            break
    return items


def take_sentences(text: str, max_sentences: int = 3, max_chars: int = 520) -> str:
    sentences = split_sentences(text)
    if not sentences:
        return ""

    picked: list[str] = []
    for sentence in sentences:
        candidate = " ".join(picked + [sentence]).strip()
        if len(candidate) > max_chars and picked:
            break
        picked.append(sentence)
        if len(picked) >= max_sentences:
            break

    return " ".join(picked).strip()


def section_text(body: str, heading: str) -> str:
    lines = [line.rstrip() for line in body.splitlines()]
    starts: list[int] = []
    heading_pattern = re.compile(rf"^{re.escape(heading)}\b", re.IGNORECASE)

    for index, line in enumerate(lines):
        if heading_pattern.search(line.strip()):
            starts.append(index)

    if not starts:
        return ""

    start = starts[0] + 1
    end = len(lines)

    for index in range(start, len(lines)):
        candidate = lines[index].strip()
        if not candidate:
            continue
        if any(re.match(rf"^{re.escape(marker)}\b", candidate, re.IGNORECASE) for marker in STOP_HEADINGS if marker.lower() != heading.lower()):
            end = index
            break

    return "\n".join(lines[start:end]).strip()


def read_label_value(body: str, label: str) -> str:
    match = re.search(rf"^{re.escape(label)}\s*:\s*(.+)$", body, re.MULTILINE | re.IGNORECASE)
    return match.group(1).strip() if match else ""


def read_bullets_after_heading(body: str, heading: str, limit: int = 6) -> list[str]:
    lines = [line.rstrip() for line in body.splitlines()]
    heading_index = -1
    for index, line in enumerate(lines):
        if re.match(rf"^{re.escape(heading)}\b", line.strip(), re.IGNORECASE):
            heading_index = index
            break

    if heading_index < 0:
        return []

    bullets: list[str] = []
    started = False
    for line in lines[heading_index + 1 :]:
        stripped = line.strip()
        if not stripped:
            if started and bullets:
                break
            continue

        bullet_match = re.match(r"^(?:[-*]|•)\s+(.*)$", stripped)
        if bullet_match:
            started = True
            value = bullet_match.group(1).strip()
            if value:
                bullets.append(value)
            if len(bullets) >= limit:
                break
            continue

        if started:
            break

    return bullets


def extract_lines_with_keywords(text: str, keywords: list[str], limit: int = 6) -> list[str]:
    output: list[str] = []
    for sentence in split_sentences(text):
        lowered = sentence.lower()
        if any(keyword in lowered for keyword in keywords):
            output.append(sentence)
        if len(output) >= limit:
            break
    return output


def parse_doc_id(meta: Dict[str, object]) -> str:
    value = meta.get("id")
    return str(value).strip() if value else ""


def parse_source_path(meta: Dict[str, object], fallback: Path) -> str:
    value = meta.get("source_path")
    if value:
        return str(value).strip()
    return str(fallback)


def unique_keep_order(items: list[str], limit: int = 8) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in items:
        cleaned = re.sub(r"\s+", " ", item).strip(" .")
        if not cleaned:
            continue
        if is_noisy_fragment(cleaned):
            continue
        lowered = cleaned.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        output.append(cleaned)
        if len(output) >= limit:
            break
    return output


def build_member_profile(persona_id: str, person_name: str, exec_doc: ParsedMarkdown | None, disc_doc: ParsedMarkdown | None, generated_at: str) -> Dict[str, object] | None:
    if exec_doc is None and disc_doc is None:
        return None

    executive_body = exec_doc.body if exec_doc else ""
    disc_body = disc_doc.body if disc_doc else ""

    professional_snapshot = section_text(executive_body, "Professional Snapshot")
    if not professional_snapshot:
        professional_snapshot = executive_body[:1800]

    decision_posture = section_text(executive_body, "Decision Posture")
    triggers = section_text(executive_body, "Triggers for Challenge or Support")
    boardroom_language = section_text(executive_body, "Boardroom Language & Phrasing")

    disc_type = read_label_value(disc_body, "DISC Type")
    disc_arch = read_label_value(disc_body, "DISC Archetype")

    energizers = read_bullets_after_heading(disc_body, "Energizers")
    drainers = read_bullets_after_heading(disc_body, "Drainers")
    strengths = read_bullets_after_heading(disc_body, "Strengths")
    blind_spots = read_bullets_after_heading(disc_body, "Blind Spots")
    personality_traits = read_bullets_after_heading(disc_body, "Personality Traits")

    risk_bias = "balanced"
    traits_blob = " ".join(personality_traits).lower()
    if "risk tolerant" in traits_blob:
        risk_bias = "risk_tolerant"
    elif "risk averse" in traits_blob:
        risk_bias = "risk_averse"

    decision_heuristics = unique_keep_order(
        quality_sentences(
            " ".join(
                extract_lines_with_keywords(
                    decision_posture, ["decision", "risk", "evidence", "pilot", "metrics", "governance"], limit=8
                )
                + extract_lines_with_keywords(triggers, ["data", "assumption", "alignment", "strategy", "outcome"], limit=5)
            ),
            max_items=8,
            min_words=5,
        )
    )

    support_triggers = unique_keep_order(
        quality_sentences(
            " ".join(
                extract_lines_with_keywords(triggers, ["support", "align", "backed", "analysis", "pilot", "goals"], limit=8)
            ),
            max_items=7,
            min_words=5,
        )
    )

    challenge_triggers = unique_keep_order(
        quality_sentences(
            " ".join(
                extract_lines_with_keywords(triggers, ["challenge", "lacks", "risk", "blind", "question", "misalign"], limit=8)
            ),
            max_items=7,
            min_words=5,
        )
    )

    if not decision_heuristics:
        decision_heuristics = unique_keep_order(quality_sentences(decision_posture, max_items=6, min_words=5), limit=6)
    if not support_triggers:
        support_triggers = unique_keep_order(quality_sentences(triggers, max_items=6, min_words=5), limit=6)
    if not challenge_triggers:
        challenge_triggers = unique_keep_order(quality_sentences(triggers, max_items=6, min_words=5), limit=6)

    language_use = unique_keep_order(
        [
            line.strip().strip('"')
            for line in split_sentences(boardroom_language)
            if line.strip().startswith('"') or " - " in line or "?" in line
        ]
        + extract_lines_with_keywords(boardroom_language, ["let", "how", "what", "risk", "data", "pilot"], limit=6)
    )

    if not language_use:
        language_use = unique_keep_order(quality_sentences(boardroom_language, max_items=6)[:6], limit=6)
    if not language_use:
        language_use = unique_keep_order(quality_sentences(executive_body, max_items=4, min_words=6), limit=4)

    language_avoid = unique_keep_order(
        [
            "Avoid generic or boilerplate phrasing that could apply to any board member.",
            "Avoid repeating previous speaker wording unless explicitly challenging or endorsing it.",
            "Avoid vague recommendations without owner, timeline, and checkpoint.",
        ]
        + [f"Avoid communication drainers: {item}." for item in drainers[:3]],
        limit=8,
    )

    executive_summary = take_sentences(professional_snapshot, max_sentences=3, max_chars=540)
    if not executive_summary:
        executive_summary = " ".join(quality_sentences(executive_body, max_items=3, min_words=6))[:540]

    core_motivations = unique_keep_order(
        energizers
        + quality_sentences(
            " ".join(
                extract_lines_with_keywords(
                    executive_body, ["value", "outcome", "trust", "innovation", "efficiency", "customer"], limit=8
                )
            ),
            max_items=6,
            min_words=5,
        ),
        limit=8,
    )

    source_doc_ids = unique_keep_order(
        [parse_doc_id(exec_doc.front_matter) if exec_doc else "", parse_doc_id(disc_doc.front_matter) if disc_doc else ""],
        limit=4,
    )
    source_paths = unique_keep_order(
        [parse_source_path(exec_doc.front_matter, exec_doc.path) if exec_doc else "", parse_source_path(disc_doc.front_matter, disc_doc.path) if disc_doc else ""],
        limit=4,
    )

    profile = {
        "personaId": persona_id,
        "name": person_name,
        "executiveSummary": executive_summary,
        "coreMotivations": core_motivations,
        "decisionHeuristics": decision_heuristics,
        "supportTriggers": support_triggers,
        "challengeTriggers": challenge_triggers,
        "riskBias": risk_bias,
        "discType": disc_type,
        "discArchetype": disc_arch,
        "energizers": unique_keep_order(energizers, limit=8),
        "drainers": unique_keep_order(drainers, limit=8),
        "strengths": unique_keep_order(strengths, limit=8),
        "blindSpots": unique_keep_order(blind_spots, limit=8),
        "languagePatternsToUse": language_use,
        "languagePatternsToAvoid": language_avoid,
        "sourceDocIds": source_doc_ids,
        "sourcePaths": source_paths,
        "generatedAt": generated_at,
    }

    return profile


def build_profiles(vault_dir: Path, output_path: Path, force: bool = False) -> Dict[str, object]:
    if output_path.exists() and not force:
        return json.loads(output_path.read_text(encoding="utf-8"))

    people_dir = vault_dir / "people"
    generated_at = now_iso()

    profiles: list[dict[str, object]] = []
    if people_dir.exists():
        for persona_id, person_name in PROFILE_TARGETS:
            exec_path, disc_path = find_person_docs(people_dir, person_name)
            exec_doc = load_markdown_file(exec_path) if exec_path else None
            disc_doc = load_markdown_file(disc_path) if disc_path else None
            profile = build_member_profile(persona_id, person_name, exec_doc, disc_doc, generated_at)
            if profile:
                profiles.append(profile)

    profiles.sort(key=lambda item: str(item.get("personaId", "")))
    payload: Dict[str, object] = {
        "generatedAt": generated_at,
        "profiles": profiles,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build deterministic board-member agent profiles from local vault docs")
    parser.add_argument("--vault-dir", type=Path, default=Path("local/board-vault"))
    parser.add_argument("--output", type=Path, default=Path("local/board-vault/agent-profiles.json"))
    parser.add_argument("--force", action="store_true")

    args = parser.parse_args()
    payload = build_profiles(vault_dir=args.vault_dir, output_path=args.output, force=args.force)
    print(json.dumps({"generatedAt": payload.get("generatedAt"), "count": len(payload.get("profiles", []))}, indent=2))


if __name__ == "__main__":
    main()
