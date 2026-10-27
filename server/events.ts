import type { BlokEvent } from "../shared/types.ts";

export type Hub = ReturnType<typeof createHub>;

/** In-process pub/sub that feeds the /api/events stream. */
export function createHub() {
  const listeners = new Set<(event: BlokEvent) => void>();
  return {
    publish(event: BlokEvent) {
      for (const listener of listeners) listener(event);
    },
    subscribe(listener: (event: BlokEvent) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
