import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from './app/routes';
import { asAppError, isRetryable } from './utils/errors';
import { initTheme } from './services/theme';
import { initDashboardV2ThemeBridge } from './dashboard-v2/foundation/themeBridge';
import './styles/tokens.css';
import './styles/globals.css';
import './styles/system.css';
import './dashboard-v2/foundation/tokens.css';
import './dashboard-v2/foundation/styles.css';

initTheme();
initDashboardV2ThemeBridge();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => failureCount < 2 && isRetryable(asAppError(error)),
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
