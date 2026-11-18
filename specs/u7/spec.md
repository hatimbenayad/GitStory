# Spec: U7 — Highlight Detection, Chapters & Optional Narration

## 1. Purpose & Why
To transform a flat commit sequence into a watchable documentary, GitStory detects narrative inflection points (`FR-15`), aligns Git tags into chapters (`FR-9`), and exposes a strictly opt-in, key-free narration interface (`FR-28`).

## 2. Functional Requirements Covered
- `FR-9`: Tags mapped to timeline chapters.
- `FR-15`: Highlight detection — largest commits, first appearance of a top-level directory, contributor surges, tag/release moments, mass deletions/refactors.
- `FR-28`: Optional narration text generation from highlights and chapters via a pluggable `NarrationProvider` interface; disabled by default; zero API keys.

## 3. Detection Heuristics
- **Tag / Release (`release_tag`):** Every tag whose hash matches an event index (or nearest preceding timestamp if aggregated). Score = `1.0`.
- **First Top-Level Directory (`new_top_dir`):** First commit that introduces a new top-level directory (depth >= 1, ignoring root files). Score = `0.75`.
- **Largest Commits (`largest_commit`):** Top commits whose churn (`sum(add + del)` + `changes.length * 10`) exceeds `mean + 2.5 * stddev` (or top 5% with min threshold). Score = `0.7–0.95`.
- **Mass Deletions / Refactors (`mass_refactor`):** Commits with `>= 5` deleted or renamed files (or `del >= 200` and `del > add * 1.5`). Score = `0.85`.
- **Contributor Surge (`contributor_surge`):** Rolling 30-day window where unique active non-bot contributors jumps by `>= 2x` (min +3 new contributors) compared to the preceding window. Score = `0.8`.
- Results are deduplicated per `(eventIndex, type)`, sorted chronologically, and capped cleanly so timelines don't saturate.

## 4. Optional Narration (`FR-28`)
- `NarrationProvider` interface: `generate(input: { repoName: string; chapters: Chapter[]; highlights: Highlight[] }): Promise<NarrationSegment[]>`.
- Ships with `TemplateNarrationProvider` (deterministic local text generator, zero network calls, zero API keys).
- Disabled by default in the UI; users can toggle "Documentary Captions" on to view captions for chapters and highlights.
