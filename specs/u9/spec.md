# Spec: U9 — Contributor View & Streamgraph

## 1. Purpose & Why
Software is built by people. The Contributor view (`FR-18`) shows who is touching which parts of the codebase at any moment alongside a timeline streamgraph of team activity, with bot dimming/hiding (`FR-8`).

## 2. Functional Requirements Covered
- `FR-18`: Contributor avatars/markers moving toward files they touch + synchronized streamgraph of activity per contributor.
- `FR-8`: Dim or hide bot contributors.
- Accessibility: Colorblind-safe palette option for contributor colors.

## 3. Data Contracts & Behavior
- `computeContributorStream(history: History, options?: { bucketCount?: number; topN?: number; hideBots?: boolean }): ContributorStreamData` in `@gitstory/layout`.
  - Aggregates commit counts per author across evenly spaced time/event buckets.
  - Groups long-tail contributors beyond `topN` (default 10) into `"Other"`.
  - Computes silhouette-centered stacked streamgraph bands (`y0`, `y1`) per series per bucket.
- `ContributorView` in `apps/web`:
  - Top panel: Active file tree canvas with glowing contributor avatar discs (initials + deterministic color) gravitating toward the centroid of files they touched in recent commits, connected by subtle beams.
  - Bottom panel: Interactive synchronized streamgraph with vertical playhead cursor (clickable to scrub) and legend showing commits & bot indicators.
