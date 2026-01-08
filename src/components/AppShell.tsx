"use client";

/**
 * Minimal AppShell wrapper.
 * Keep it dumb for now: just centers content to mobile width.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-md">{children}</div>;
}
