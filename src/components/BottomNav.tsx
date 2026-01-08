"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Minimal BottomNav to unblock build.
// We can replace with your full design later.
export default function BottomNav() {
  const pathname = usePathname();

  const Item = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`flex-1 text-center py-3 text-sm font-semibold ${
          active ? "text-[#0B6EA9]" : "text-gray-500"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="fixed left-0 right-0 bottom-0 z-50 border-t bg-white">
      <div className="mx-auto max-w-md flex">
        <Item href="/" label="Home" />
        <Item href="/search" label="Search" />
        <Item href="/cart" label="Cart" />
      </div>
    </nav>
  );
}
