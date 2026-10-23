import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { ApiClient } from './api/client';
import { createEventStream } from './api/events';
import { Chat } from './components/Chat';
import { Home } from './components/Home';
import { VoiceMode } from './components/VoiceMode';
import { StoreContext } from './conversation/context';
import { ConversationStore } from './conversation/store';
import { createMockBackend } from './mock/backend';
import { MockVoiceClient } from './voice/mockVoice';
import { RealtimeVoiceClient } from './voice/realtimeVoice';
import type { VoiceClient } from './voice/types';

function createServices() {
  const mock = import.meta.env.VITE_API_MOCK === '1';
  if (mock) {
    const backend = createMockBackend();
    return { mock, api: new ApiClient(backend.fetch), openEvents: backend.openEvents };
  }
  const baseUrl = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
  return { mock, api: new ApiClient(undefined, baseUrl), openEvents: createEventStream(baseUrl) };
}

function createVoice(mock: boolean, api: ApiClient, store: ConversationStore): VoiceClient {
  if (mock) {
    return new MockVoiceClient(api, {
      send: store.send,
      lastAssistantText: () => store.lastAssistant()?.text,
      nextUtterance: () => store.demoUtterance(),
    });
  }
  return new RealtimeVoiceClient(api, {
    runTool: store.voiceTool,
    userSaid: store.voiceUserSaid,
    assistantSaid: store.voiceAssistantSaid,
    onLoginDone: store.onLoginDone,
  });
}

export function App() {
  const { store, voice } = useMemo(() => {
    const { mock, api, openEvents } = createServices();
    const store = new ConversationStore(api, openEvents);
    return { store, voice: createVoice(mock, api, store) };
  }, []);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceUnavailable, setVoiceUnavailable] = useState(false);
  const markVoiceUnavailable = useCallback(() => setVoiceUnavailable(true), []);

  const openVoice = useCallback(() => {
    if (!voiceUnavailable) setVoiceOpen(true);
  }, [voiceUnavailable]);
  const closeVoice = useCallback(() => setVoiceOpen(false), []);
  const end = useCallback(() => {
    setVoiceOpen(false);
    void store.reset();
  }, [store]);

  return (
    <StoreContext.Provider value={store}>
      <div className="page">
        <div className="frame">
          {voiceOpen ? (
            <VoiceMode voice={voice} onExit={closeVoice} onEnd={end} onUnavailable={markVoiceUnavailable} />
          ) : state.items.length === 0 ? (
            <Home onSend={store.send} onMic={openVoice} micDisabled={voiceUnavailable} />
          ) : (
            <Chat state={state} onMic={openVoice} onEnd={end} micDisabled={voiceUnavailable} />
          )}
        </div>
      </div>
    </StoreContext.Provider>
  );
}
