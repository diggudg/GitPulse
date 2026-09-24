import type { FileStatus } from "@/lib/ipc";

const MAP: Record<FileStatus, { letter: string; className: string }> = {
  added: { letter: "A", className: "text-success" },
  modified: { letter: "M", className: "text-warning" },
  deleted: { letter: "D", className: "text-danger" },
  renamed: { letter: "R", className: "text-accent" },
};

export function FileStatusBadge({ status }: { status: FileStatus }) {
  const { letter, className } = MAP[status];
  return (
    <span className={`w-4 shrink-0 text-center font-mono text-xs font-bold ${className}`}>
      {letter}
    </span>
  );
}
