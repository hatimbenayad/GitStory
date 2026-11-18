# Tasks: U2 — Git Extractor & CLI `history.json` Output

- [x] T2.1 Initialize `packages/extractor` and `apps/cli` package configs
- [x] T2.2 [P] Write failing unit tests for bot detection (`bot.test.ts`), mailmap (`mailmap.test.ts`), and streaming parser (`stream-parser.test.ts` including renames, copies, binary, spaces/quotes/unicode, chunk splitting mid-token)
- [x] T2.3 [P] Write failing integration tests using programmatically created temporary Git fixture repos (empty repo, single commit, renames, merges first-parent vs full, `.mailmap`, annotated & lightweight tags, detached HEAD, bots, binary files, weird filenames)
- [x] T2.4 Implement `bot.ts`, `mailmap.ts`, `stream-parser.ts`, and `git-extractor.ts`
- [x] T2.5 Implement `apps/cli` (`extract` and `serve` commands + bin entry) and CLI integration test
- [x] T2.6 Verify lint, typecheck, tests, build, and run CLI on GitStory repo itself
- [x] T2.7 Update `docs/progress.md`, commit Bolt U2, and push to origin
