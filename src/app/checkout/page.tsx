"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useCart } from "@/context/CartContext";
import { supabase } from "@/lib/supabaseClient";

type CartItem = {
  productId: any; // uuid string or number
  variantId: any; // uuid string or number
  qty: number;
};

type ProductLite = { id: any; name: string; slug: string };
type VariantAny = Record<string, any>;

function moneyUSD(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0));
}

function toNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isNumericId(x: any) {
  const s = String(x ?? "").trim();
  return s !== "" && /^\d+$/.test(s);
}

/** returns either number[] (if all numeric) OR string[] */
function normalizeIdList(list: any[]) {
  const raw = Array.from(new Set((list ?? []).filter((x) => x != null)));
  const allNumeric = raw.length > 0 && raw.every(isNumericId);
  return allNumeric ? raw.map((x) => Number(String(x).trim())) : raw.map((x) => String(x));
}

function supaErrToText(err: any) {
  if (!err) return "Unknown error";
  const msg = err?.message ?? "";
  const code = err?.code ?? "";
  const details = err?.details ?? "";
  const hint = err?.hint ?? "";
  return [msg, code && `code=${code}`, details && `details=${details}`, hint && `hint=${hint}`]
    .filter(Boolean)
    .join(" | ");
}

function variantLabel(v: VariantAny) {
  // Your schema doesn't have `label`, so try common fields
  return (
    v?.label ??
    v?.name ??
    v?.title ??
    v?.variant_name ??
    v?.pack ??
    v?.size ??
    v?.weight ??
    v?.unit ??
    v?.sku ??
    ""
  );
}

