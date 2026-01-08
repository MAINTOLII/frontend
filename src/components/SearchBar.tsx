"use client";

import Link from "next/link";

export default function SearchBar({ placeholder = "50,000+ items" }) {
  return (
    <Link
      href="/search"
      className="flex items-center w-full h-11 rounded-full bg-white px-4 gap-3 text-sm text-[#0B6EA9] shadow-md border border-[#DDEAF3] active:scale-[0.98] transition-all"
      style={{ fontSize: "14px" }}
    >
      <div className="h-8 w-8 rounded-full bg-[#0B6EA9] flex items-center justify-center text-white text-[12px] font-bold shadow-sm">
        🛒
      </div>

      <span className="flex-1 truncate text-[14px] text-[#0B6EA9]/70 font-medium leading-snug">
        Search for <span className="font-semibold text-[#0B6EA9]">{placeholder}</span>
      </span>

      <span className="text-[#0B6EA9] text-xl">🔎</span>
    </Link>
  );
}