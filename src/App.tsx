import { useQuery } from "@tanstack/react-query";
import { Link, Route, Switch } from "wouter";
import type { SetupStatus } from "../shared/types.ts";
import { api } from "./api.ts";
import { TopBar } from "./components/TopBar.tsx";
import { Index } from "./screens/Index.tsx";
import { NoteScreen } from "./screens/NoteScreen.tsx";
import { Setup } from "./screens/Setup.tsx";
import { useServerEvents } from "./useServerEvents.ts";

export function App() {
  const setup = useQuery({ queryKey: ["setup"], queryFn: () => api<SetupStatus>("/setup") });
  useServerEvents();
  const ready = setup.data?.ready ?? false;

  return (
    <div className="app">
      <TopBar ready={ready} />
      {setup.isPending && (
        <p className="loading">
          Loading <span lang="ja">読み込み中</span>
        </p>
      )}
      {setup.isError && (
        <main className="screen">
          <p className="plate plate--error">{setup.error.message}</p>
        </main>
      )}
      {setup.isSuccess && !ready && <Setup status={setup.data} />}
      {ready && (
        <Switch>
          <Route path="/" component={Index} />
          <Route path="/notes/:slug">{(params) => <NoteScreen key={params.slug} slug={params.slug} />}</Route>
          <Route>
            <main className="screen">
              <p className="plate plate--error">There's no page here.</p>
              <Link href="/" className="back">
                ← All notes<span lang="ja">ノート一覧</span>
              </Link>
            </main>
          </Route>
        </Switch>
      )}
    </div>
  );
}
