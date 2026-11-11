import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles.css';

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: (n, e) => n < 2 && (e as { status?: number }).status !== 401 && (e as { status?: number }).status !== 403, refetchOnWindowFocus: true } } });
createRoot(document.getElementById('root')!).render(
  <StrictMode><QueryClientProvider client={qc}><BrowserRouter><App /></BrowserRouter></QueryClientProvider></StrictMode>,
);
