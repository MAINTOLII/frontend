"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useParams } from "next/navigation";

import { useCart } from "@/context/CartContext";
import { useLanguage } from "@/context/LanguageContext";

import {
  fetchSubcategoryBySlug,
  fetchSubSubcategoriesBySubcategoryId,
  fetchProductsBySubcategoryId,
  fetchVariantsByProductIds,
  fetchImagesByProductIds,
} from "@/lib/db";

/** ===== helpers ===== */
function money(n: number) {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

function safeImg(src: any) {
  const s = String(src ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/")) return s;
  return "";
}

function getLabel(obj: any, lang: "so" | "en") {
  const so = obj?.name_so ?? obj?.name ?? "";
  const en = obj?.name_en ?? obj?.name ?? "";
  return lang === "en" ? en : so;
}

function getSecondary(obj: any, lang: "so" | "en") {
  const so = obj?.name_so ?? obj?.name ?? "";
  const en = obj?.name_en ?? obj?.name ?? "";
  return lang === "en" ? so : en;
}

/** ===== page ===== */
export default function SubcategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { items, addItem, setQty } = useCart();
  const { lang } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [currentSub, setCurrentSub] = useState<any | null>(null);
  const [ssList, setSsList] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [variants, setVariants] = useState<any[]>([]);
  const [images, setImages] = useState<any[]>([]);

  const [activeSS, setActiveSS] = useState<string | null>(null);

  // UUID string ids
  const [selectedVariantByProduct, setSelectedVariantByProduct] = useState<
    Record<string, string | null>
  >({});
  const [justAddedId, setJustAddedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setActiveSS(null);

    (async () => {
      try {
        const sub = await fetchSubcategoryBySlug(String(slug));
        if (!sub) {
          setCurrentSub(null);
          setSsList([]);
          setProducts([]);
          setVariants([]);
          setImages([]);
          setLoading(false);
          return;
        }

        const prods = await fetchProductsBySubcategoryId(sub.id);
        const ids = (prods ?? []).map((p: any) => p.id);

        const [sss, vars, imgs] = await Promise.all([
          fetchSubSubcategoriesBySubcategoryId(sub.id),
          fetchVariantsByProductIds(ids),
          fetchImagesByProductIds(ids),
        ]);

        setCurrentSub(sub);
        setSsList(sss ?? []);
        setProducts(prods ?? []);
        setVariants(vars ?? []);
        setImages(imgs ?? []);
      } catch (e) {
        console.error("SUBCATEGORY LOAD ERROR", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  useEffect(() => {
    if (justAddedId === null) return;
    const t = setTimeout(() => setJustAddedId(null), 900);
    return () => clearTimeout(t);
  }, [justAddedId]);

  /** ===== Variants (NEW DB: name + sell_price + is_active) ===== */
  const getVariantsFor = (productId: string) => {
    return (variants ?? [])
      .filter((v: any) => String(v.product_id) === String(productId))
      .filter((v: any) => (v?.is_active ?? true) && v?.sell_price != null)
      .slice()
      .sort((a: any, b: any) => Number(a.sell_price) - Number(b.sell_price)); // cheapest first
  };

  const getDefaultVariantId = (productId: string) => {
    const vars = getVariantsFor(productId);
    return vars.length ? String(vars[0].id) : null;
  };

  const getVariantById = (productId: string, variantId: string | null) => {
    if (!variantId) return null;
    return (
      (variants ?? []).find(
        (v: any) =>
          String(v.product_id) === String(productId) &&
          String(v.id) === String(variantId)
      ) || null
    );
  };

  const getVariantPrice = (productId: string, variantId: string | null) => {
    const v = getVariantById(productId, variantId);
    return Number(v?.sell_price ?? 0);
  };

  /** ===== Images (NEW DB: product_variant_images.variant_id) ===== */
  const getVariantImageUrl = (variantId: string | null) => {
    if (!variantId) return "";
    const primary = (images ?? []).find(
      (img: any) => String(img.variant_id) === String(variantId) && img.is_primary
    );
    if (primary?.url) return safeImg(primary.url);

    const anyImg = (images ?? []).find(
      (img: any) => String(img.variant_id) === String(variantId)
    );
    return anyImg?.url ? safeImg(anyImg.url) : "";
  };

  const getProductImageUrl = (productId: string, selectedVariantId: string | null) => {
    // 1) selected variant image
    const selected = getVariantImageUrl(selectedVariantId);
    if (selected) return selected;

    // 2) any other variant image for this product
    const vars = (variants ?? []).filter((v: any) => String(v.product_id) === String(productId));
    for (const v of vars) {
      const u = getVariantImageUrl(String(v.id));
      if (u) return u;
    }

    // 3) none => return empty (we hide image)
    return "";
  };

  /** ===== Base list ===== */
  const baseList = useMemo(() => products, [products]);

  // Only show products that have at least 1 sellable (active + priced) variant
  const sellableProductIdSet = useMemo(() => {
    const set = new Set<string>();
    for (const v of variants ?? []) {
      const active = (v as any)?.is_active;
      const hasPrice = (v as any)?.sell_price != null;

      if (active === false) continue;
      if (!hasPrice) continue;

      set.add(String((v as any)?.product_id));
    }
    return set;
  }, [variants]);

  const filtered = useMemo(() => {
    let list = baseList as any[];

    if (activeSS) {
      const ss = ssList.find((x: any) => x.slug === activeSS);
      if (ss) {
        // NEW DB: products.subsubcat_id
        list = list.filter((p: any) => String(p.subsubcat_id) === String(ss.id));
      }
    }

    // Hide products that have no sellable variants
    list = list.filter((p: any) => sellableProductIdSet.has(String(p.id)));

    return list;
  }, [activeSS, baseList, ssList, sellableProductIdSet]);

  // Initialize default variant selection (cheapest)
  useEffect(() => {
    setSelectedVariantByProduct((prev) => {
      const next = { ...prev };
      for (const p of filtered as any[]) {
        const pid = String(p.id);
        if (next[pid] === undefined) {
          next[pid] = getDefaultVariantId(pid);
        }
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, variants.length]);

  const activeObj = activeSS ? ssList.find((x: any) => x.slug === activeSS) : null;

  const titlePrimary = activeObj ? getLabel(activeObj, lang) : getLabel(currentSub, lang);
  const titleSecondary = activeObj ? getSecondary(activeObj, lang) : getSecondary(currentSub, lang);

  const seoLine =
    lang === "so"
      ? `Ka hel ${titlePrimary} (${titleSecondary}) online MatoMart – raashin iyo alaabooyin tayo leh oo lagu keeno gudaha Soomaaliya.`
      : `Shop ${titleSecondary} (${titlePrimary}) online in Somalia with MatoMart – quality groceries and essentials delivered fast.`;

  /** ===== Cart totals (use variant sell_price) ===== */
  const cartTotals = useMemo(() => {
    let total = 0;
    let count = 0;

    for (const it of items ?? []) {
      const pid = String((it as any).productId);
      const vid = ((it as any).variantId ?? null) as string | null;

      const p: any = (products ?? []).find((x: any) => String(x.id) === pid);
      if (!p) continue;

      const price = getVariantPrice(pid, vid);
      total += price * (Number((it as any).qty ?? 1));
      count += Number((it as any).qty ?? 1);
    }

    return { total, count };
  }, [items, products, variants, images]);

  /** ===== Subcategory JSON-LD (CollectionPage + ItemList) ===== */
  const jsonLdString = useMemo(() => {
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const url = origin ? `${origin}/subcategory/${String(slug)}` : undefined;

      const list = (baseList as any[]).map((p, index) => {
        const ps = p?.slug ? String(p.slug) : "";
        const prodUrl = origin ? `${origin}/product/${ps}` : `/product/${ps}`;
        return {
          "@type": "Product",
          position: index + 1,
          name: p.name,
          url: prodUrl,
        };
      });

      const ld: any = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: titlePrimary,
        description: seoLine,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: list.length,
          itemListElement: list,
        },
      };

      if (url) ld.url = url;
      return JSON.stringify(ld);
    } catch {
      return "";
    }
  }, [slug, baseList, titlePrimary, seoLine]);

  if (!loading && !currentSub) {
    return (
      <main className="min-h-screen bg-white p-6 text-black">
        Subcategory not found.
      </main>
    );
  }

  function ProductAdd({
    productId,
    selectedVariantId,
  }: {
    productId: string;
    selectedVariantId: string | null;
  }) {
    const item = (items ?? []).find(
      (i: any) =>
        String(i.productId) === String(productId) &&
        String(i.variantId ?? "") === String(selectedVariantId ?? "")
    );
    const qty = item?.qty ?? 0;

    if (!item) {
      return (
        <button
          onClick={() => {
            addItem(productId as any, selectedVariantId as any, 1);
            setJustAddedId(productId);
          }}
          className="mt-2 w-full h-10 rounded-xl border-2 border-[#0B6EA9] text-[#0B6EA9] font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition"
        >
          {lang === "en" ? "Add" : "Ku dar"}{" "}
          <span className="text-xl leading-none">+</span>
        </button>
      );
    }

    return (
      <div className="mt-2 flex items-center justify-between">
        <button
          onClick={() => setQty(productId as any, selectedVariantId as any, qty - 1)}
          className="w-10 h-10 rounded-full bg-[#0B6EA9] text-white text-xl font-bold grid place-items-center"
        >
          −
        </button>

        <div className="text-sm font-extrabold text-gray-900">{qty}</div>

        <button
          onClick={() => setQty(productId as any, selectedVariantId as any, qty + 1)}
          className="w-10 h-10 rounded-full bg-[#0B6EA9] text-white text-xl font-bold grid place-items-center"
        >
          +
        </button>
      </div>
    );
  }

  const hasRail = ssList.length > 0;

  return (
    <>
      {jsonLdString && (
        <script
          type="application/ld+json"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: jsonLdString }}
        />
      )}

      <main className="min-h-screen bg-[#F4F6F8] pb-28">
        {/* TITLE */}
        <section className="bg-white border-b">
          <div className="mx-auto max-w-md px-4 py-2 flex items-center justify-between">
            <div className="leading-tight">
              <div className="text-[13px] font-semibold text-gray-900">
                {loading ? "..." : titlePrimary}
              </div>
              <div className="text-[10px] text-gray-500">
                {loading ? "" : titleSecondary}
              </div>
              {!loading && (
                <p className="mt-0.5 text-[10px] text-gray-500 max-w-xs leading-snug">
                  {seoLine}
                </p>
              )}
            </div>
            <div className="w-8" />
          </div>
        </section>

        {/* MAIN */}
        <section
          className={`mx-auto max-w-md grid ${
            hasRail ? "grid-cols-[72px_1fr]" : "grid-cols-1"
          }`}
        >
          {/* LEFT RAIL */}
          {hasRail && (
            <aside className="bg-gray-50 border-r px-1.5 py-2 space-y-1.5">
              <button
                type="button"
                onClick={() => setActiveSS(null)}
                className={`w-full flex items-center justify-center rounded-xl px-2 py-3 ${
                  activeSS === null
                    ? "bg-[#0B6EA9]/10 border border-[#0B6EA9]"
                    : "bg-white border border-gray-200"
                }`}
              >
                <span
                  className={`text-[11px] font-bold ${
                    activeSS === null ? "text-[#0B6EA9]" : "text-gray-800"
                  }`}
                >
                  {lang === "en" ? "ALL" : "DHAMMAAN"}
                </span>
              </button>

              {ssList.map((ss: any) => {
                const isActive = activeSS === ss.slug;
                const primary = getLabel(ss, lang);
                const img = safeImg(ss.img);

                return (
                  <button
                    key={ss.id}
                    type="button"
                    onClick={() => setActiveSS(ss.slug)}
                    className="w-full flex flex-col items-center rounded-xl px-1.5 py-2"
                  >
                    <div
                      className={`w-14 h-14 rounded-xl overflow-hidden relative border ${
                        isActive ? "border-[#0B6EA9]" : "border-gray-200"
                      } bg-white`}
                    >
                      {img ? (
                        <Image src={img} alt={primary} fill className="object-contain p-2" />
                      ) : (
                        <div className="w-full h-full grid place-items-center text-[10px] text-gray-400">
                          {lang === "en" ? "No image" : "Sawir ma jiro"}
                        </div>
                      )}
                    </div>
                    <div className="mt-1 text-[10px] text-center leading-tight">
                      <div
                        className={
                          isActive
                            ? "text-[#0B6EA9] font-semibold"
                            : "text-gray-800 font-semibold"
                        }
                      >
                        {primary}
                      </div>
                    </div>
                  </button>
                );
              })}
            </aside>
          )}

          {/* RIGHT GRID */}
          <div className="p-3">
            <div className="grid grid-cols-2 gap-2">
              {loading ? (
                <div className="col-span-2 bg-white rounded-2xl border p-4 text-sm text-gray-600">
                  Loading...
                </div>
              ) : (
                <>
                  {filtered.map((p: any) => {
                    const pid = String(p.id);

                    const vars = getVariantsFor(pid); // already sellable + cheapest first
                    const selectedVariantId =
                      selectedVariantByProduct[pid] ?? getDefaultVariantId(pid);

                    const selectedV = getVariantById(pid, selectedVariantId);
                    const price = getVariantPrice(pid, selectedVariantId);

                    const label = selectedV?.name ?? "";
                    const imgUrl = getProductImageUrl(pid, selectedVariantId);

                    const chips = vars.slice(0, 3);
                    const extraCount = Math.max(0, vars.length - chips.length);

                    return (
                      <div
                        key={pid}
                        className="rounded-2xl shadow-sm overflow-hidden border relative flex flex-col bg-white border-gray-200"
                      >
                        <div className="relative pt-3 px-3 pb-2 flex-1">
                          {label ? (
                            <div className="absolute right-2 bottom-2 text-[10px] px-2 py-0.5 rounded-full bg-black/70 text-white">
                              {label}
                            </div>
                          ) : null}

                          {justAddedId === pid ? (
                            <div className="absolute left-2 top-2 text-[11px] px-2 py-1 rounded-full bg-green-600 text-white font-bold shadow">
                              {lang === "en" ? "Added ✓" : "Waa la daray ✓"}
                            </div>
                          ) : null}

                          <Link href={`/product/${p.slug ?? ""}`} className="block">
                            {imgUrl ? (
                              <Image
                                src={imgUrl}
                                alt={p.name}
                                width={220}
                                height={220}
                                className="mx-auto h-32 object-contain w-full"
                              />
                            ) : (
                              <div className="mx-auto h-32 w-full grid place-items-center text-[11px] text-gray-400">
                                {lang === "en" ? "No image" : "Sawir ma jiro"}
                              </div>
                            )}
                          </Link>
                        </div>

                        <div className="px-3 pb-3">
                          <div className="text-[13px] font-semibold text-gray-900 line-clamp-2 min-h-[32px]">
                            {p.name}
                          </div>

                          {/* Variant chips */}
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {chips.map((v: any) => {
                              const active = String(v.id) === String(selectedVariantId);
                              return (
                                <button
                                  key={String(v.id)}
                                  onClick={() =>
                                    setSelectedVariantByProduct((prev) => ({
                                      ...prev,
                                      [pid]: String(v.id),
                                    }))
                                  }
                                  className={`h-7 px-2 rounded-full border text-[11px] font-semibold transition ${
                                    active
                                      ? "border-[#0B6EA9] bg-[#EAF4FB] text-[#0B6EA9]"
                                      : "bg-white text-gray-700 border-gray-200"
                                  }`}
                                >
                                  {v.name}
                                </button>
                              );
                            })}

                            {extraCount > 0 ? (
                              <Link
                                href={`/product/${p.slug ?? ""}`}
                                className="h-7 px-2 rounded-full border text-[11px] font-semibold bg-white text-[#0B6EA9] grid place-items-center border-gray-200"
                              >
                                +{extraCount} {lang === "en" ? "more" : "kale"}
                              </Link>
                            ) : null}
                          </div>

                          {/* Price */}
                          <div className="mt-2 flex items-end gap-2">
                            <div className="text-[18px] font-extrabold text-gray-900 leading-none">
                              {money(price)}
                            </div>
                          </div>

                          <div className="h-[8px]" />

                          <div className="mt-1">
                            <ProductAdd productId={pid} selectedVariantId={selectedVariantId} />
                          </div>

                          <div className="mt-1 text-[11px] font-semibold text-[#0F8A4B]">
                            ⚡ {lang === "en" ? "Quick" : "Degdeg"}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {filtered.length === 0 && (
                    <div className="col-span-2 bg-white rounded-2xl border p-4 text-sm text-gray-600">
                      {lang === "en"
                        ? "No products found in this section."
                        : "Alaab lagama helin qaybtaan."}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>

        {/* STICKY CART BAR */}
        {cartTotals.count > 0 && (
          <div className="fixed left-0 right-0 bottom-4 z-40">
            <div className="mx-auto max-w-md px-3">
              <Link
                href="/cart"
                className="flex items-center justify-between bg-[#0B6EA9] text-white rounded-2xl px-4 py-3 shadow-lg"
              >
                <div>
                  <div className="text-xs opacity-90">
                    {cartTotals.count} {lang === "en" ? "item" : "shay"}
                    {cartTotals.count > 1 ? "s" : ""}{" "}
                    {lang === "en" ? "in cart" : "gaadhiga ku jira"}
                  </div>
                  <div className="text-lg font-extrabold">{money(cartTotals.total)}</div>
                </div>

                <div className="text-right leading-tight font-extrabold">
                  <div>{lang === "en" ? "Go to Cart →" : "U gudub Gaadhiga →"}</div>
                  <div className="text-[10px] opacity-80">
                    {lang === "en" ? "U gudub Gaadhiga" : "Go to Cart"}
                  </div>
                </div>
              </Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}