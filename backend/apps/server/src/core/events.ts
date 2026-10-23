import type { Service, StepEvent } from '@hackathon/contracts';

type Listener = (event: StepEvent) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(sessionId: string, listener: Listener): () => void {
    let set = this.listeners.get(sessionId);
    if (!set) this.listeners.set(sessionId, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(sessionId);
    };
  }

  emitStep(
    sessionId: string,
    service: Service,
    step: string,
    status: StepEvent['status'],
    data?: unknown,
  ) {
    const event: StepEvent = { sessionId, service, step, status, data, at: new Date().toISOString() };
    for (const listener of this.listeners.get(sessionId) ?? []) listener(event);
  }

  drop(sessionId: string) {
    this.listeners.delete(sessionId);
  }
}
