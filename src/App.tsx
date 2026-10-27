import { useQuery } from "@tanstack/react-query";
import type { SetupStatus } from "../shared/types.ts";
import { api } from "./api.ts";
import { TopBar } from "./components/TopBar.tsx";
import { Home } from "./screens/Home.tsx";
import { Setup } from "./screens/Setup.tsx";

export function App() {
  const setup = useQuery({ queryKey: ["setup"], queryFn: () => api<SetupStatus>("/setup") });

  return (
    <div className="app">
      <TopBar />
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
      {setup.isSuccess && (setup.data.ready ? <Home status={setup.data} /> : <Setup status={setup.data} />)}
    </div>
  );
}
