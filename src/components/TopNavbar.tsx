"use client";

import { usePathname, useRouter } from "next/navigation";
import SearchBar from "@/components/SearchBar";
import { useLanguage } from "@/context/LanguageContext";

/* cookie helper */
function setCookie(name: string, value: string, days = 365) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

export default function TopNavbar() {
  const pathname = usePathname() || "/";
  const router = useRouter();

  const isSearchPage = pathname === "/search";

  const { lang, setLang } = useLanguage();

  const showBack =
    pathname !== "/" &&
    (pathname.startsWith("/product") ||
      pathname.startsWith("/subcategory") ||
      isSearchPage);

  const placeholderCount = "50,000+";

  return (
<header className="sticky top-0 z-50 bg-gradient-to-b from-[#A4D8F5] via-[#6BBCE9] to-[#2A99D9]">
  <div className="mx-auto max-w-md px-2 pt-1 pb-1">
        {/* LANGUAGE TOGGLE */}
        <div className="flex justify-end mb-1">
          <div className="flex bg-white/30 backdrop-blur-sm rounded-full px-2 py-1 gap-1 border border-white/40 shadow-sm">
            <button
              onClick={() => { setLang("so"); setCookie("lang", "so"); }}
              className={`px-2 py-0.5 rounded-full transition flex items-center justify-center ${
                lang === "so" ? "bg-white text-[#39A3E6] shadow" : "text-white/90"
              }`}
            >
              🇸🇴
            </button>
            <button
              onClick={() => { setLang("en"); setCookie("lang", "en"); }}
              className={`px-2 py-0.5 rounded-full transition flex items-center justify-center ${
                lang === "en" ? "bg-white text-[#39A3E6] shadow" : "text-white/90"
              }`}
            >
              🇬🇧
            </button>
          </div>
        </div>
        {/* ===== ROW 1 ===== */}
<div className="flex items-center gap-2 bg-white rounded-full px-2.5 py-1.5 shadow-md">
          {showBack && (
            <button
              onClick={() =>
                window.history.length > 1 ? router.back() : router.push("/")
              }
              className="h-9 w-9 rounded-full bg-[#39A3E6] text-white grid place-items-center shadow"
              aria-label="Back"
            >
              ←
            </button>
          )}

          {!isSearchPage && (
            <div className="flex-1">
              <SearchBar placeholder={placeholderCount} />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
