Here is the UI/UX Design Document for **ArezGit**, detailing the visual layout, design components, and the CSS libraries we will use to ensure a fluid, modern, and high-performance desktop experience.

### **ArezGit: UI/UX Design Document**

**1. Design Philosophy & Visual Identity**
The design of ArezGit will prioritize performance, visual clarity, and high information density without feeling cluttered. Taking inspiration from GitKraken, the interface will offer dark, light, and high-contrast themes. To ensure fluid interactions and prevent "repaint storms" (which cause layout lag), the UI will rely strictly on zero-runtime styling and heavily virtualized DOM rendering.

**2. Core Design System & CSS Libraries**
To maintain a modern look while guaranteeing desktop-class speed inside the Tauri webviews, we will avoid runtime CSS-in-JS libraries (like styled-components or Emotion) which can cause frame drops during heavy interactions.

- **Tailwind CSS v4:** We will use Tailwind CSS v4 as our core styling engine. Tailwind v4 uses Lightning CSS under the hood for build-time compilation, resulting in zero-runtime overhead, blazing-fast parsing, and minimal bundle sizes (5-20 KB).
- **shadcn/ui:** For our base UI components (buttons, dropdowns, dialogs, context menus), we will use `shadcn/ui`. This provides accessible, accessible, and unstyled Radix primitives that we will style with Tailwind CSS to maintain a sleek, native-feeling desktop interface.
- **Lucide Icons / Custom SVGs:** Clean, sharp iconography for branch indicators, PR statuses, and repository actions.

**3. Application Layout & Anatomy**
The application will use a structured layout divided into distinct, resizable panes to limit context switching.

- **Left Panel (Workspace & Repository Sidebar):**
  - A tree-view displaying your active Cloud and Local Workspaces.
  - Lists local repositories, branches, tags, and stashes.
  - **Interactivity:** We will use the **`@dnd-kit`** library for drag-and-drop operations here (e.g., reordering repos or dropping one branch onto another). `@dnd-kit` is lightweight (~6KB) and uses pointer/touch sensors with activation constraints so dragging doesn't interfere with normal scrolling.
- **Top Toolbar (Global Actions):**
  - Breadcrumb navigation with an integrated text-box search to quickly find and checkout branches or repositories.
  - Bulk action buttons (e.g., "Fetch All", "Pull All").
- **Main Content Area (Tabbed Interface):**
  - **Tab 1: The Launchpad (Dashboard):** A CSS Grid layout categorizing Pull Requests, Issues, and WIPs into actionable buckets (e.g., "Needs Your Review", "Ready to Merge", "Blocked").
  - **Tab 2: The Commit Graph:** The visual centerpiece of the app.
- **Right Panel (Commit & Diff Details):**
  - A contextual panel that opens when a commit or file is clicked.
  - Displays commit metadata, author avatars (fetched via Gravatar hashes or falling back to clean initials), and modified files.

**4. Specialized Visualization Components**
To achieve a GitKraken-level visual experience without sacrificing performance, we will integrate specialized React libraries for our heaviest views:

- **The Commit Graph (`liuliu-dev/CommitGraph`):**
  - **Hybrid Rendering:** The commit text (messages, authors) will be rendered as standard HTML DOM nodes for crisp text selection, while the overlapping, color-coded branch connection lines (swimlanes) will be drawn using SVG paths mapped to smooth Bézier curves.
  - **Minimap:** A high-level scroll map overview on the right edge of the graph, using color-coded blocks to show HEAD (green), tags (brown), local branches (blue), and search results (yellow).
  - **Fluidity Optimization:** We will use `CommitGraph.WithInfiniteScroll` to dynamically recycle DOM nodes as the user scrolls, ensuring the app stays smooth even with 50,000+ commits.
- **High-Performance Diff Viewer (`@git-diff-view/react`):**
  - When a user clicks a commit, the code changes will be rendered using this component, which supports side-by-side (split) and unified single-column views.
  - **Fluidity Optimization:** Loading a massive diff (e.g., a 2.2 MB patch with 50,000 lines) normally causes a 26,000+ ms paint delay that freezes the app. We will utilize the viewer's built-in **virtual scrolling** so that only the code lines currently visible on the user's monitor are actually painted to the DOM.
  - **Word-level Highlighting:** The diff will use syntax highlighting and highlight specific word changes within modified lines (similar to Sublime Merge).

**5. Design Best Practices for Fluidity**

- **Avoid Repaint Storms:** We will avoid expensive CSS properties like `backdrop-blur` or heavy overlapping shadows over animated layers within the commit graph, as these force the Webview to continuously repaint.
- **Memory Management:** To ensure the app feels native and doesn't suffer from memory leaks over time, any large diff models or editors mapped to closed tabs will be explicitly unmounted and destroyed.
