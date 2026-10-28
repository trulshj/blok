import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { BlokEvent } from "../shared/types.ts";

/** Listens to /api/events and refetches notes when files change, in blok or anywhere else. */
export function useServerEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource("/api/events"); // reconnects by itself
    source.addEventListener("notes", (e) => {
      const event = JSON.parse((e as MessageEvent<string>).data) as BlokEvent;
      void queryClient.invalidateQueries({ queryKey: ["notes"] });
      void queryClient.invalidateQueries({ queryKey: ["search"] });
      void queryClient.invalidateQueries({ queryKey: ["sync"] }); // changed-file count
      for (const slug of event.slugs) {
        void queryClient.invalidateQueries({ queryKey: ["note", slug] });
        void queryClient.invalidateQueries({ queryKey: ["images", slug] });
      }
    });
    return () => source.close();
  }, [queryClient]);
}
