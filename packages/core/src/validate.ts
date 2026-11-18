import { normalizeRepoPath } from './sanitize.js';
import type {
  AuthorInfo,
  CommitEvent,
  FileChange,
  FileChangeType,
  History,
  TagInfo,
  ValidationError,
  ValidationResult,
} from './types.js';

const VALID_CHANGE_TYPES = new Set<string>(['A', 'M', 'D', 'R', 'C']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Validates an untrusted value against GitStory `History` schema v1.
 * Iterative and allocation-light so large histories validate rapidly.
 */
export function validateHistory(input: unknown): ValidationResult<History> {
  const errors: ValidationError[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: [{ path: '$', message: 'History root must be a JSON object' }] };
  }

  if (input.schemaVersion !== 1) {
    errors.push({
      path: 'schemaVersion',
      message: `Unsupported schemaVersion: expected 1, got ${String(input.schemaVersion)}`,
    });
  }

  // Validate repo metadata
  if (!isRecord(input.repo)) {
    errors.push({ path: 'repo', message: 'repo must be an object' });
  } else {
    if (typeof input.repo.name !== 'string' || input.repo.name.trim().length === 0) {
      errors.push({ path: 'repo.name', message: 'repo.name must be a non-empty string' });
    }
    if (typeof input.repo.head !== 'string') {
      errors.push({ path: 'repo.head', message: 'repo.head must be a string' });
    }
    if (input.repo.defaultBranch !== undefined && typeof input.repo.defaultBranch !== 'string') {
      errors.push({
        path: 'repo.defaultBranch',
        message: 'repo.defaultBranch must be a string if provided',
      });
    }
  }

  // Validate authors map
  const authorKeys = new Set<string>();
  if (!isRecord(input.authors)) {
    errors.push({ path: 'authors', message: 'authors must be an object map' });
  } else {
    for (const [key, value] of Object.entries(input.authors)) {
      authorKeys.add(key);
      if (!isRecord(value)) {
        errors.push({ path: `authors.${key}`, message: 'Author entry must be an object' });
        continue;
      }
      if (typeof value.name !== 'string') {
        errors.push({ path: `authors.${key}.name`, message: 'Author name must be a string' });
      }
      if (value.email !== undefined && typeof value.email !== 'string') {
        errors.push({
          path: `authors.${key}.email`,
          message: 'Author email must be a string if provided',
        });
      }
      if (typeof value.isBot !== 'boolean') {
        errors.push({ path: `authors.${key}.isBot`, message: 'Author isBot must be a boolean' });
      }
    }
  }

  // Validate tags
  if (!Array.isArray(input.tags)) {
    errors.push({ path: 'tags', message: 'tags must be an array' });
  } else {
    for (let i = 0; i < input.tags.length; i++) {
      const tag = input.tags[i];
      const prefix = `tags[${i}]`;
      if (!isRecord(tag)) {
        errors.push({ path: prefix, message: 'Tag entry must be an object' });
        continue;
      }
      if (typeof tag.name !== 'string' || tag.name.length === 0) {
        errors.push({ path: `${prefix}.name`, message: 'Tag name must be a non-empty string' });
      }
      if (typeof tag.hash !== 'string' || tag.hash.length === 0) {
        errors.push({ path: `${prefix}.hash`, message: 'Tag hash must be a non-empty string' });
      }
      if (!isNonNegativeInt(tag.t)) {
        errors.push({ path: `${prefix}.t`, message: 'Tag timestamp must be a non-negative integer' });
      }
    }
  }

  // Validate events
  if (!Array.isArray(input.events)) {
    errors.push({ path: 'events', message: 'events must be an array' });
  } else {
    for (let i = 0; i < input.events.length; i++) {
      const ev = input.events[i];
      const prefix = `events[${i}]`;
      if (!isRecord(ev)) {
        errors.push({ path: prefix, message: 'CommitEvent must be an object' });
        continue;
      }
      if (typeof ev.hash !== 'string' || ev.hash.length === 0) {
        errors.push({ path: `${prefix}.hash`, message: 'Event hash must be a non-empty string' });
      }
      if (!Array.isArray(ev.parents) || !ev.parents.every((p) => typeof p === 'string')) {
        errors.push({ path: `${prefix}.parents`, message: 'Event parents must be a string array' });
      }
      if (!isNonNegativeInt(ev.t)) {
        errors.push({ path: `${prefix}.t`, message: 'Event timestamp must be a non-negative integer' });
      }
      if (typeof ev.author !== 'string') {
        errors.push({ path: `${prefix}.author`, message: 'Event author must be a string' });
      } else if (authorKeys.size > 0 && !authorKeys.has(ev.author)) {
        errors.push({
          path: `${prefix}.author`,
          message: `Event author "${ev.author}" is not defined in authors map`,
        });
      }
      if (typeof ev.message !== 'string') {
        errors.push({ path: `${prefix}.message`, message: 'Event message must be a string' });
      }
      if (typeof ev.isBot !== 'boolean') {
        errors.push({ path: `${prefix}.isBot`, message: 'Event isBot must be a boolean' });
      }
      if (!Array.isArray(ev.changes)) {
        errors.push({ path: `${prefix}.changes`, message: 'Event changes must be an array' });
      } else {
        for (let j = 0; j < ev.changes.length; j++) {
          const ch = ev.changes[j];
          const chPrefix = `${prefix}.changes[${j}]`;
          if (!isRecord(ch)) {
            errors.push({ path: chPrefix, message: 'FileChange must be an object' });
            continue;
          }
          if (typeof ch.path !== 'string' || ch.path.length === 0) {
            errors.push({ path: `${chPrefix}.path`, message: 'FileChange path must be a non-empty string' });
          } else {
            try {
              normalizeRepoPath(ch.path);
            } catch (err) {
              errors.push({
                path: `${chPrefix}.path`,
                message: err instanceof Error ? err.message : 'Invalid path',
              });
            }
          }
          if (typeof ch.type !== 'string' || !VALID_CHANGE_TYPES.has(ch.type)) {
            errors.push({
              path: `${chPrefix}.type`,
              message: `FileChange type must be one of A, M, D, R, C; got "${String(ch.type)}"`,
            });
          } else if (ch.type === 'R' || ch.type === 'C') {
            if (typeof ch.from !== 'string' || ch.from.length === 0) {
              errors.push({
                path: `${chPrefix}.from`,
                message: `FileChange of type "${ch.type}" requires a non-empty "from" path`,
              });
            } else {
              try {
                normalizeRepoPath(ch.from);
              } catch (err) {
                errors.push({
                  path: `${chPrefix}.from`,
                  message: err instanceof Error ? err.message : 'Invalid from path',
                });
              }
            }
          }
          if (!isNonNegativeInt(ch.add)) {
            errors.push({
              path: `${chPrefix}.add`,
              message: 'FileChange add must be a non-negative integer',
            });
          }
          if (!isNonNegativeInt(ch.del)) {
            errors.push({
              path: `${chPrefix}.del`,
              message: 'FileChange del must be a non-negative integer',
            });
          }
        }
      }
      if (errors.length >= 50) {
        errors.push({ path: '$', message: 'Too many validation errors; stopping early' });
        break;
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const repoRaw = input.repo as Record<string, unknown>;
  const data: History = {
    schemaVersion: 1,
    repo: {
      name: repoRaw.name as string,
      head: repoRaw.head as string,
      ...(repoRaw.defaultBranch !== undefined
        ? { defaultBranch: repoRaw.defaultBranch as string }
        : {}),
    },
    authors: input.authors as Record<string, AuthorInfo>,
    tags: input.tags as TagInfo[],
    events: (input.events as CommitEvent[]).map((ev) => ({
      ...ev,
      changes: ev.changes.map(
        (ch): FileChange => ({
          path: normalizeRepoPath(ch.path),
          type: ch.type as FileChangeType,
          ...(ch.from !== undefined ? { from: normalizeRepoPath(ch.from) } : {}),
          add: ch.add,
          del: ch.del,
        }),
      ),
    })),
  };

  return { ok: true, data };
}

/**
 * Validates an untrusted input and returns a typed `History` or throws a descriptive Error.
 */
export function assertValidHistory(input: unknown): History {
  const result = validateHistory(input);
  if (!result.ok) {
    const summary = result.errors
      .slice(0, 5)
      .map((e) => `${e.path}: ${e.message}`)
      .join('; ');
    throw new Error(`Invalid GitStory history: ${summary}`);
  }
  return result.data;
}
