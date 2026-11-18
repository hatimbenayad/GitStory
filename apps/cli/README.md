# `gitstory` CLI

Local-first CLI for **GitStory** — turns any local Git repository into a portable `history.json` documentary or serves the interactive player on `localhost` without uploading your code.

## Usage

```bash
# Extract history.json from a local repository
npx gitstory /path/to/repo -o history.json

# Include full branch history instead of mainline first-parent
npx gitstory /path/to/repo --full-history -o history.json

# Launch the interactive web player preloaded on localhost
npx gitstory serve /path/to/repo --port 4173

# Compare module dependency architecture between two tags or commits
npx gitstory arch /path/to/repo v0.1.0 v1.0.0 -o arch-diff.json
```