export default function CheckoutPage() {
  const { items, clearCart } = useCart();
  const cartItems = (Array.isArray(items) ? (items as any) : []) as CartItem[];

  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [done, setDone] = useState(false);
  const [orderId, setOrderId] = useState<any>(null);

  // Simple form
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");

  const [productMap, setProductMap] = useState<Record<string, ProductLite>>({});
  const [variantMap, setVariantMap] = useState<Record<string, VariantAny>>({});

  // Load products + variants needed
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);

        // You wanted: only items with variants are sellable
        const safe = (cartItems || []).filter((x) => x && x.variantId != null);

        const productIds = normalizeIdList(safe.map((x) => x.productId));
        const variantIds = normalizeIdList(safe.map((x) => x.variantId));

        if (!productIds.length || !variantIds.length) {
          if (!alive) return;
          setProductMap({});
          setVariantMap({});
          setLoading(false);
          return;
        }

        const pRes = await supabase.from("products").select("id,name,slug").in("id", productIds as any);
        if (pRes.error) throw new Error(`CHECKOUT products query failed: ${supaErrToText(pRes.error)}`);

        // ✅ Use "*" so we don't break when columns differ (no label, etc.)
        const vRes = await supabase.from("product_variants").select("*").in("id", variantIds as any);
        if (vRes.error) {
          throw new Error(
            `CHECKOUT variants query failed: ${supaErrToText(vRes.error)} | tried ids=${JSON.stringify(variantIds)}`
          );
        }

        const pm: Record<string, ProductLite> = {};
        for (const p of (pRes.data ?? []) as any[]) pm[String(p.id)] = p;

        const vm: Record<string, VariantAny> = {};
        for (const v of (vRes.data ?? []) as any[]) vm[String(v.id)] = v;

        if (!alive) return;
        setProductMap(pm);
        setVariantMap(vm);
      } catch (e: any) {
        console.error(String(e?.message ?? e));
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Rows: require variant + active (if column exists) + price>0
  const rows = useMemo(() => {
    const safe = (cartItems || []).filter((x) => x && x.variantId != null);

    return safe
      .map((ci) => {
        const p = productMap[String(ci.productId)];
        const v = variantMap[String(ci.variantId)];
        if (!p || !v) return null;

        // if your schema has is_active
        if (v.is_active === false) return null;

        // support different schemas: sell_price OR price OR base_price-like fields
        const price = toNumber(v.sell_price ?? v.price ?? v.sale_price ?? v.amount ?? 0);
        if (!(price > 0)) return null;

        const qty = Math.max(1, Number(ci.qty ?? 1));
        const lab = variantLabel(v);
        const labelText = lab ? ` (${lab})` : "";

        return {
          key: `${String(ci.productId)}-${String(ci.variantId)}`,
          productId: ci.productId,
          variantId: ci.variantId,
          name: `${p.name}${labelText}`,
          unitPrice: price,
          qty,
          lineTotal: price * qty,
        };
      })
      .filter(Boolean) as Array<{
      key: string;
      productId: any;
      variantId: any;
      name: string;
      unitPrice: number;
      qty: number;
      lineTotal: number;
    }>;
  }, [cartItems, productMap, variantMap]);

  const subtotal = useMemo(() => rows.reduce((s, r) => s + r.lineTotal, 0), [rows]);
  const deliveryFee = subtotal > 0 ? 1.99 : 0;
  const total = subtotal + deliveryFee;

  async function getOrCreateCustomerId(phoneRaw: string, nameRaw: string) {
    const phoneClean = String(phoneRaw ?? "").trim();
    const nameClean = String(nameRaw ?? "").trim() || "Customer";

    const found = await supabase.from("customers").select("id").eq("phone", phoneClean).maybeSingle();
    if (found.error) throw new Error(`Customer lookup failed: ${supaErrToText(found.error)}`);
    if (found.data?.id) return found.data.id;

    const created = await supabase.from("customers").insert({ name: nameClean, phone: phoneClean }).select("id").single();
    if (created.error) throw new Error(`Customer create failed: ${supaErrToText(created.error)}`);
    return created.data.id;
  }

  async function placeOrder() {
    if (placing) return;

    if (rows.length === 0) {
      alert("No sellable items (variant must be active and have a price).");
      return;
    }

    const n = name.trim();
    const p = phone.trim();
    const a = address.trim();
    if (!n || !p || !a) {
      alert("Please fill Name, Phone, and Address.");
      return;
    }

    setPlacing(true);

    try {
      const customerId = await getOrCreateCustomerId(p, n);

      // ✅ ALWAYS PENDING (match your real orders schema)
      const orderInsert = await supabase
        .from("orders")
        .insert({
          customer_id: customerId,
          customer_phone: p,
          channel: "website",
          status: "pending",
          payment_method: "cod",
          payment_status: "unpaid",
          address: a,
          note: note.trim() ? note.trim() : null,
          currency: "USD",
          subtotal: Number.isFinite(Number(subtotal)) ? Number(subtotal) : 0,
          delivery_fee: Number.isFinite(Number(deliveryFee)) ? Number(deliveryFee) : 0,
          discount: 0,
          total: Number.isFinite(Number(total)) ? Number(total) : 0,
          amount_paid: 0,
        })
        .select("id")
        .single();

      if (orderInsert.error) throw new Error(`Order insert failed: ${supaErrToText(orderInsert.error)}`);
      const newOrderId = orderInsert.data?.id;
      if (!newOrderId) throw new Error("Order insert failed: missing id");

      const payload = rows.map((r) => {
        const v = variantMap[String(r.variantId)] || {};
        const vt = String(v.variant_type || "unit"); // "weight" | "unit"

        // Website cart qty = count. For weight variants we treat it as KG count -> grams.
        const qtyG = vt === "weight" ? Math.max(0, Number(r.qty) * 1000) : null;
        const qtyUnits = vt === "weight" ? null : Math.max(0, Number(r.qty));

        // For weight: unitPrice is per KG, line_total uses KG
        const lineTotal = vt === "weight" ? Number(r.unitPrice) * (Number(qtyG || 0) / 1000) : Number(r.unitPrice) * Number(qtyUnits || 0);

        return {
          order_id: newOrderId,
          variant_id: r.variantId,
          qty_g: qtyG,
          qty_units: qtyUnits,
          unit_price: Number(r.unitPrice),
          line_total: Number(lineTotal),
        };
      });

      const itemsInsert = await supabase.from("order_items").insert(payload);
      if (itemsInsert.error) throw new Error(`Order items insert failed: ${supaErrToText(itemsInsert.error)}`);

      clearCart();
      setOrderId(newOrderId);
      setDone(true);
    } catch (e: any) {
      console.error(String(e?.message ?? e));
      alert(String(e?.message ?? "Failed to place order"));
    } finally {
      setPlacing(false);
    }
  }

  if (done) {
    return (
      <main className="min-h-screen bg-white text-black">
        <div className="mx-auto max-w-md px-4 py-10">
          <div className="border rounded-2xl p-6 text-center">
            <div className="text-4xl">✅</div>
            <div className="mt-3 text-lg font-extrabold">Order created</div>
            <div className="mt-1 text-sm text-gray-600">
              Status: <span className="font-semibold">PENDING</span>
            </div>
            {orderId ? <div className="mt-1 text-xs text-gray-500">Order ID: {String(orderId)}</div> : null}

            <div className="mt-6 flex gap-2 justify-center">
              <Link href="/" className="h-10 px-4 rounded-full bg-[#0B6EA9] text-white text-sm font-bold grid place-items-center">
                Continue shopping
              </Link>
              <Link href="/cart" className="h-10 px-4 rounded-full border text-sm font-bold grid place-items-center">
                Back to cart
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#F4F6F8] text-black pb-24">
      <div className="mx-auto max-w-md px-4 py-4">
        <Link href="/cart" className="text-sm text-[#0B6EA9] font-semibold">
          ← Back to cart
        </Link>

        <h1 className="mt-2 text-xl font-extrabold">Checkout</h1>
        <p className="text-xs text-gray-600">All checkouts save as PENDING orders.</p>

        <div className="mt-4 bg-white border rounded-2xl p-4">
          <div className="text-sm font-bold text-gray-900">Delivery details</div>

          <div className="mt-3 space-y-3">
            <label className="block text-xs text-gray-600">
              Full name
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" />
            </label>

            <label className="block text-xs text-gray-600">
              Phone
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" />
            </label>

            <label className="block text-xs text-gray-600">
              Address
              <input value={address} onChange={(e) => setAddress(e.target.value)} className="mt-1 w-full h-11 rounded-xl border px-3 text-sm" />
            </label>

            <label className="block text-xs text-gray-600">
              Note (optional)
              <textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2 text-sm" rows={3} />
            </label>
          </div>
        </div>

        <div className="mt-3 bg-white border rounded-2xl p-4">
          <div className="text-sm font-bold text-gray-900">Order summary</div>

          {loading ? (
            <div className="mt-3 text-sm text-gray-600">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">
              No sellable items (variant must be active and have a price).
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {rows.map((r) => (
                <div key={r.key} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{r.name}</div>
                    <div className="text-xs text-gray-500">
                      {r.qty} × {moneyUSD(r.unitPrice)}
                    </div>
                  </div>
                  <div className="font-extrabold text-gray-900">{moneyUSD(r.lineTotal)}</div>
                </div>
              ))}

              <div className="mt-3 border-t pt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="font-bold">{moneyUSD(subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Delivery</span>
                  <span className="font-bold">{moneyUSD(deliveryFee)}</span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-extrabold">Total</span>
                  <span className="font-extrabold">{moneyUSD(total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={placeOrder}
          disabled={placing || loading || rows.length === 0}
          className={`mt-4 w-full h-12 rounded-2xl font-extrabold text-sm shadow-sm transition active:scale-[0.99] ${
            placing || loading || rows.length === 0 ? "bg-gray-200 text-gray-500" : "bg-[#0B6EA9] text-white"
          }`}
        >
          {placing ? "Placing…" : `Place order • ${moneyUSD(total)}`}
        </button>
      </div>
    </main>
  );
}