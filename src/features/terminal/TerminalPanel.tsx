import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { Command, Child } from "@tauri-apps/plugin-shell";
import "@xterm/xterm/css/xterm.css";

export function TerminalPanel({ repoPath }: { repoPath: string }) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const shellProcess = useRef<Child | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      theme: {
        background: 'transparent',
      }
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener("resize", handleResize);

    let active = true;

    async function initShell() {
      try {
        // Spawn the default shell based on platform. Simple heuristic.
        const isWindows = navigator.userAgent.toLowerCase().includes("windows");
        const shell = isWindows ? "powershell.exe" : "zsh"; // default to zsh or bash

        // Note: Without a real PTY backend in Rust, this acts like a dumb terminal,
        // but it's enough for basic git commands.
        const cmd = Command.create(shell, ["-i"], { cwd: repoPath });
        
        cmd.stdout.on("data", (line) => {
          if (active) term.write(line);
        });
        
        cmd.stderr.on("data", (line) => {
          if (active) term.write(line);
        });

        const child = await cmd.spawn();
        shellProcess.current = child;

        // Route xterm keystrokes to the shell process
        term.onData((data) => {
          if (shellProcess.current) {
            // Convert string to Uint8Array for the write command
            const encoder = new TextEncoder();
            shellProcess.current.write(encoder.encode(data));
          }
        });

      } catch (e) {
        console.error("Failed to spawn shell", e);
        term.writeln(`\x1b[31mFailed to start shell: ${e}\x1b[0m`);
      }
    }

    initShell();

    return () => {
      active = false;
      window.removeEventListener("resize", handleResize);
      if (shellProcess.current) {
        shellProcess.current.kill();
        shellProcess.current = null;
      }
      term.dispose();
    };
  }, [repoPath]);

  return (
    <div className="h-full w-full bg-bg-elevated p-2">
      <div ref={terminalRef} className="h-full w-full" />
    </div>
  );
}
