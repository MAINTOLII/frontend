"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCart } from "@/context/CartContext";
import { supabase } from "@/lib/supabaseClient";

type Variant = {
  id: string | number; // uuid or int
  product_id?: string | number;
  // either `name` or `label` depending on your schema
  name?: string | null;
  label?: string | null;
  // either `sell_price` or `price` depending on your schema
  sell_price?: number | string | null;
  price?: number | string | null;
  variant_type?: string | null; // "unit" | "weight" (optional)
  is_active?: boolean;
};

type ImageRow = {
  id: string | number;
  product_id?: string | number | null;
  variant_id?: string | number | null;
  url: string;
  is_primary?: boolean;
  sort_order?: number | null;
};

type InvRow = {
  variant_id: string | number;
  qty_g: number | null;
  qty_units: number | null;
};

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

function variantTitle(v: Variant) {
  return String(v?.label ?? v?.name ?? "").trim();
}

function variantPrice(v: Variant) {
  const raw = v?.price ?? v?.sell_price;
  const n = Number(raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtKgFromG(g?: number | null) {
  const n = Number(g ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0.000kg";
  return `${(n / 1000).toFixed(3)}kg`;
}

export default function ProductClient({
  productId,
  productName,
  variants,
  images,
}: {
  productId: string;
  productName: string;
  variants: Variant[];
  images: ImageRow[];
}) {
  const { addItem } = useCart();

  const sellable = useMemo(() => {
    return (variants || [])
      .filter((v) => (v?.is_active ?? true) && variantPrice(v) > 0)
      .slice()
      .sort((a, b) => variantPrice(a) - variantPrice(b));
  }, [variants]);

  const [selectedId, setSelectedId] = useState<string | number | null>(sellable[0]?.id ?? null);
  const [slide, setSlide] = useState(0);

  const [invMap, setInvMap] = useState<Record<string, InvRow>>({});

  const idsKey = useMemo(() => {
    return (sellable || []).map((v) => String(v.id)).sort().join(",");
  }, [sellable]);

  useEffect(() => {
    let cancelled = false;

    async function loadInv() {
      const ids = (sellable || []).map((v) => String(v.id)).filter(Boolean);
      if (!ids.length) {
        if (!cancelled) setInvMap({});
        return;
      }

      const { data, error } = await supabase
        .from("inventory")
        .select("variant_id,qty_g,qty_units")
        .in("variant_id", ids);

      if (error) {
        // fail silent (UI should still work)
        if (!cancelled) setInvMap({});
        return;
      }

      const next: Record<string, InvRow> = {};
      for (const r of (data ?? []) as any[]) {
        const key = String(r.variant_id);
        next[key] = {
          variant_id: r.variant_id,
          qty_g: r.qty_g ?? 0,
          qty_units: r.qty_units ?? 0,
        };
      }

      if (!cancelled) setInvMap(next);
    }

    loadInv();
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  useEffect(() => {
    setSelectedId(sellable[0]?.id ?? null);
  }, [idsKey]);

  const selected = useMemo(() => {
    if (!sellable.length) return null;
    return sellable.find((v) => String(v.id) === String(selectedId)) ?? sellable[0];
  }, [sellable, selectedId]);

  const price = selected ? variantPrice(selected) : 0;

  const selectedInv = selected ? invMap[String(selected.id)] : undefined;
  const qtyUnits = Number(selectedInv?.qty_units ?? 0);
  const qtyG = Number(selectedInv?.qty_g ?? 0);
  const isWeight = qtyG > 0 && qtyUnits === 0;
  const isSoldOut = selected ? (isWeight ? qtyG <= 0 : qtyUnits <= 0) : false;

  const slideImages = useMemo(() => {
    if (!selected?.id) return [];

    const variantImgs = (images || []).filter(
      (im) => im?.variant_id != null && String(im.variant_id) === String(selected.id)
    );

    const productImgs = (images || []).filter((im) => !im?.variant_id);

    const list = (variantImgs.length ? variantImgs : productImgs)
      .slice()
      .sort((a, b) => {
        const p = Number(!!b.is_primary) - Number(!!a.is_primary);
        if (p !== 0) return p;
        return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
      });

    return list;
  }, [images, selected?.id]);

  useEffect(() => setSlide(0), [selected?.id, slideImages.length]);

  const hasImages = slideImages.length > 0;
  const activeUrl = hasImages
    ? safeImg(slideImages[Math.min(slide, slideImages.length - 1)]?.url)
    : "/example.png";

  function prev() {
    if (slideImages.length <= 1) return;
    setSlide((s) => (s - 1 + slideImages.length) % slideImages.length);
  }

  function next() {
    if (slideImages.length <= 1) return;
    setSlide((s) => (s + 1) % slideImages.length);
  }

  function onAdd() {
    if (!selected || isSoldOut) return;
    // IMPORTANT: CartContext supports variant-safe items
    addItem(productId as any, (selected.id ?? null) as any, 1);
  }

  return (
    <div className="px-4 pb-4">
      {/* IMAGE */}
      {hasImages ? (
        <div className="py-4">
          <div className="relative bg-gray-50 rounded-2xl border overflow-hidden">
            <div className="relative h-[340px] w-full">
              <Image
                src={activeUrl}
                alt={productName}
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
                >
                  <ChevronLeft size={18} />
                </button>

                <button
                  onClick={next}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 border grid place-items-center"
                  aria-label="Next image"
                >
                  <ChevronRight size={18} />
                </button>

                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-2">
                  {slideImages.slice(0, 6).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setSlide(i)}
                      className={`h-2.5 w-2.5 rounded-full border ${
                        i === slide
                          ? "bg-[#0B6EA9] border-[#0B6EA9]"
                          : "bg-white"
                      }`}
                      aria-label={`Go to image ${i + 1}`}
                    />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* PRICE */}
      <div className="flex items-end justify-between gap-3">
        <div className="text-xl font-extrabold text-gray-900">{money(price)}</div>

        <button
          onClick={onAdd}
          disabled={!selected || isSoldOut}
          className={`h-10 px-4 rounded-xl font-extrabold active:scale-[0.99] ${
            !selected || isSoldOut
              ? "bg-gray-300 text-gray-600"
              : "bg-[#0B6EA9] text-white"
          }`}
        >
          {isSoldOut ? "SOLD OUT" : "Add +"}
        </button>
      </div>

      {/* VARIANTS */}
      {sellable.length > 0 ? (
        <div className="mt-4">
          <div className="text-sm font-semibold text-gray-900">Choose size</div>
          <div className="mt-2 flex gap-2 flex-wrap">
            {sellable.map((v) => {
              const active = v.id === selectedId;
              return (
                <button
                  key={String(v.id)}
                  disabled={(() => {
                    const inv = invMap[String(v.id)];
                    const units = Number(inv?.qty_units ?? 0);
                    const g = Number(inv?.qty_g ?? 0);
                    return g > 0 ? g <= 0 : units <= 0;
                  })()}
                  onClick={() => setSelectedId(v.id)}
                  className={`px-3 py-2 rounded-xl border text-sm font-semibold ${
                    active
                      ? "border-[#0B6EA9] bg-[#EAF4FB] text-[#0B6EA9]"
                      : "bg-white text-gray-800"
                  } ${
                    (() => {
                      const inv = invMap[String(v.id)];
                      const units = Number(inv?.qty_units ?? 0);
                      const g = Number(inv?.qty_g ?? 0);
                      const out = g > 0 ? g <= 0 : units <= 0;
                      return out ? "opacity-50" : "";
                    })()
                  }`}
                >
                  {variantTitle(v)}
                  {(() => {
                    const inv = invMap[String(v.id)];
                    const units = Number(inv?.qty_units ?? 0);
                    const g = Number(inv?.qty_g ?? 0);
                    const out = g > 0 ? g <= 0 : units <= 0;
                    const text = g > 0 ? fmtKgFromG(g) : `${units}`;
                    return (
                      <span className={`ml-2 text-xs ${out ? "text-red-600" : "text-gray-500"}`}>
                        {out ? "0" : text}
                      </span>
                    );
                  })()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}