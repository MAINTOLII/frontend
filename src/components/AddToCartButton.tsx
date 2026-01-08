"use client";

import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/context/CartContext";
import { fetchVariantsByProductIds } from "@/lib/db";

export default function AddToCartButton({ productId }: { productId: string }) {
  const { items, addItem, setQty } = useCart();

  const [variantId, setVariantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load variants for this product and pick the cheapest SELLABLE one
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const vars = await fetchVariantsByProductIds([productId]);

        // sellable = active + has sell_price
        const sellable = (vars as any[])
          .filter((v) => v && (v.is_active ?? true) && v.sell_price != null)
          .slice()
          .sort((a, b) => Number(a.sell_price) - Number(b.sell_price));

        const cheapest = sellable[0] ?? null;
        if (!alive) return;
        setVariantId(cheapest?.id ?? null);
      } catch (e) {
        console.error("AddToCartButton: failed to load variants", e);
        if (!alive) return;
        setVariantId(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [productId]);

  // Hide button entirely if product has no sellable variants (your rule)
  if (!loading && !variantId) return null;

  const cartItems = (Array.isArray(items) ? (items as any[]) : []) as any[];
  const item = cartItems.find(
    (i) => String(i?.productId) === String(productId) && String(i?.variantId) === String(variantId)
  );

  const qty = Number(item?.qty ?? 0);

  // Loading state
  if (loading) {
    return (
      <button
        disabled
        className="mt-2 w-full h-10 rounded-xl border-2 border-gray-200 bg-gray-100 text-gray-400 font-bold"
      >
        ...
      </button>
    );
  }

  // NOT in cart → show Add
  if (!item) {
    return (
      <button
        onClick={() => (addItem as any)(productId, variantId, 1)}
        className="mt-2 w-full h-10 bg-[#0B6EA9] rounded-xl border-2 border-[#0B6EA9] text-white font-bold active:scale-[0.99] transition"
      >
        Add +
      </button>
    );
  }

  // IN cart → show − qty +
  return (
    <div className="mt-2 flex items-center gap-4">
      <button
        onClick={() => (setQty as any)(productId, variantId, qty - 1)}
        className="h-10 w-10 rounded-xl border bg-white text-[#0B6EA9] text-2xl font-bold grid place-items-center"
      >
        −
      </button>

      <span className="min-w-[60px] text-center text-black font-bold text-xl">
        {qty}
      </span>

      <button
        onClick={() => (setQty as any)(productId, variantId, qty + 1)}
        className="h-10 w-10 rounded-xl border bg-white text-[#0B6EA9] text-2xl font-bold grid place-items-center"
      >
        +
      </button>
    </div>
  );
}
