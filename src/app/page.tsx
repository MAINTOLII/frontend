"use client";

import Image from "next/image";
import Link from "next/link";
import TopNavbar from "@/components/TopNavbar";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// --- Minimal, self-contained hooks so the homepage works immediately.
// Later, we can move these into /context and /lib once the storefront structure is finalized.

type Lang = "en" | "so";

type CartItem = { productId: string; variantId?: string | null; qty: number };

function useLanguage() {
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    try {
      const v = (localStorage.getItem("matomart_lang") as Lang | null) ?? "en";
      setLang(v === "so" ? "so" : "en");
    } catch {
      setLang("en");
    }
  }, []);

  return { lang, setLang };
}

function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem("matomart_cart");
        const parsed = raw ? (JSON.parse(raw) as CartItem[]) : [];
        setItems(Array.isArray(parsed) ? parsed : []);
      } catch {
        setItems([]);
      }
    };

    read();
    window.addEventListener("storage", read);
    return () => window.removeEventListener("storage", read);
  }, []);

  return { items, setItems };
}

// --- Supabase client (requires NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

type CategoryRow = {
  id: string;
  slug: string;
  name_en: string;
  name_so: string;
  img: string | null;
};

type SubcategoryRow = {
  id: string;
  category_id: string;
  slug: string;
  name_en: string;
  name_so: string;
  img: string | null;
};

type VariantRow = {
  id: string;
  sell_price: number | string | null;
};

type CategoryWithSubcats = CategoryRow & { subcats: SubcategoryRow[] };

const HERO_SLIDES = [
  {
    id: 1,
    img: "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/ad1.webp",
  },
  {
    id: 2,
    img: "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/ad5.webp",
  },
  {
    id: 3,
    img: "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/ad3.webp",
  },
  {
    id: 4,
    img: "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/ad1.webp",
  },
  {
    id: 5,
    img: "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/ad1.webp",
  },
];

