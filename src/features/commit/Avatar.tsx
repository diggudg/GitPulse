import { cn } from "@/lib/utils";

/** Deterministic color + initials avatar. (Gravatar lookup is a follow-up.) */
export function Avatar({ name, email, size = 28 }: { name: string; email: string; size?: number }) {
  const initials = (name || email || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  let hash = 0;
  for (const ch of email || name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-medium text-white")}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        backgroundColor: `hsl(${hash} 55% 45%)`,
      }}
      title={`${name} <${email}>`}
    >
      {initials}
    </span>
  );
}
