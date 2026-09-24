Here is a full Product Requirements Document (PRD) for your high-performance Git GUI client, based on our previous agile plan and the deep architectural best practices from the sources.

### **Product Requirements Document (PRD): ArezGit**

**1. Product Vision & Objective**
ArezGit is a high-performance, cross-platform desktop Git client and developer hub designed to handle massive repositories and multi-repository workflows efficiently. By combining a Rust-based backend with a lightweight web frontend, it delivers the visual clarity of tools like GitKraken while maintaining the speed and low memory footprint essential for modern development.

**2. Target Tech Stack & Architecture**

- **Desktop Shell:** Tauri v2, utilizing native OS webviews (WebView2 for Windows, WKWebView for macOS, WebKitGTK for Linux) to minimize bundle size and overhead.
- **Frontend Framework:** React 19 with TypeScript, bundled via Vite for fast hot-module replacement and type-safe development.
- **Styling:** Tailwind CSS v4, utilizing Lightning CSS for zero-runtime, build-time static CSS generation to prevent rendering lag during complex DOM updates.
- **State Management:** Zustand for centralized, fast local state slices.
- **Drag & Drop:** `@dnd-kit` for modular, highly performant drag-and-drop interactions (such as reordering repositories or dragging branches).
- **Graph & Diff Visualization:** `liuliu-dev/CommitGraph` for interactive, virtualized SVG and DOM commit topologies, and `@git-diff-view/react` for rendering large unified/split code diffs without layout jank.

**3. Core Features & Functional Requirements**

- **Multi-Repository Workspaces:**
  - Users can add multiple local repositories into grouped "Workspaces".
  - The app must track the active branch, uncommitted Work in Progress (WIP), and remote status for all repositories in the workspace simultaneously.
  - Bulk operations support (e.g., Fetch All, Pull All) via the toolbar.
- **Unified Launchpad Dashboard:**
  - A centralized view summarizing Pull Requests (PRs), Issues, and WIPs across all grouped repositories.
  - PRs must be categorized by actionable statuses such as "Ready to Merge," "Blocked," and "Needs Your Review".
- **Interactive Commit Graph:**
  - A visual node-based history of commits and branches.
  - Must support viewport virtualization (infinite scrolling) to smoothly render repositories with 50,000+ commits without crashing the browser thread.
  - Support for drag-and-drop interactions to initiate merges, interactive rebases, or cherry-picks by dropping one branch onto another.
- **Git Worktree Support:**
  - Allow users to create and manage Git worktrees to check out multiple branches simultaneously in isolated directories, sharing the same repository history without requiring repeated clones.
- **Advanced Diff Viewer:**
  - Side-by-side and unified diff views that virtualize rendering so only lines currently visible in the viewport are painted, avoiding 26,000+ ms paint delays on massive diff patches.

**4. Non-Functional & Performance Requirements**

- **IPC Optimization:** Large payloads like multi-megabyte diff patches must not be serialized as JSON over the Tauri IPC bridge. Instead, Rust should process the data, write it locally, and the frontend should load it using a secure native asset protocol (`convertFileSrc`).
- **Non-Blocking Backend:** Heavy filesystem scans, `git log` parsing, and multi-repo indexing must be offloaded to parallel worker threads (e.g., using Rayon in Rust) to prevent UI thread freezing.
- **Memory Lifecycle Management:** To prevent memory bloat, large diff models and editor instances must be explicitly disposed of when tabs are closed, and aggressive React memoization must be applied to the commit graph.

---

### **Agile Development Plan (Sprints)**

**Sprint 1: Architecture, Bootstrapping & Shell**

- Initialize the Tauri v2 + React 19 + Vite boilerplate.
- Implement Tailwind CSS v4 and set up the modular directory structure (separating features, components, and API hooks).
- Establish the Rust-to-React IPC bridge and configure optimized release build settings (e.g., `lto = true`, `opt-level = "z"`) to minimize the binary size.

**Sprint 2: Local Multi-Repo Workspace Integration**

- Build a sidebar file-picker to import local repositories into a Zustand-managed "Workspace" state.
- Implement background Rust polling using `git status` to detect uncommitted changes and active branches for the loaded repositories.

**Sprint 3: Launchpad Dashboard Implementation**

- Create the dashboard UI layout using CSS Grid/Flexbox.
- Implement categorized buckets for WIPs, active branches, and recent commits across the Workspace.
- _(Future iteration)_: Prepare API hooks for connecting remote GitHub/GitLab integrations to pull in PR and Issue statuses.

**Sprint 4: Infinite-Scroll Commit Graph**

- Integrate `liuliu-dev/CommitGraph`.
- Write a Rust parser to extract `git log` metadata (SHAs, parents, authors, messages) and feed the data to the React component.
- Implement viewport virtualization so DOM nodes and SVG swimlanes are recycled as the user scrolls through history.

**Sprint 5: Diff Viewer & Detail Panel Polish**

- Integrate `@git-diff-view/react` to render file modifications on click.
- Build the Commit Details panel to show author info, commit message, and the list of changed files.
- Ensure the Monaco editor (or chosen diff component) properly unmounts models on tab closure to release RAM.

**Sprint 6: Advanced Interactions & Worktrees**

- Implement `@dnd-kit` to allow dragging branches in the UI to trigger merge or rebase operations.
- Add Rust backend commands for managing `git worktree` creations and deletions directly from the UI context menus.

---

Would you like me to create a formal, downloadable **Tailored Report** artifact of this PRD so you can save and share it with your team?
