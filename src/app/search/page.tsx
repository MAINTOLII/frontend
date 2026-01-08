"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useLanguage } from "@/context/LanguageContext";
import { supabase } from "@/lib/supabaseClient";

/* ---------------- helpers ---------------- */

function normalize(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

function highlightMatch(text: string, termRaw: string) {
  const t = String(termRaw ?? "").trim();
  if (!t) return text;
  const lowerText = text.toLowerCase();
  const lowerT = t.toLowerCase();
  const idx = lowerText.indexOf(lowerT);
  if (idx === -1) return text;

  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold">{text.slice(idx, idx + t.length)}</span>
      {text.slice(idx + t.length)}
    </>
  );
}

/* ---------------- page ---------------- */

function SearchPageInner() {
  const { lang } = useLanguage();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  // ✅ If user lands on /search?tag=... (old behavior), redirect to /search/results/...
  const searchParams = useSearchParams();
  const tagParam = (searchParams.get("tag") || "").trim();

  const [q, setQ] = useState("");
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    if (tagParam) {
      router.replace(`/search/results/${encodeURIComponent(tagParam)}`);
      return;
    }
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [tagParam, router]);

  /* LOAD PRODUCTS (only id/tags needed for suggestions) */
  useEffect(() => {
    let alive = true;

    (async () => {
      const pRes = await supabase.from("products").select("id,tags").limit(3000);
      if (!alive) return;
      setProducts(pRes.data ?? []);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Dropdown suggestions: derive tag suggestions from product.tags
  const suggestions = useMemo(() => {
    const term = normalize(q);
    if (!term || term.length < 1) return [] as string[];

    const out = new Map<string, number>();
    const tokens = term.split(" ").filter(Boolean);

    for (const p of products) {
      const tags: string[] = Array.isArray((p as any)?.tags) ? (p as any).tags : [];
      for (const raw of tags) {
        const t = String(raw ?? "").trim();
        if (!t) continue;
        const tn = normalize(t);

        // match if any token is contained in tag
        const match = tokens.some((tok) => tn.includes(tok));
        if (!match) continue;

        // score: exact/startsWith gets higher
        let s = 0;
        if (tn === term) s += 1000;
        for (const tok of tokens) {
          if (tn.startsWith(tok)) s += 250;
          if (tn.includes(tok)) s += 150;
        }

        // preserve original casing
        out.set(t, (out.get(t) ?? 0) + s);
      }
    }

    return Array.from(out.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);
  }, [q, products]);

  const showDropdown = useMemo(() => {
    return normalize(q).length >= 1 && suggestions.length > 0;
  }, [q, suggestions.length]);

  function runSearch(value?: string) {
    const v = (value ?? q).trim();
    if (!v) return;
    router.push(`/search/results/${encodeURIComponent(v)}`);
  }

  // while redirecting from /search?tag=...
  if (tagParam) {
    return <main className="min-h-screen bg-white" />;
  }

  return (
    <main className="min-h-screen bg-white text-black pb-24">
      {/* FULL SCREEN SEARCH HEADER (Task1 UI) */}
      <section className="px-3 pt-3 pb-2 border-b border-gray-200">
        <div className="relative max-w-md mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runSearch();
            }}
            className="flex items-center gap-3"
          >
            {/* Back button */}
            <button
              type="button"
              onClick={() =>
                typeof window !== "undefined" && window.history.length > 1
                  ? router.back()
                  : router.push("/")
              }
              className="h-9 w-9 rounded-full flex items-center justify-center border border-gray-300 bg-white"
              aria-label="Back"
            >
              <span className="text-xl leading-none text-gray-700">←</span>
            </button>

            {/* Search bar */}
            <div className="flex-1 h-11 rounded-full border border-[#4A6FB8] bg-white px-3 flex items-center gap-2">
              {/* Logo-style icon */}
              <div className="h-7 w-7 rounded-md border border-[#4A6FB8] flex items-center justify-center">
                <span className="text-lg font-extrabold text-[#4A6FB8]">m</span>
              </div>

              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    runSearch();
                  }
                }}
                placeholder={lang === "en" ? "Search" : "Raadi"}
                className="flex-1 outline-none text-base"
              />
            </div>

            {/* Clear button */}
            <button
              type="button"
              onClick={() => setQ("")}
              className="h-9 w-9 rounded-full flex items-center justify-center border border-gray-300 bg-white"
              aria-label="Clear"
            >
              <span className="text-xl leading-none text-gray-700">✕</span>
            </button>
          </form>

          {/* DROPDOWN SUGGESTIONS (Task1 list UI) */}
          {showDropdown ? (
            <div className="absolute left-0 right-0 mt-2 z-40">
              <div className="mx-auto max-w-md">
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-lg">
                  {suggestions.map((tag: string) => (
                    <button
                      key={tag}
                      type="button"
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 border-b last:border-b-0"
                      onClick={() => {
                        setQ(tag);
                        runSearch(tag);
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-8 w-8 rounded-full border border-gray-400 flex items-center justify-center flex-shrink-0">
                          <span className="text-gray-500">🔍</span>
                        </div>
                        <div className="text-base text-gray-900 text-left truncate">
                          {highlightMatch(tag, q)}
                        </div>
                      </div>
                      <div className="text-2xl leading-none text-[#4A6FB8]">→</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-white" />}>
      <SearchPageInner />
    </Suspense>
  );
}