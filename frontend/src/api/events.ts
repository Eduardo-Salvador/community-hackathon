import { isStepEvent, type StepEvent } from './types';
import type { Credentials } from './client';

export type EventStream = { ready: Promise<void>; close: () => void };
export type OpenEventStream = (credentials: Credentials, onEvent: (event: StepEvent) => void) => EventStream;

const MAX_RETRIES = 5;

export function socketUrl(baseUrl: string, current: Location = location): string {
  if (baseUrl) return `${baseUrl.replace(/^http/, 'ws')}/ws`;
  return `${current.protocol === 'https:' ? 'wss' : 'ws'}://${current.host}/ws`;
}

export const createEventStream = (baseUrl = ''): OpenEventStream => (credentials, onEvent) => {
  let socket: WebSocket | undefined;
  let closed = false;
  let retries = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let markReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  const connect = () => {
    socket = new WebSocket(socketUrl(baseUrl));
    socket.addEventListener('open', () => {
      socket?.send(JSON.stringify({ type: 'auth', sessionId: credentials.id, token: credentials.token }));
    });
    socket.addEventListener('message', (message) => {
      let payload: unknown;
      try {
        payload = JSON.parse(String(message.data));
      } catch {
        return;
      }
      if ((payload as { type?: string }).type === 'ready') {
        retries = 0;
        markReady();
        return;
      }
      if (isStepEvent(payload)) onEvent(payload);
    });
    socket.addEventListener('close', (event) => {
      if (closed || event.code === 4401 || event.code === 4400 || retries >= MAX_RETRIES) return;
      retries += 1;
      timer = setTimeout(connect, 500 * 2 ** retries);
    });
  };

  connect();

  return {
    ready,
    close() {
      closed = true;
      clearTimeout(timer);
      socket?.close();
    },
  };
};
