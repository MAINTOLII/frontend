"use client";

import TopNavbar from "@/components/TopNavbar";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabaseClient";

function normalizeTag(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

function moneyUSD(n: number) {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

export default function SearchResultsPage() {
  const params = useParams() as { tag?: string };
  const decodedTag = normalizeTag(decodeURIComponent(params?.tag ?? ""));

  const [products, setProducts] = useState<any[]>([]);
  const [productVariants, setProductVariants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      try {
        // 1) Load products (include tags so we can match)
        const pRes = await supabase
          .from("products")
          .select("id,name,slug,tags")
          .limit(5000);

        if (!alive) return;
        const prods = Array.isArray(pRes.data) ? pRes.data : [];
        setProducts(prods);

        // 2) Load variants for matched products only (fast)
        const matchedIds = prods
          .filter((p: any) => {
            const tags = Array.isArray(p?.tags)
              ? p.tags.map((t: any) => normalizeTag(t))
              : [];
            return decodedTag ? tags.includes(decodedTag) : false;
          })
          .map((p: any) => p.id);

        if (!decodedTag || matchedIds.length === 0) {
          setProductVariants([]);
          return;
        }

        const vRes = await supabase
          .from("product_variants")
          .select("id,product_id,name,variant_type,sell_price,is_active")
          .in("product_id", matchedIds)
          .eq("is_active", true);

        if (!alive) return;
        setProductVariants(Array.isArray(vRes.data) ? vRes.data : []);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [decodedTag]);

  const matched = useMemo(() => {
    if (!decodedTag) return [];

    return products.filter((p: any) => {
      const tags = Array.isArray(p?.tags)
        ? p.tags.map((t: any) => normalizeTag(t))
        : [];
      return tags.includes(decodedTag);
    });
  }, [products, decodedTag]);

  function getBestVariant(productId: string | number) {
    const vars = productVariants.filter((v: any) => v.product_id === productId);
    if (vars.length === 0) return { price: null as number | null };

    // choose lowest sell_price among active variants
    const best = vars.reduce((min: any, v: any) => {
      const a = Number(min?.sell_price ?? Infinity);
      const b = Number(v?.sell_price ?? Infinity);
      return b < a ? v : min;
    }, vars[0]);

    const price = best?.sell_price == null ? null : Number(best.sell_price);
    return { price };
  }

  // We keep images simple to avoid DB schema issues (some projects don't have product_images table).
  function getPrimaryImageUrl() {
    return "/example.png";
  }

  return (
    <>
      <TopNavbar />

      <main className="max-w-md mx-auto p-4 bg-white min-h-screen text-[#0B6EA9] flex flex-col gap-4">
        {/* Heading */}
        <h2 className="text-lg font-semibold">
          Results for: <span className="font-bold">&quot;{decodedTag}&quot;</span>
        </h2>

        {/* Loading State */}
        {loading && <div className="mt-10 text-center text-base">Loading products…</div>}

        {/* No Results */}
        {!loading && matched.length === 0 && (
          <div className="text-center mt-8 text-base">
            No results found.
            <br />
            <a
              href="https://wa.me/252622073874"
              className="underline font-bold text-[#0B6EA9]"
            >
              Contact us on WhatsApp 📩
            </a>
          </div>
        )}

        {/* Product Grid */}
        {!loading && matched.length > 0 && (
          <section className="grid grid-cols-2 gap-4">
            {matched.map((p: any) => {
              const img = getPrimaryImageUrl();
              const { price } = getBestVariant(p.id);

              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl shadow-sm p-2 flex flex-col gap-2"
                >
                  <Link href={`/product/${p.slug}`} className="block">
                    <div className="relative">
                      <Image
                        src={img}
                        alt={p.name ?? "Product"}
                        width={200}
                        height={200}
                        className="object-contain w-full h-40 rounded-lg bg-white"
                      />
                    </div>

                    <p className="mt-2 text-sm font-medium line-clamp-2">{p.name}</p>

                    <div className="mt-1 flex items-center gap-2">
                      <span className="font-bold text-md">
                        {price == null ? "—" : moneyUSD(price)}
                      </span>
                    </div>
                  </Link>

                  <button
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("cart:add", { detail: { productId: p.id } })
                      )
                    }
                    className="w-full bg-[#0B6EA9] text-white rounded-full py-2 mt-auto"
                  >
                    + Add to Cart
                  </button>
                </div>
              );
            })}
          </section>
        )}
      </main>
    </>
  );
}