export type AppErrorKind = 'Network' | 'Timeout' | 'HTTP' | 'Parse' | 'Unknown';

export interface AppError {
  kind: AppErrorKind;
  status?: number;
  message: string;
  hint?: string;
}

export function createAppError(
  kind: AppErrorKind,
  message: string,
  options: { status?: number; hint?: string } = {},
): AppError {
  return {
    kind,
    message,
    status: options.status,
    hint: options.hint,
  };
}

export function asAppError(error: unknown): AppError {
  if (isAppError(error)) {
    return error;
  }

  return createAppError('Unknown', 'Something went wrong. Please try again.', {
    hint: 'If the issue persists, contact support.',
  });
}

export function isAppError(error: unknown): error is AppError {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as Partial<AppError>;
  return typeof candidate.kind === 'string' && typeof candidate.message === 'string';
}

export function toUserMessage(error: unknown): string {
  return asAppError(error).message;
}

export function isRetryable(error: unknown): boolean {
  const appError = asAppError(error);

  if (appError.kind === 'Network' || appError.kind === 'Timeout') {
    return true;
  }

  return appError.kind === 'HTTP' && Boolean(appError.status && appError.status >= 500);
}
