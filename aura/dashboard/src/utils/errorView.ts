import { asAppError } from './errors';

type ErrorPanelVariant = 'error' | 'info' | 'warning';

export interface ErrorViewModel {
  variant: ErrorPanelVariant;
  title: string;
  description: string;
}

export function toErrorView(error: unknown): ErrorViewModel {
  const appError = asAppError(error);

  if (appError.kind === 'Network') {
    return {
      variant: 'info',
      title: 'You appear offline',
      description: 'We could not reach the service. Check your connection and retry.',
    };
  }

  if (appError.kind === 'Timeout') {
    return {
      variant: 'warning',
      title: 'Request timed out',
      description: 'The service took too long to respond. Please retry.',
    };
  }

  if (appError.kind === 'HTTP' && appError.status === 404) {
    return {
      variant: 'info',
      title: 'Endpoint not available yet',
      description: 'The requested endpoint is not implemented on the backend.',
    };
  }

  if (appError.kind === 'HTTP' && appError.status && appError.status >= 500) {
    return {
      variant: 'error',
      title: 'Service unavailable',
      description: 'The backend is temporarily unavailable. Please retry shortly.',
    };
  }

  if (appError.kind === 'Parse') {
    return {
      variant: 'error',
      title: 'Unexpected server response',
      description: 'The service returned an unreadable response. Please retry.',
    };
  }

  return {
    variant: 'error',
    title: 'Unable to complete request',
    description: 'Something went wrong while loading data. Please retry.',
  };
}
