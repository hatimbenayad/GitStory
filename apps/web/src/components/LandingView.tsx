import { useRef, useState, type DragEvent } from 'react';
import { createSampleHistory } from '../lib/sampleHistory.js';
import { useStoryStore } from '../store/useStoryStore.js';

function isLocalFolderSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
  );
}

export interface LandingViewProps {
  onLoadRawJson: (raw: unknown, meta?: { sharedRepoId?: string | null }) => void | Promise<void>;
  onLoadGitHubUrl?: (url: string, apiBase: string) => Promise<void>;
}

export function LandingView({ onLoadRawJson, onLoadGitHubUrl }: LandingViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [githubUrl, setGithubUrl] = useState('');
  const [apiBase, setApiBase] = useState(
    () => (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '',
  );
  const { error, loading, loadingMessage, setError, setLoading } = useStoryStore();
  const folderSupported = isLocalFolderSupported();

  const handleFile = async (file: File): Promise<void> => {
    setError(null);
    setLoading(true, `Reading ${file.name}...`);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      await onLoadRawJson(parsed);
    } catch (err) {
      setError(
        `Could not load "${file.name}": ${err instanceof Error ? err.message : 'Invalid JSON'}`,
      );
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      void handleFile(file);
    }
  };

  const handleLocalFolder = async (): Promise<void> => {
    setError(null);
    setLoading(true, 'Reading local Git repository (stays 100% in your browser)...');
    try {
      const { loadHistoryFromLocalFolder } = await import('../lib/localFolderLoader.js');
      const history = await loadHistoryFromLocalFolder();
      await onLoadRawJson(history);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('abort')) {
        setLoading(false);
        return;
      }
      setError(`Local folder error: ${msg}`);
    }
  };

  const handleSample = (): void => {
    setError(null);
    void onLoadRawJson(createSampleHistory());
  };

  const handleGitHubSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!onLoadGitHubUrl) return;
    if (!apiBase.trim()) {
      setError(
        'GitHub URL cloning requires the optional GitStory backend (apps/server). Start it locally or use `npx gitstory <path>` for 100% offline analysis.',
      );
      return;
    }
    await onLoadGitHubUrl(githubUrl.trim(), apiBase.trim());
  };

  return (
    <main className="landing">
      <div className="landing-card">
        <div className="brand-row">
          <div className="brand-badge" aria-hidden="true">
            GS
          </div>
          <h1>GitStory</h1>
        </div>
        <p className="landing-subtitle">
          Paste a repo, press play, watch how a project was built. Local-first &amp; private.
        </p>

        <div
          className={`dropzone ${dragging ? 'dragging' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Drop a history.json file or press Enter to browse"
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <p className="dropzone-title">Drop history.json here</p>
          <p className="dropzone-hint">
            Generated locally with <code>npx gitstory &lt;path&gt;</code> — zero uploads.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading}
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
          >
            {loading ? loadingMessage || 'Loading...' : 'Choose history.json'}
          </button>
          <input
            ref={fileInputRef}
            data-testid="history-file-input"
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
        </div>

        <div className="action-grid">
          <div className="action-panel">
            <h3>Try Built-in Sample</h3>
            <p>Explore a multi-release project with renames, refactors, contributors &amp; bots.</p>
            <button
              type="button"
              className="btn"
              data-testid="load-sample-btn"
              disabled={loading}
              onClick={handleSample}
            >
              Watch Sample Story
            </button>
          </div>

          <div className="action-panel">
            <h3>Open Local Folder</h3>
            <p>
              {folderSupported
                ? 'Read a local .git folder directly in your browser via File System Access API.'
                : 'File System Access API is not supported in this browser. Run `npx gitstory <path>` and drop history.json above.'}
            </p>
            <button
              type="button"
              className="btn"
              disabled={!folderSupported || loading}
              onClick={() => void handleLocalFolder()}
            >
              {folderSupported ? 'Select Local Repo Folder' : 'Unsupported in This Browser'}
            </button>
          </div>
        </div>

        <form className="action-panel" style={{ marginTop: '0.75rem' }} onSubmit={handleGitHubSubmit}>
          <h3>Public GitHub URL (Opt-in Optional Backend)</h3>
          <p>
            Requires running the optional <code>apps/server</code> service (read-only blobless
            clone). Leave blank to stay 100% offline.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="url"
              className="text-input"
              style={{ flex: '2 1 220px' }}
              placeholder="https://github.com/owner/repo"
              aria-label="Public GitHub repository URL"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
            />
            <input
              type="url"
              className="text-input"
              style={{ flex: '1 1 160px' }}
              placeholder="Backend URL (e.g. http://localhost:8787)"
              aria-label="Optional backend API URL"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
            />
            <button type="submit" className="btn" disabled={loading || !githubUrl.trim()}>
              Clone &amp; Watch
            </button>
          </div>
        </form>

        <div className="cli-snippet">
          <code>npx gitstory ./my-repo --serve</code>
          <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>CLI local-first mode</span>
        </div>

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}

        <p className="privacy-note">
          Local repositories are never uploaded. No accounts, no tracking, no telemetry.
        </p>
      </div>
    </main>
  );
}
