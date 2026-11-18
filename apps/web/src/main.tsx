import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <div style={{ color: '#e2e8f0', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        GitStory Web Shell (loading U6...)
      </div>
    </StrictMode>,
  );
}
