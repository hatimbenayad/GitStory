export * from './types.js';
export { HISTORY_JSON_SCHEMA_V1 } from './schema.js';
export {
  escapeHtml,
  getFileExtension,
  getParentDir,
  getTopLevelDir,
  normalizeRepoPath,
  stripControlChars,
} from './sanitize.js';
export { assertValidHistory, validateHistory } from './validate.js';
export {
  ReplayEngine,
  applyCommitEvent,
  cloneState,
  createEmptyState,
  type DirNode,
  type FileNode,
  type ReplayEngineOptions,
  type RepoState,
} from './replay.js';
export { buildChapters, detectHighlights } from './highlights.js';
export { TemplateNarrationProvider } from './narration.js';
