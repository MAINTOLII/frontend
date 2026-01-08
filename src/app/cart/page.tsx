"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useCart } from "@/context/CartContext";

// If your supabase client file path is different, change this import.
import { supabase } from "@/lib/supabaseClient";

type CartItem = {
  productId: string; // ✅ UUID
  variantId: string | null; // ✅ UUID (null only if you ever allow no-variant products)
  qty: number;
};

function money(n: number) {
  return `$${Number(n || 0).toFixed(2)}`;
}

function safeUrl(u: any) {
  const s = String(u ?? "").trim();
  return s || "";
}

export default function CartPage() {
  const { items, setQty, removeItem, clearCart } = useCart();
  const cartItems: CartItem[] = Array.isArray(items) ? (items as any) : [];

  // Loaded data
  const [productMap, setProductMap] = useState<Record<string, any>>({});
  const [variantMap, setVariantMap] = useState<Record<string, any>>({});

  // Images
  // - variantPrimary[variantId] => url
  // - productFallback[productId] => url (any image from any variant)
  const [variantPrimary, setVariantPrimary] = useState<Record<string, string>>({});
  const [productFallback, setProductFallback] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;

    (async () => {
      const pids = Array.from(new Set(cartItems.map((x) => String(x.productId)).filter(Boolean)));
      const vids = Array.from(
        new Set(cartItems.map((x) => x.variantId).filter((v): v is string => !!v))
      );

      if (!pids.length) {
        if (!alive) return;
        setProductMap({});
        setVariantMap({});
        setVariantPrimary({});
        setProductFallback({});
        return;
      }

      // 1) Products
      const { data: products, error: pErr } = await supabase
        .from("products")
        .select("id,name,slug,is_active")
        .in("id", pids);
      if (pErr) console.error("cart products error", pErr);

      // 2) Variants (only those in cart)
      const { data: variants, error: vErr } = await supabase
        .from("product_variants")
        .select("id,product_id,name,variant_type,pack_size_g,sell_price,is_active")
        .in("id", vids);
      if (vErr) console.error("cart variants error", vErr);

      // 3) Images (for all variants under these products)
      //    Needed for fallback: “if this variant has no photo use other variants photo”
      //    If you have lots of images, we only pull minimal fields.
      const { data: allVarsForProducts, error: pvErr } = await supabase
        .from("product_variants")
        .select("id,product_id")
        .in("product_id", pids);
      if (pvErr) console.error("cart product_variants (for images) error", pvErr);

      const allVariantIds = Array.from(
        new Set((allVarsForProducts ?? []).map((r: any) => String(r.id)).filter(Boolean))
      );

      let imgs: any[] = [];
      if (allVariantIds.length) {
        const { data: images, error: iErr } = await supabase
          .from("product_variant_images")
          .select("variant_id,url,is_primary,sort_order")
          .in("variant_id", allVariantIds)
          .order("is_primary", { ascending: false })
          .order("sort_order", { ascending: true });
        if (iErr) console.error("cart variant images error", iErr);
        imgs = images ?? [];
      }

      if (!alive) return;

      // Build maps
      const pm: Record<string, any> = {};
      for (const p of products ?? []) pm[String((p as any).id)] = p;

      const vm: Record<string, any> = {};
      for (const v of variants ?? []) vm[String((v as any).id)] = v;

      // Variant primary image
      const vPrimary: Record<string, string> = {};
      for (const im of imgs) {
        const vid = String(im.variant_id);
        const url = safeUrl(im.url);
        if (!url) continue;
        if (!vPrimary[vid]) vPrimary[vid] = url; // already ordered: primary first
      }

      // Product fallback image (any from any variant)
      const pFallback: Record<string, string> = {};
      // Need product_id per variant_id
      const variantToProduct: Record<string, string> = {};
      for (const row of allVarsForProducts ?? []) {
        variantToProduct[String(row.id)] = String(row.product_id);
      }
      for (const im of imgs) {
        const vid = String(im.variant_id);
        const pid = variantToProduct[vid];
        const url = safeUrl(im.url);
        if (!pid || !url) continue;
        if (!pFallback[pid]) pFallback[pid] = url;
      }

      setProductMap(pm);
      setVariantMap(vm);
      setVariantPrimary(vPrimary);
      setProductFallback(pFallback);
    })();

    return () => {
      alive = false;
    };
  }, [cartItems]);

  const rows = useMemo(() => {
    const list = (cartItems ?? [])
      .map((ci) => {
        const product = productMap[String(ci.productId)];
        const variant = ci.variantId ? variantMap[String(ci.variantId)] : null;

        if (!product) return null;
        // Your rule: only show products that have a sellable variant.
        if (!variant) return null;
        if (variant.is_active === false) return null;
        if (variant.sell_price == null) return null;

        const price = Number(variant.sell_price ?? 0);
        const qty = Number(ci.qty ?? 1);
        const lineTotal = price * qty;

        // Image fallback:
        // 1) this variant primary
        // 2) other variants of same product
        // 3) if none => hide image
        const imgUrl =
          (ci.variantId ? variantPrimary[String(ci.variantId)] : "") ||
          productFallback[String(ci.productId)] ||
          "";

        const variantLabel = String(variant.name ?? "").trim();
        const title = variantLabel ? `${product.name} (${variantLabel})` : product.name;

        return {
          key: `${ci.productId}-${ci.variantId}`,
          ci,
          title,
          slug: product.slug,
          imgUrl,
          price,
          qty,
          lineTotal,
        };
      })
      .filter(Boolean) as any[];

    return list;
  }, [cartItems, productMap, variantMap, variantPrimary, productFallback]);

  const subtotal = useMemo(() => rows.reduce((s, r) => s + (r?.lineTotal ?? 0), 0), [rows]);
  const deliveryFee = rows.length ? 0 : 0; // keep simple
  const total = subtotal + deliveryFee;

  const canCheckout = rows.length > 0;

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-md px-4 py-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-extrabold">Cart</h1>
          {rows.length ? (
            <button
              onClick={clearCart}
              className="text-xs font-semibold text-red-600 hover:underline"
            >
              Clear
            </button>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <div className="mt-6 border rounded-2xl p-8 text-center">
            <p className="text-base font-semibold">Your cart is empty</p>
            <p className="text-sm text-gray-600 mt-1">Add items to checkout.</p>
            <Link
              href="/"
              className="inline-flex mt-5 px-5 py-2 rounded-full bg-[#0B6EA9] text-white text-sm font-semibold"
            >
              Start shopping
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {rows.map((r) => (
              <div key={r.key} className="border rounded-2xl p-3">
                <div className="flex gap-3">
                  {r.imgUrl ? (
                    <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0 grid place-items-center">
                      <Image
                        src={r.imgUrl}
                        alt={r.title}
                        width={120}
                        height={120}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-gray-50 flex-shrink-0 grid place-items-center text-xs text-gray-400">
                      No photo
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={r.slug ? `/product/${r.slug}` : "#"}
                          className="font-semibold line-clamp-2"
                        >
                          {r.title}
                        </Link>
                        <div className="mt-1 text-sm text-gray-600">{money(r.price)}</div>
                      </div>

                      <button
                        onClick={() => removeItem(r.ci.productId, r.ci.variantId)}
                        className="p-2 rounded-xl hover:bg-gray-50 text-sm text-gray-700"
                        aria-label="Remove item"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between">
                      <div className="inline-flex items-center border rounded-full overflow-hidden">
                        <button
                          onClick={() =>
                            setQty(
                              r.ci.productId,
                              r.ci.variantId,
                              Math.max(1, Number(r.qty) - 1)
                            )
                          }
                          className="px-4 py-2 hover:bg-gray-50"
                        >
                          −
                        </button>
                        <span className="px-4 py-2 text-sm font-semibold">{r.qty}</span>
                        <button
                          onClick={() =>
                            setQty(r.ci.productId, r.ci.variantId, Number(r.qty) + 1)
                          }
                          className="px-4 py-2 hover:bg-gray-50"
                        >
                          +
                        </button>
                      </div>

                      <div className="text-sm font-extrabold">{money(r.lineTotal)}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <div className="border rounded-2xl p-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Subtotal</span>
                <span className="font-semibold">{money(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm mt-2">
                <span className="text-gray-700">Delivery</span>
                <span className="font-semibold">{money(deliveryFee)}</span>
              </div>
              <div className="border-t mt-3 pt-3 flex justify-between">
                <span className="font-extrabold">Total</span>
                <span className="font-extrabold">{money(total)}</span>
              </div>

              <Link
                href={canCheckout ? "/checkout" : "#"}
                className={`mt-4 inline-flex w-full justify-center rounded-full py-3 text-sm font-semibold ${
                  !canCheckout
                    ? "bg-gray-200 text-gray-500 pointer-events-none"
                    : "bg-[#0B6EA9] text-white hover:opacity-95"
                }`}
              >
                Checkout
              </Link>

              <div className="mt-3 text-xs text-gray-500 text-center">
                Secure checkout • Fast delivery
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
