/**
 * Canonical JSON Schema (Draft 2020-12) for GitStory `history.json` v1.
 */
export const HISTORY_JSON_SCHEMA_V1 = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://gitstory.dev/schemas/history.v1.schema.json',
  title: 'GitStory History v1',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'repo', 'authors', 'tags', 'events'],
  properties: {
    schemaVersion: {
      const: 1,
      description: 'History document schema version.',
    },
    repo: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'head'],
      properties: {
        name: { type: 'string', minLength: 1 },
        head: { type: 'string' },
        defaultBranch: { type: 'string' },
      },
    },
    authors: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'isBot'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string' },
          isBot: { type: 'boolean' },
        },
      },
    },
    tags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'hash', 't'],
        properties: {
          name: { type: 'string', minLength: 1 },
          hash: { type: 'string', minLength: 1 },
          t: { type: 'integer', minimum: 0 },
        },
      },
    },
    events: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['hash', 'parents', 't', 'author', 'message', 'isBot', 'changes'],
        properties: {
          hash: { type: 'string', minLength: 1 },
          parents: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          t: { type: 'integer', minimum: 0 },
          author: { type: 'string' },
          message: { type: 'string' },
          isBot: { type: 'boolean' },
          changes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['path', 'type', 'add', 'del'],
              properties: {
                path: { type: 'string', minLength: 1 },
                type: { enum: ['A', 'M', 'D', 'R', 'C'] },
                from: { type: 'string', minLength: 1 },
                add: { type: 'integer', minimum: 0 },
                del: { type: 'integer', minimum: 0 },
              },
            },
          },
        },
      },
    },
  },
} as const;
