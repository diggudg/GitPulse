import { Home, X } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useUiStore, HOME_TAB } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

export function TabBar() {
  const { repos, openTabs, closeTab, setActiveRepo } = useWorkspaceStore();
  const { activeTabId, setActiveTab } = useUiStore();

  const nameOf = (path: string) => repos.find((r) => r.path === path)?.name ?? path;
  const activateRepo = (path: string) => {
    setActiveRepo(path);
    setActiveTab(path);
  };

  return (
    <div className="flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto">
      <button
        type="button"
        onClick={() => setActiveTab(HOME_TAB)}
        className={cn(
          "flex items-center gap-1.5 rounded-t-md border-b-2 px-3 text-sm",
          activeTabId === HOME_TAB
            ? "border-accent text-fg"
            : "border-transparent text-fg-muted hover:text-fg",
        )}
      >
        <Home size={14} /> Home
      </button>

      {openTabs.map((path) => {
        const active = activeTabId === path;
        return (
          <div
            key={path}
            className={cn(
              "group flex items-center gap-1 rounded-t-md border-b-2 pl-3 pr-1.5",
              active ? "border-accent bg-bg" : "border-transparent hover:bg-bg-elevated",
            )}
          >
            <button
              type="button"
              onClick={() => activateRepo(path)}
              className={cn("max-w-[12rem] truncate py-1.5 text-sm", active ? "text-fg" : "text-fg-muted")}
              title={path}
            >
              {nameOf(path)}
            </button>
            <button
              type="button"
              onClick={() => closeTab(path)}
              className="rounded p-0.5 text-fg-muted opacity-0 hover:bg-bg-inset hover:text-fg group-hover:opacity-100"
              aria-label={`Close ${nameOf(path)}`}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
