import { TopBar } from "./TopBar";
import { RepoWorkspace } from "./RepoWorkspace";
import { HomeTab } from "@/features/home/HomeTab";
import { useUiStore, HOME_TAB } from "@/stores/uiStore";
import { useRepo } from "@/stores/workspaceStore";
import { usePrReviewAutomation } from "@/features/pr-review/usePrReviewAutomation";

export default function App() {
  usePrReviewAutomation();
  const activeTabId = useUiStore((s) => s.activeTabId);
  // null when Home is active or the tab's repo was removed.
  const repo = useRepo(activeTabId === HOME_TAB ? "" : activeTabId);

  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {repo ? <RepoWorkspace repo={repo} /> : <HomeTab />}
      </div>
    </div>
  );
}
