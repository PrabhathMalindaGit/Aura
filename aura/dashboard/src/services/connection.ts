import { createAppError } from '../utils/errors';
import {
  getSnapshot,
  markError,
  markSuccess,
  useConnectionStatus,
  type ConnectionSnapshot,
} from './connectionStore';

export type { ConnectionSnapshot };

export function getConnectionSnapshot(): ConnectionSnapshot {
  return getSnapshot();
}

export function markRequestSuccess(timestamp: number = Date.now()): void {
  markSuccess(undefined, timestamp);
}

export function markRequestError(timestamp: number = Date.now()): void {
  markError(undefined, createAppError('Unknown', 'Unexpected error.'), timestamp);
}

export { useConnectionStatus };
