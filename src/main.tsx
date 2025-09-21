import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/theme.scss';
import favicon from './styles/GEP_favicon.png';

const queryClient = new QueryClient();

const faviconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (faviconLink) {
  faviconLink.href = favicon;
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
