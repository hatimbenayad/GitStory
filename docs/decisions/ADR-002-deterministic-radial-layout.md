# ADR-002: Deterministic Stable File-Tree Layout

- **Status:** Accepted
- **Date:** 2026-11-18
- **Related:** `FR-16`, `FR-22`, Unit `U5`

## Context
A naive force-directed graph re-runs layout from scratch whenever files are added or removed, causing existing nodes to jump violently between commits and making the documentary disorienting to watch.

## Decision
Use a **deterministic angular-sector radial tree** powered by `d3-hierarchy` combined with persistent hash-seeded angular slots per directory:
- Every directory path hashes deterministically to a stable angular offset and depth radius.
- When new sibling files or subdirectories appear, they receive reserved angular slots within their parent's sector while previously placed nodes retain their smoothed anchor coordinates (exponentially damped interpolation only when density rebalancing is required).
- Renames (`type: 'R'`) preserve the node's visual entity ID and smoothly interpolate `(x, y)` from the old directory anchor to the new directory anchor.
- When `reducedMotion` is enabled, transitions snap cleanly without particle bursts or camera shake.

## Consequences
- Unchanged nodes stay rock-steady across frames (`FR-22`), easily testable via coordinate-delta assertions.
- Scales to 20,000 nodes at 60 fps in PixiJS WebGL because per-frame layout updates are O(changed nodes) rather than O(N^2) force ticks.
