import { createContext, useContext } from 'react';
import type { ConversationStore } from './store';

export const StoreContext = createContext<ConversationStore | null>(null);

export function useStore(): ConversationStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext missing');
  return store;
}
