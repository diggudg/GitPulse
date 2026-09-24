import { Sun, Moon, Contrast, Terminal as TerminalIcon } from "lucide-react";
import { TabBar } from "./TabBar";
import { useUiStore, HOME_TAB, type Theme } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { SyncButton } from "@/features/sync/SyncButton";

const THEMES: { id: Theme; icon: typeof Sun }[] = [
  { id: "dark", icon: Moon },
  { id: "light", icon: Sun },
  { id: "high-contrast", icon: Contrast },
];

export function TopBar() {
  const { theme, setTheme, activeTabId } = useUiStore();
  return (
    <header className="flex h-10 shrink-0 items-end gap-3 border-b border-border bg-bg-elevated px-3 pt-1">
      <span className="pb-1.5 font-semibold tracking-tight text-accent">GitPulse</span>
      <TabBar />
      <div className="flex-1" />
      {activeTabId !== HOME_TAB && (
        <div className="mb-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => useUiStore.getState().toggleTerminal()}
            className={cn(
              "p-1.5 rounded-md border border-border bg-bg-elevated text-fg-muted hover:text-fg",
              useUiStore.getState().terminalVisible && "text-accent border-accent"
            )}
            title="Toggle Terminal"
          >
            <TerminalIcon size={14} />
          </button>
          <SyncButton repoPath={activeTabId} />
        </div>
      )}
      <div className="mb-1 flex items-center rounded-md border border-border">
        {THEMES.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            title={id}
            onClick={() => setTheme(id)}
            className={cn("p-1.5 text-fg-muted hover:text-fg", theme === id && "text-accent")}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
    </header>
  );
}
