import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { DemoStoreProvider } from './store/DemoStore';
import App from './App';
import './styles.css';

// 使用 HashRouter，部署到 GitHub Pages 等靜態網站時重新整理頁面不會 404
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <DemoStoreProvider>
        <App />
      </DemoStoreProvider>
    </HashRouter>
  </StrictMode>,
);
