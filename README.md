# GitPulse

GitPulse is a desktop Git client built with Tauri, React, and TypeScript.

Repositories added to the workspace are stored locally and remain available
after app updates. They are not synced to other devices.

PR review automation is off by default. It requires GitHub authentication and
Copilot sign-in. Choose a model from the signed-in account's Copilot catalog;
GitPulse selects no default and stores the selected model ID locally. Automated
comments and eligible approvals are posted to GitHub; critical/high findings,
drafts, and your own PRs are not auto-approved. Review failures show full local
diagnostics in PR Reviews; the latest 25 messages are retained locally without
storing PR diffs or prompts.

## Build a macOS installer

On macOS, run:

```sh
pnpm install
pnpm build:dmg
```

The script builds a native release and copies the `.dmg` installer into the
project root. Tauri also keeps its bundle under
`src-tauri/target/release/bundle/dmg/`. Open the DMG and drag **GitPulse.app**
to **Applications**. This local build is unsigned, so macOS may require
approval in **System Settings > Privacy & Security** before the first launch.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
