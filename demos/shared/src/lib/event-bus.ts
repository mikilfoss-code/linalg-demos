export type EventMap = Record<string, unknown>;

export type EventBus<Events extends EventMap> = {
  on: <Key extends keyof Events>(
    eventName: Key,
    listener: (payload: Events[Key]) => void
  ) => () => void;
  emit: <Key extends keyof Events>(eventName: Key, payload: Events[Key]) => void;
  clear: () => void;
};

/**
 * Create a typed pub/sub event bus for demo controllers.
 */
export function createEventBus<Events extends EventMap>(): EventBus<Events> {
  const listeners = new Map<keyof Events, Set<(payload: unknown) => void>>();

  return {
    on(eventName, listener) {
      let eventListeners = listeners.get(eventName);
      if (!eventListeners) {
        eventListeners = new Set();
        listeners.set(eventName, eventListeners);
      }
      const wrappedListener = listener as (payload: unknown) => void;
      eventListeners.add(wrappedListener);

      return () => {
        const currentListeners = listeners.get(eventName);
        if (!currentListeners) {
          return;
        }
        currentListeners.delete(wrappedListener);
        if (currentListeners.size === 0) {
          listeners.delete(eventName);
        }
      };
    },
    emit(eventName, payload) {
      const eventListeners = listeners.get(eventName);
      if (!eventListeners) {
        return;
      }
      eventListeners.forEach((listener) => {
        listener(payload);
      });
    },
    clear() {
      listeners.clear();
    },
  };
}
