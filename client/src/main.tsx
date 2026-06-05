import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { VoltClerkProvider } from '@/lib/clerk';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <VoltClerkProvider>
      <App />
    </VoltClerkProvider>
  </StrictMode>,
);
