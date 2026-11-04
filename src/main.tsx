import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './design-system.css';
import App from './App.tsx';
import { AuthProvider } from './context/AuthProvider';
import { DataProvider } from './context/DataProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </DataProvider>
  </StrictMode>,
);
