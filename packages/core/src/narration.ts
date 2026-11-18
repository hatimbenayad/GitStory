import type { Chapter, Highlight, NarrationProvider, NarrationSegment } from './types.js';

/**
 * Local deterministic documentary narration generator (`FR-28`).
 * Requires zero API keys and makes zero network requests. Disabled by default in the UI.
 */
export class TemplateNarrationProvider implements NarrationProvider {
  readonly name = 'local-template';

  async generate(input: {
    repoName: string;
    chapters: Chapter[];
    highlights: Highlight[];
  }): Promise<NarrationSegment[]> {
    const segments: NarrationSegment[] = [];
    const coveredIndices = new Set<number>();

    for (const ch of input.chapters) {
      coveredIndices.add(ch.eventIndex);
      const dateStr = ch.t > 0 ? new Date(ch.t * 1000).toISOString().slice(0, 10) : 'this milestone';
      segments.push({
        eventIndex: ch.eventIndex,
        t: ch.t,
        title: `Chapter: ${ch.name}`,
        text: `${input.repoName} reaches ${ch.name} on ${dateStr}, marking a new chapter in the project.`,
      });
    }

    for (const hl of input.highlights) {
      if (coveredIndices.has(hl.eventIndex)) continue;
      coveredIndices.add(hl.eventIndex);
      segments.push({
        eventIndex: hl.eventIndex,
        t: hl.t,
        title: hl.title,
        text: `${hl.detail}.`,
      });
    }

    segments.sort((a, b) => a.eventIndex - b.eventIndex);
    return segments;
  }
}