function money(n: number) {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

function PrimarySecondary({
  primary,
  secondary,
  center = true,
  primaryClass = "text-[11px] font-medium",
  secondaryClass = "text-[9px] text-gray-500",
}: {
  primary: string;
  secondary?: string;
  center?: boolean;
  primaryClass?: string;
  secondaryClass?: string;
}) {
  return (
    <div className={`${center ? "text-center" : "text-left"} leading-tight`}>
      <div className={primaryClass}>{primary}</div>
      {secondary ? <div className={secondaryClass}>{secondary}</div> : null}
    </div>
  );
}

const CATEGORY_BG: Record<string, string> = {
  groceries: "bg-[#0E5C1C]", // darker bold green
  baby: "bg-[#F8B8D0]", // richer baby pink
  "health-beauty": "bg-[#E89A3D]", // deeper warm orange/peach
  household: "bg-[#8FC5E8]", // stronger blue
};

function getCategoryBg(slug: string | undefined) {
  if (!slug) return "bg-[#F3F4F6]"; // default light gray
  return CATEGORY_BG[slug] ?? "bg-[#F3F4F6]";
}

async function getCategoriesWithSubcategories(): Promise<CategoryWithSubcats[]> {
  if (!supabase) return [];

  const [{ data: cats, error: catErr }, { data: subs, error: subErr }] = await Promise.all([
    supabase
      .from("categories")
      .select("id,slug,name_en,name_so,img")
      .order("created_at", { ascending: true }),
    supabase
      .from("subcategories")
      .select("id,category_id,slug,name_en,name_so,img")
      .order("created_at", { ascending: true }),
  ]);

  if (catErr) throw catErr;
  if (subErr) throw subErr;

  const subList = (subs ?? []) as SubcategoryRow[];
  const subByCat: Record<string, SubcategoryRow[]> = {};
  for (const s of subList) {
    if (!subByCat[s.category_id]) subByCat[s.category_id] = [];
    subByCat[s.category_id].push(s);
  }

  return ((cats ?? []) as CategoryRow[]).map((c) => ({ ...c, subcats: subByCat[c.id] ?? [] }));
}

async function getVariantsByIds(ids: string[]): Promise<VariantRow[]> {
  if (!supabase) return [];
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (uniq.length === 0) return [];
  const { data, error } = await supabase.from("product_variants").select("id,sell_price").in("id", uniq);
  if (error) throw error;
  return (data ?? []) as VariantRow[];
}

export default function HomePage() {
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeSlide, setActiveSlide] = useState(0);

  const { items } = useCart();
  const { lang } = useLanguage();

  const [categoryMap, setCategoryMap] = useState<CategoryWithSubcats[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [activeCatSlug, setActiveCatSlug] = useState<string | null>(null);
  const [compactTopCats, setCompactTopCats] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setActiveSlide((s) => (s + 1) % HERO_SLIDES.length), 3500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingCats(true);
        const cats = await getCategoriesWithSubcategories();
        if (!alive) return;
        setCategoryMap(cats);
      } catch (e: any) {
        console.error("HOME LOAD CATEGORIES ERROR:", e);
      } finally {
        if (alive) setLoadingCats(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Compact top categories (hide images) when scrolling down
  useEffect(() => {
    const handleScroll = () => {
      if (typeof window === "undefined") return;
      // When user scrolls past ~140px, hide topcat images
      setCompactTopCats(window.scrollY > 140);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Observe category sections and update active slug when scrolling
  useEffect(() => {
    if (!categoryMap.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const slug = entry.target.getAttribute("data-cat-slug");
          if (!slug) return;
          if (entry.isIntersecting) {
            setActiveCatSlug(slug);
          }
        });
      },
      {
        root: null,
        rootMargin: "-80px 0px -60% 0px",
        threshold: 0.2,
      }
    );

    categoryMap.forEach((cat) => {
      const el = sectionRefs.current[cat.slug];
      if (el) observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, [categoryMap]);

  // Lookup map for cart totals (variants only; products have no base price in new DB)
  const [variantMap, setVariantMap] = useState<Record<string, VariantRow>>({});

  useEffect(() => {
    let alive = true;

    (async () => {
      const cart = (Array.isArray(items) ? (items as any) : []) as CartItem[];
      const vids = cart.map((x) => x.variantId).filter((v): v is string => v != null);

      try {
        const vs = await getVariantsByIds(vids);
        if (!alive) return;

        const vm: Record<string, VariantRow> = {};
        for (const v of vs) vm[v.id] = v;

        setVariantMap(vm);
      } catch (e) {
        console.error(e);
      }
    })();

    return () => {
      alive = false;
    };
  }, [items]);

  const scrollToCategory = (slug: string) => {
    const el = sectionRefs.current[slug];
    if (!el) return;

    // Approximate combined height of TopNavbar + sticky top categories strip
    const headerOffset = 170;

    const rect = el.getBoundingClientRect();
    const scrollTop = window.scrollY + rect.top - headerOffset;

    window.scrollTo({
      top: scrollTop,
      behavior: "smooth",
    });
  };

  const cartTotals = useMemo(() => {
    const cart = (Array.isArray(items) ? (items as any) : []) as CartItem[];

    let total = 0;
    let count = 0;

    for (const it of cart) {
      const v = it.variantId != null ? variantMap[it.variantId] : null;
      const price = Number(v?.sell_price ?? 0);

      total += price * (it.qty ?? 1);
      count += it.qty ?? 1;
    }

    return { total, count };
  }, [items, variantMap]);

  const cartCtaPrimary = lang === "en" ? "Go to Cart →" : "U gudub Gaadhiga →";

  return (
    <main className="min-h-screen bg-white text-black">
      <TopNavbar />
      {/* TOP CATEGORIES STRIP (just under search bar) */}
      {categoryMap.length > 0 && (
        <section className="sticky top-[110px] z-40 border-b bg-white shadow-sm">
          <div className="mx-auto max-w-md px-2 py-2 flex gap-4 overflow-x-auto">
            {categoryMap.map((cat) => {
              const label = lang === "en" ? cat.name_en : cat.name_so;
              const imgSrc =
                typeof cat.img === "string" && cat.img.trim().length > 0
                  ? cat.img.trimEnd()
                  : "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/subcategories/baleware.webp";
              const isActive = activeCatSlug === cat.slug;

              return (
                <button
                  key={cat.id}
                  onClick={() => scrollToCategory(cat.slug)}
                  className={`min-w-[78px] px-1 py-0.5 rounded-xl transition-all duration-200 ${
                    isActive ? "bg-[#E3F2FF] shadow-md scale-[1.02]" : "bg-transparent"
                  }`}
                  type="button"
                >
                  {!compactTopCats && (
                    <div
                      className={`mx-auto h-14 w-14 rounded-full overflow-hidden flex items-center justify-center transition-shadow ${
                        isActive ? "bg-[#DBEAFE] ring-2 ring-[#0B6EA9] shadow-lg" : "bg-blue-50"
                      }`}
                    >
                      <Image
                        src={imgSrc}
                        alt={label}
                        width={56}
                        height={56}
                        className="w-full h-full object-contain p-1"
                      />
                    </div>
                  )}

                  <div
                    className={`mt-1 text-[11px] text-center leading-tight font-semibold transition-colors ${
                      isActive ? "text-[#0B6EA9]" : "text-[#0B3C6E]"
                    }`}
                  >
                    {label}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* HERO / AD SLIDESHOW */}
      <section className="bg-white pt-0">
        <div className="relative overflow-hidden rounded-2xl bg-white h-[140px] w-[90%] mx-auto">
          <div
            className="flex transition-transform duration-500"
            style={{ transform: `translateX(-${activeSlide * 100}%)` }}
          >
            {HERO_SLIDES.map((s) => (
              <div
                key={s.id}
                className="flex-none w-full h-[140px] flex items-center justify-center bg-white"
              >
                <Image src={s.img} alt="promo" width={500} height={140} className="max-h-full w-full object-contain" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROMO CARDS ROW */}
      <section className="bg-white px-4 pt-0 -mt-2">
        <div className="relative">
          <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory">
            {[
              "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/bar1.webp",
              "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/bar2.webp",
              "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/bar3.webp",
              "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/ads/bar4.webp",
            ].map((url, i) => (
              <div
                key={i}
                className="min-w-[100px] h-[140px] rounded-2xl overflow-hidden bg-white shadow-sm flex-shrink-0 snap-start border border-gray-200"
              >
                <Image src={url} alt="promo" width={100} height={140} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CATEGORY SECTIONS */}
      <section className="bg-white px-3 pb-6 pt-1">
        {loadingCats && categoryMap.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">Loading…</div>
        ) : (
          categoryMap.map((cat) => {
            const catPrimary = lang === "en" ? cat.name_en : cat.name_so;

            return (
              <div
                key={cat.id}
                ref={(el) => {
                  sectionRefs.current[cat.slug] = el;
                }}
                data-cat-slug={cat.slug}
                className="scroll-mt-[140px] pb-3"
              >
                <div className="mb-1">
                  <PrimarySecondary primary={catPrimary} center={false} primaryClass="text-lg font-bold text-gray-900" />
                </div>

                <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
                  {(cat.subcats || []).slice(0, 8).map((sub) => {
                    const subPrimary = lang === "en" ? sub.name_en : sub.name_so;

                    return (
                      <Link key={sub.id} href={`/subcategory/${sub.slug}`} className="flex flex-col items-center">
                        <div
                          className={`relative h-[90px] w-[90px] rounded-2xl overflow-hidden flex items-center justify-center ${getCategoryBg(
                            cat.slug
                          )}`}
                        >
                          <Image
                            src={
                              typeof sub.img === "string" && sub.img.trim().length > 0
                                ? sub.img.trimEnd()
                                : "https://ecfxrmhrfjqdmqewzrfz.supabase.co/storage/v1/object/public/product-images/subcategories/baleware.webp"
                            }
                            alt={subPrimary}
                            fill
                            className="object-contain"
                          />
                        </div>

                        <div className="mt-0.5">
                          <PrimarySecondary
                            primary={subPrimary}
                            primaryClass="text-[12px] font-semibold text-gray-800"
                          />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* STICKY GO TO CART BAR */}
      {cartTotals.count > 0 && (
        <div className="fixed left-0 right-0 bottom-[100px] z-40">
          <div className="mx-auto max-w-md px-3">
            <Link
              href="/cart"
              className="flex items-center justify-between bg-[#0B6EA9] text-white rounded-2xl px-4 py-3 shadow-lg"
            >
              <div>
                <div className="text-xs opacity-90">
                  {cartTotals.count} item{cartTotals.count > 1 ? "s" : ""} in cart
                </div>
                <div className="text-lg font-extrabold">{money(cartTotals.total)}</div>
              </div>

              <div className="text-right leading-tight font-extrabold">
                <div>{cartCtaPrimary}</div>
              </div>
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
