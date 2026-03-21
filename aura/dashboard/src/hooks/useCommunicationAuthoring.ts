import { useSyncExternalStore } from 'react';
import {
  getCommunicationAuthoring,
  subscribeCommunicationAuthoring,
  type CommunicationAuthoringSnapshot,
} from '../services/communicationAuthoring';

export function useCommunicationAuthoring(): CommunicationAuthoringSnapshot {
  return useSyncExternalStore(
    subscribeCommunicationAuthoring,
    getCommunicationAuthoring,
    getCommunicationAuthoring,
  );
}
