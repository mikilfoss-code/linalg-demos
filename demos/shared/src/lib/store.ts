export type Store<State, Action> = {
  getState: () => State;
  dispatch: (action: Action) => void;
  subscribe: (listener: () => void) => () => void;
};

/**
 * Create a minimal reducer-driven store with synchronous subscriptions.
 */
export function createStore<State, Action>(
  initialState: State,
  reducer: (state: State, action: Action) => State
): Store<State, Action> {
  let state = initialState;
  const listeners = new Set<() => void>();

  return {
    getState() {
      return state;
    },
    dispatch(action) {
      state = reducer(state, action);
      listeners.forEach((listener) => {
        listener();
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
