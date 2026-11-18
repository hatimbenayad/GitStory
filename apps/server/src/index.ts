import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { DiskHistoryCache, defaultCacheDir } from './cache.js';

const port = Number.parseInt(process.env.PORT ?? '8787', 10);
const cacheDir = process.env.CACHE_DIR ?? defaultCacheDir();
const corsOrigin = process.env.CORS_ORIGIN ?? '*';

const app = createApp({
  cache: new DiskHistoryCache(cacheDir),
  corsOrigin,
});

serve({ fetch: app.fetch, port }, (info) => {
  process.stdout.write(
    `GitStory optional backend listening on http://127.0.0.1:${info.port} (cache: ${cacheDir})\n`,
  );
});
