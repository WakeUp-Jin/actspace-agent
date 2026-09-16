import { createContext, useContext } from 'react';
import type { SessionListPage, SessionListPageInput } from '@actspace/shared';
export type SessionBrowseState = {
  groups: SessionListPage['groups'];
  listLoading: boolean;
  listError: string | null;
  retryList: () => void;
  loadMore: (input: SessionListPageInput) => Promise<void>;
  messageLoading: boolean;
  messageError: string | null;
  retryMessages: () => void;
  hasEarlier: boolean;
  earlierLoading: boolean;
  earlierError: string | null;
  loadEarlier: () => Promise<void>;
};
export const SessionBrowseContext = createContext<SessionBrowseState | null>(null);
export const useSessionBrowse = () => useContext(SessionBrowseContext);
