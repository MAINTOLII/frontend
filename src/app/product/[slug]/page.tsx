"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { useCart } from "@/context/CartContext";

// ===== helpers =====
function money(n: number) {
  return `$${Number(n ?? 0).toFixed(2)}`;
}

function safeImg(src: any) {
  const s = String(src ?? "").trim();
  if (!s) return "/example.png";
  if (s.startsWith("/")) return s;
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return "/example.png";
}

function isWeight(vt: any) {
  return String(vt ?? "").toLowerCase() === "weight";
}

function gToKgStr(g: any) {
  const n = Number(g ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0.000";
  return (n / 1000).toFixed(3);
}

// ===== types (match your DB tables shown in admin code) =====
type ProductRow = {
  id: string | number;
  slug: string;
  name: string;
  subcategory_id?: any;
};

type VariantRow = {
  id: string | number;
  product_id: string | number;
  name?: string | null; // ✅ product_variants.name
  variant_type?: string | null; // weight/unit
  sell_price?: number | null; // ✅ product_variants.sell_price
  is_active?: boolean | null; // ✅ product_variants.is_active
};

type ProductImage = {
  id: string | number;
  product_id: string | number;
  url: string;
  is_primary?: boolean | null;
  variant_id?: string | number | null;
};

type InventoryRow = {
  variant_id: string | number;
  qty_g: number | null;
  qty_units: number | null;
};

export default function ProductPageClient() {
  const { slug } = useParams<{ slug: string }>();
  const { addItem } = useCart();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [product, setProduct] = useState<ProductRow | null>(null);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [invMap, setInvMap] = useState<Record<string, InventoryRow>>({});

  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [slide, setSlide] = useState(0);

  // ===== LOAD PRODUCT + VARIANTS + IMAGES + INVENTORY =====
  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setErr(null);

      setProduct(null);
      setVariants([]);
      setImages([]);
      setInvMap({});
      setSelectedVariantId("");
      setSlide(0);

      try {
        const slugStr = String(slug ?? "").trim();
        if (!slugStr) throw new Error("Missing product slug");

        // 1) product by slug (ONLY existing columns)
        const pRes = await supabase
          .from("products")
          .select("id,slug,name")
          .eq("slug", slugStr)
          .maybeSingle();

        if (pRes.error) throw pRes.error;
        if (!pRes.data) {
          if (!alive) return;
          setErr("Product not found");
          setLoading(false);
          return;
        }

        const p = pRes.data as any as ProductRow;

        // 2) variants (existing columns)
        const vRes = await supabase
          .from("product_variants")
          .select("id,product_id,name,variant_type,sell_price,is_active")
          .eq("product_id", p.id)
          .order("created_at", { ascending: true });

        if (vRes.error) throw vRes.error;

        // 2b) images (your DB might use `images` not `product_images`)
        // Try `images` first, then fallback to `product_images`.
        let imgsData: any[] = [];

        const tryImages = await supabase
          .from("images")
          .select("id,product_id,url,is_primary")
          .eq("product_id", p.id)
          .order("is_primary", { ascending: false });

        if (!tryImages.error) {
          imgsData = tryImages.data ?? [];
        } else {
          const tryProductImages = await supabase
            .from("product_images")
            .select("id,product_id,url,is_primary")
            .eq("product_id", p.id)
            .order("is_primary", { ascending: false });

          if (!tryProductImages.error) {
            imgsData = tryProductImages.data ?? [];
          } else {
            // If both tables don't exist, continue without images.
            imgsData = [];
          }
        }

        const vAll = (vRes.data ?? []) as any as VariantRow[];
        const vActive = vAll.filter((v) => v.is_active !== false);

        // Normalize image rows into our ProductImage type (variant_id optional)
        const imgs = (imgsData ?? []).map((r: any) => ({
          id: r.id,
          product_id: r.product_id,
          url: r.url,
          is_primary: r.is_primary ?? null,
          variant_id: (r as any).variant_id ?? null,
        })) as ProductImage[];

        if (!alive) return;

        setProduct(p);
        setVariants(vActive);
        setImages(imgs);

        // default select first active variant
        const firstId = vActive[0]?.id != null ? String(vActive[0].id) : "";
        setSelectedVariantId(firstId);

        // 3) inventory for these variants (non-fatal)
        const ids = vActive.map((v) => String(v.id)).filter(Boolean);
        if (ids.length) {
          const invRes = await supabase
            .from("inventory")
            .select("variant_id,qty_g,qty_units")
            .in("variant_id", ids);

          if (!invRes.error) {
            const map: Record<string, InventoryRow> = {};
            for (const r of (invRes.data ?? []) as any[]) {
              map[String(r.variant_id)] = {
                variant_id: r.variant_id,
                qty_g: r.qty_g ?? 0,
                qty_units: r.qty_units ?? 0,
              };
            }
            if (alive) setInvMap(map);
          }
        }

        if (alive) setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message ?? e));
        setLoading(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [slug]);

  // ===== selected variant =====
  const selected = useMemo(() => {
    if (!variants.length) return null;
    const found = variants.find((v) => String(v.id) === String(selectedVariantId));
    return found ?? variants[0];
  }, [variants, selectedVariantId]);

  // keep selection valid (NO infinite loop)
  useEffect(() => {
    if (!variants.length) return;

    const first = String(variants[0].id);

    if (!selectedVariantId) {
      setSelectedVariantId(first);
      return;
    }

    const ok = variants.some((v) => String(v.id) === String(selectedVariantId));
    if (!ok) setSelectedVariantId(first);
  }, [variants, selectedVariantId]);

  // ===== images slideshow: variant images first, else base images =====
  const slideImages = useMemo(() => {
    const sid = selected?.id != null ? String(selected.id) : "";

    const variantImgs = sid
      ? images.filter((im) => String(im.variant_id ?? "") === sid)
      : [];

    const baseImgs = images.filter((im) => !im.variant_id);

    const list = (variantImgs.length ? variantImgs : baseImgs)
      .slice()
      .sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary));

    return list.length
      ? list
      : ([{ id: "-1", product_id: product?.id ?? "", url: "/example.png" }] as ProductImage[]);
  }, [images, selected?.id, product?.id]);

  // reset slide when variant changes or image set changes
  useEffect(() => {
    setSlide(0);
  }, [selected?.id, slideImages.length]);

  const activeUrlRaw = slideImages[Math.min(slide, slideImages.length - 1)]?.url;
  const activeUrl = safeImg(activeUrlRaw);

  function prev() {
    if (slideImages.length <= 1) return;
    setSlide((s) => (s - 1 + slideImages.length) % slideImages.length);
  }

  function next() {
    if (slideImages.length <= 1) return;
    setSlide((s) => (s + 1) % slideImages.length);
  }

  // ===== price + stock (ONLY sell_price; no base_price) =====
  const price = useMemo(() => {
    const v: any = selected;
    const pv = Number(v?.sell_price);
    if (Number.isFinite(pv) && pv > 0) return pv;
    return 0;
  }, [selected]);

  const stockInfo = useMemo(() => {
    if (!selected) return { soldOut: true, text: "SOLD OUT" };

    const inv = invMap[String(selected.id)];
    // If no inventory row exists, don't block buying (your choice)
    if (!inv) return { soldOut: false, text: "" };

    if (isWeight(selected.variant_type)) {
      const g = Number(inv.qty_g ?? 0);
      const soldOut = !Number.isFinite(g) || g <= 0;
      return { soldOut, text: soldOut ? "SOLD OUT" : `${gToKgStr(g)} kg` };
    }

    const u = Number(inv.qty_units ?? 0);
    const soldOut = !Number.isFinite(u) || u <= 0;
    return { soldOut, text: soldOut ? "SOLD OUT" : `${Math.trunc(u)} units` };
  }, [selected, invMap]);

  const soldOut = stockInfo.soldOut;

  function onAdd() {
    if (!product || !selected) return;
    if (soldOut) return;

    // keep as-is (your cart may be expecting numbers; your ids are UUID strings)
    (addItem as any)(product.id, selected.id, 1);
  }

  // ===== render =====
  if (loading) {
    return (
      <main className="min-h-screen bg-[#F4F6F8] pb-28">
        <div className="mx-auto max-w-md px-4 py-6 text-sm text-gray-700">Loading…</div>
      </main>
    );
  }

  if (err || !product) {
    return (
      <main className="min-h-screen bg-[#F4F6F8] pb-28">
        <div className="mx-auto max-w-md px-4 py-6">
          <Link href="/" className="text-[#0B6EA9] font-semibold text-sm">
            ← Back
          </Link>
          <div className="mt-4 bg-white border rounded-2xl p-4 text-sm text-gray-800">
            {err || "Product not found"}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F4F6F8] pb-32">
      <section className="mx-auto max-w-md bg-white border-b">
        <div className="px-4 pt-4">
          <Link href="/" className="text-[#0B6EA9] font-semibold text-sm">
            ← Back
          </Link>

          <h1 className="mt-3 text-sm font-semibold text-gray-900 leading-snug">
            {product.name}
          </h1>
        </div>

        {/* SLIDESHOW */}
        <div className="px-4 pb-4">
          <div className="py-4">
            <div className="relative bg-gray-50 rounded-2xl border overflow-hidden">
              <div className="relative h-[360px] w-full">
                <Image
                  src={activeUrl}
                  alt={String(product.name || "Product image")}
                  fill
                  className="object-contain p-6"
                  priority
                />
              </div>

              {slideImages.length > 1 ? (
                <>
                  <button
                    onClick={prev}
                    className="absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 border grid place-items-center"
                    aria-label="Previous image"
                    type="button"
                  >
                    <ChevronLeft size={18} />
                  </button>

                  <button
                    onClick={next}
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 border grid place-items-center"
                    aria-label="Next image"
                    type="button"
                  >
                    <ChevronRight size={18} />
                  </button>

                  <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
                    {slideImages.slice(0, 6).map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setSlide(i)}
                        className={`h-2.5 w-2.5 rounded-full border ${
                          i === slide ? "bg-[#0B6EA9] border-[#0B6EA9]" : "bg-white"
                        }`}
                        aria-label={`Go to image ${i + 1}`}
                        type="button"
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          {/* PRICE + STOCK */}
          <div className="flex items-end justify-between gap-3">
            <div className="text-xl font-extrabold text-gray-900">{money(price)}</div>

            {stockInfo.text ? (
              <div
                className={`text-xs font-semibold ${
                  soldOut ? "text-red-600" : "text-green-700"
                }`}
              >
                {stockInfo.text}
              </div>
            ) : (
              <div />
            )}
          </div>

          {/* VARIANTS (show inventory badge per option) */}
          {variants.length > 0 ? (
            <div className="mt-4">
              <div className="text-sm font-semibold text-gray-900">Choose size</div>

              <div className="mt-2 flex gap-2 flex-wrap">
                {variants.map((v) => {
                  const active = String(v.id) === String(selectedVariantId);
                  const inv = invMap[String(v.id)];

                  let vSold = false;
                  let badge: string | null = null;

                  if (inv) {
                    if (isWeight(v.variant_type)) {
                      const g = Number(inv.qty_g ?? 0);
                      vSold = !Number.isFinite(g) || g <= 0;
                      badge = vSold ? "SOLD" : `${gToKgStr(g)}kg`;
                    } else {
                      const u = Number(inv.qty_units ?? 0);
                      vSold = !Number.isFinite(u) || u <= 0;
                      badge = vSold ? "SOLD" : `${Math.trunc(u)}`;
                    }
                  }

                  return (
                    <button
                      key={String(v.id)}
                      type="button"
                      onClick={() => setSelectedVariantId(String(v.id))}
                      className={`px-3 py-2 rounded-xl border text-sm ${
                        active
                          ? "border-[#0B6EA9] bg-[#EAF4FB] text-[#0B6EA9] font-bold"
                          : "bg-white text-gray-800"
                      } ${vSold ? "opacity-70" : ""}`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span>{String(v.name ?? "Option")}</span>

                        {badge ? (
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full border ${
                              vSold
                                ? "border-red-200 bg-red-50 text-red-700"
                                : "border-gray-200 bg-gray-50 text-gray-700"
                            }`}
                          >
                            {badge}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* ADD */}
          <div className="mt-5">
            <button
              type="button"
              onClick={onAdd}
              disabled={!selected || soldOut}
              className={`w-full h-12 rounded-2xl font-extrabold shadow-sm transition active:scale-[0.99] ${
                !selected || soldOut ? "bg-gray-200 text-gray-500" : "bg-[#0B6EA9] text-white"
              }`}
            >
              {!selected ? "Choose a size" : soldOut ? "SOLD OUT" : "Add to cart"}
            </button>
          </div>

          {/* DETAILS (kept simple; your DB doesn't have long_description) */}
          <div className="mt-6 border-t pt-4">
            <div className="text-sm font-semibold text-gray-900">Product Details</div>
            <p className="mt-2 text-sm text-gray-700 leading-relaxed">No description available.</p>
          </div>
        </div>
      </section>
    </main>
  );
}