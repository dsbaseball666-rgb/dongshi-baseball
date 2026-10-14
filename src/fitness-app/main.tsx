import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DemoStoreProvider } from '../store/DemoStore';
import FitnessApp from './FitnessApp';
import '../styles.css';
import './fitness-app.css';

// 體能檢測系統的入口（fitness.html）。和冒險筆記本共用登入與資料，但是是獨立的網頁。
// 分頁用網址最後的 #overview、#batch… 記住，重新整理後還在同一個分頁。
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoStoreProvider>
      <FitnessApp />
    </DemoStoreProvider>
  </StrictMode>,
);
