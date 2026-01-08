import { supabase } from "@/lib/supabaseClient";

/** =========================
 * Types (minimal – enough for UI)
 ========================= */
export type SubcategoryRow = {
  id: string;
  category_id: string;
  slug: string;
  name_en: string;
  name_so: string;
  img: string | null;
};

export type SubSubcategoryRow = {
  id: string;
  subcategory_id: string;
  slug: string;
  name_en: string;
  name_so: string;
  img: string | null;
};

export type ProductRow = {
  id: string;
  subsubcat_id: string;
  name: string;
  slug: string;
  brand: string | null;
  description: string | null;
  tags: string[];
  is_active: boolean | null;
};

export type VariantRow = {
  id: string;
  product_id: string;
  name: string;
  variant_type: string; // weight | unit (stored as text)
  pack_size_g: number | null;
  sell_price: number | string | null;
  sku?: string | null;
  is_active: boolean | null;
};

export type VariantImageRow = {
  id: string;
  variant_id: string;
  url: string;
  is_primary: boolean;
  sort_order: number;
};

export type CategoryRow = {
  id: string;
  slug: string;
  name_en: string;
  name_so: string;
  img: string | null;
};

/** =========================
 * Helpers
 ========================= */
export function safeImg(src: any) {
  const s = String(src ?? "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  if (s.startsWith("/")) return s;
  return "";
}

/** =========================
 * Home page helpers
 ========================= */
export async function getCategoriesWithSubcategories() {
  const { data: cats, error: catErr } = await supabase
    .from("categories")
    .select("id,slug,name_en,name_so,img")
    .order("created_at", { ascending: true });

  if (catErr) throw catErr;

  const { data: subs, error: subErr } = await supabase
    .from("subcategories")
    .select("id,category_id,slug,name_en,name_so,img")
    .order("created_at", { ascending: true });

  if (subErr) throw subErr;

  const categories = (cats ?? []) as CategoryRow[];
  const subcategories = (subs ?? []) as SubcategoryRow[];

  return categories.map((cat) => ({
    ...cat,
    subcats: subcategories.filter((s) => s.category_id === cat.id),
  }));
}

/** =========================
 * Product page helpers
 ========================= */
export async function fetchProductBySlug(slug: string) {
  const { data, error } = await supabase
    .from("products")
    .select("id,subsubcat_id,name,slug,brand,description,tags,is_active")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as ProductRow | null;
}

// Convenience single-id wrappers
export async function fetchVariantsByProductId(productId: string) {
  return fetchVariantsByProductIds([productId]);
}

export async function fetchImagesByProductId(productId: string) {
  return fetchImagesByProductIds([productId]);
}

/** =========================
 * Cart helpers (by ids)
 ========================= */
export async function getProductsByIds(ids: string[]) {
  const unique = Array.from(new Set((ids || []).map(String))).filter(Boolean);
  if (!unique.length) return [];

  const { data, error } = await supabase
    .from("products")
    .select("id,subsubcat_id,name,slug,brand,description,tags,is_active")
    .in("id", unique);

  if (error) throw error;
  return (data ?? []) as ProductRow[];
}

export async function getVariantsByIds(ids: string[]) {
  const unique = Array.from(new Set((ids || []).map(String))).filter(Boolean);
  if (!unique.length) return [];

  const { data, error } = await supabase
    .from("product_variants")
    .select("id,product_id,name,variant_type,pack_size_g,sell_price,sku,is_active")
    .in("id", unique);

  if (error) throw error;
  return (data ?? []) as VariantRow[];
}

/** =========================
 * Subcategory page helpers
 ========================= */

// 1) subcategory by slug
export async function fetchSubcategoryBySlug(slug: string) {
  const { data, error } = await supabase
    .from("subcategories")
    .select("id,category_id,slug,name_en,name_so,img")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as SubcategoryRow | null;
}

// 2) subsubcategories under a subcategory
export async function fetchSubSubcategoriesBySubcategoryId(subcategoryId: string) {
  const { data, error } = await supabase
    .from("subsubcategories")
    .select("id,subcategory_id,slug,name_en,name_so,img")
    .eq("subcategory_id", subcategoryId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as SubSubcategoryRow[];
}

// 3) products by subcategory id (NEW DB: products link to subsubcat_id, so we join manually)
export async function fetchProductsBySubcategoryId(subcategoryId: string) {
  // get subsub ids first
  const { data: subsubs, error: subsubErr } = await supabase
    .from("subsubcategories")
    .select("id")
    .eq("subcategory_id", subcategoryId);

  if (subsubErr) throw subsubErr;

  const ids = (subsubs ?? []).map((x: any) => x.id);
  if (ids.length === 0) return [];

  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id,subsubcat_id,name,slug,brand,description,tags,is_active")
    .in("subsubcat_id", ids)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (prodErr) throw prodErr;
  return (products ?? []) as ProductRow[];
}

// 4) variants by product ids (NEW DB fields)
export async function fetchVariantsByProductIds(productIds: string[]) {
  const unique = Array.from(new Set(productIds)).filter(Boolean);
  if (!unique.length) return [];

  const { data, error } = await supabase
    .from("product_variants")
    .select("id,product_id,name,variant_type,pack_size_g,sell_price,sku,is_active")
    .in("product_id", unique)
    .eq("is_active", true)
    .order("sell_price", { ascending: true });

  if (error) throw error;
  return (data ?? []) as VariantRow[];
}

// 5) images by product ids (NEW DB: images are per VARIANT, so fetch variants then images)
export async function fetchImagesByProductIds(productIds: string[]) {
  const variants = await fetchVariantsByProductIds(productIds);
  const variantIds = variants.map((v) => v.id);
  if (!variantIds.length) return [];

  const { data, error } = await supabase
    .from("product_variant_images")
    .select("id,variant_id,url,is_primary,sort_order")
    .in("variant_id", variantIds)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as VariantImageRow[];
}