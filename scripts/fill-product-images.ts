#!/usr/bin/env -S npx tsx
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) {
  const fullPath = path.join(process.cwd(), file);
  if (fs.existsSync(fullPath)) process.loadEnvFile(fullPath);
}

const STORE_NAME = process.env.PRODUCT_IMAGE_STORE ?? "Mustaffa Center";
const APPLY = process.argv.includes("--apply");
const API_URL = "https://commons.wikimedia.org/w/api.php";
const USER_AGENT = "MallRetailSystem/0.1 (product sample image lookup)";
const PLAN_PATH = path.join(process.env.TMPDIR ?? "/tmp", "mall-retail-product-image-plan.json");

interface Product {
  id: string;
  name: string;
  category: { name: string } | null;
}

interface CommonsPage {
  pageid: number;
  index?: number;
  title: string;
  imageinfo?: {
    thumburl?: string;
    mime?: string;
    extmetadata?: Record<string, { value?: string }>;
  }[];
}

interface CommonsResponse {
  query?: { pages?: Record<string, CommonsPage> };
}

interface OpenverseResult {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  detail_url: string;
  creator: string;
  license: string;
  license_version: string;
  license_url: string;
  tags: { name: string }[];
}

interface Match {
  productId: string;
  productName: string;
  product: Product;
  imageUrl: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  creator: string;
}

function plainText(value: string | undefined): string {
  return (value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function isCommerciallyUsableLicense(value: string): boolean {
  if (/non.?commercial|cc by-nc/i.test(value)) return false;
  return /^(?:cc0(?:\b|-)|public domain\b|pd(?:\b|-)|cc by(?:-sa|-nd)?(?:\s|-)\d)/i.test(value);
}

function searchTerms(product: Product): string[] {
  const simpleName = cleanProductName(product.name);
  const terms = [simpleName, [simpleName, product.category?.name].filter(Boolean).join(" "), product.category?.name];
  return [...new Set(terms.filter((term): term is string => Boolean(term)))];
}

function cleanProductName(name: string): string {
  return name
    .replace(/\b\d+(?:\.\d+)?\s*(?:lb|lbs|oz|g|kg|ml|l|ct|pc|pcs|bunch|pack)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasProductRelevance(page: CommonsPage, product: Product): boolean {
  const ignoredTerms = new Set(["and", "for", "the", "with", "fresh", "frozen", "whole", "pure", "style"]);
  const productTerms = cleanProductName(product.name)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !ignoredTerms.has(term));
  const metadata = page.imageinfo?.[0]?.extmetadata;
  const searchableTerms = new Set([page.title, metadata?.ImageDescription?.value, metadata?.Categories?.value]
    .join(" ")
    .replace(/<[^>]*>/g, " ")
    .toLowerCase()
    .split(/[^a-z0-9]+/));

  return productTerms.some((term) => searchableTerms.has(term));
}

async function searchCommons(query: string): Promise<CommonsPage[]> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: "6",
    gsrlimit: "10",
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "480",
    format: "json",
    origin: "*",
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${API_URL}?${params}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 429 || response.status === 503) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      continue;
    }
    if (!response.ok) throw new Error(`Wikimedia Commons returned HTTP ${response.status}`);
    const result = (await response.json()) as CommonsResponse;
    return Object.values(result.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  }
  throw new Error("Wikimedia Commons rate limit persisted after five retries.");
}

function hasOpenverseRelevance(result: OpenverseResult, product: Product): boolean {
  const ignoredTerms = new Set(["and", "for", "the", "with", "fresh", "frozen", "whole", "pure", "style"]);
  const productTerms = cleanProductName(product.name)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !ignoredTerms.has(term));
  const resultTerms = new Set([result.title, ...result.tags.map((tag) => tag.name)]
    .join(" ")
    .toLowerCase()
    .split(/[^a-z0-9]+/));

  return productTerms.some((term) => resultTerms.has(term));
}

function isCommercialOpenverseLicense(result: OpenverseResult): boolean {
  return ["cc0", "pdm", "by", "by-sa", "by-nd"].includes(result.license.toLowerCase());
}

async function findImage(product: Product, usedPageIds: Set<number>): Promise<Match | null> {
  for (const query of searchTerms(product)) {
    const pages = await searchCommons(query);
    for (const page of pages) {
      if (usedPageIds.has(page.pageid)) continue;
      if (!hasProductRelevance(page, product)) continue;
      const image = page.imageinfo?.[0];
      const metadata = image?.extmetadata;
      const license = plainText(metadata?.LicenseShortName?.value);
      if (!image?.thumburl || !image.mime?.startsWith("image/") || !isCommerciallyUsableLicense(license)) continue;

      usedPageIds.add(page.pageid);
      return {
        productId: product.id,
        productName: product.name,
        product,
        imageUrl: image.thumburl,
        sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
        license,
        licenseUrl: plainText(metadata?.LicenseUrl?.value),
        creator: plainText(metadata?.Artist?.value),
      };
    }
  }
  return null;
}

async function findOpenverseImage(product: Product, usedIds: Set<string>): Promise<Match | null> {
  const query = cleanProductName(product.name);
  const params = new URLSearchParams({ q: query, page_size: "20", license_type: "commercial" });
  const response = await fetch(`https://api.openverse.org/v1/images/?${params}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Openverse returned HTTP ${response.status}`);
  const result = (await response.json()) as { results?: OpenverseResult[] };
  for (const image of result.results ?? []) {
    if (usedIds.has(image.id) || !image.thumbnail || !isCommercialOpenverseLicense(image)) continue;
    if (!hasOpenverseRelevance(image, product)) continue;
    usedIds.add(image.id);
    return {
      productId: product.id,
      productName: product.name,
      product,
      imageUrl: image.thumbnail,
      sourceUrl: image.detail_url,
      license: `${image.license.toUpperCase()} ${image.license_version}`,
      licenseUrl: image.license_url,
      creator: image.creator,
    };
  }
  return null;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id, name")
    .eq("name", STORE_NAME)
    .single();
  if (storeError || !store) throw new Error(storeError?.message ?? `Store not found: ${STORE_NAME}`);

  if (APPLY) {
    if (!fs.existsSync(PLAN_PATH)) throw new Error(`No image plan found at ${PLAN_PATH}; run a dry run first.`);
    const plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8")) as {
      storeId: string;
      storeName: string;
      complete: boolean;
      matches: Match[];
      unmatched: string[];
    };
    if (plan.storeId !== store.id || plan.storeName !== store.name) {
      throw new Error(`Image plan is for ${plan.storeName}, not ${store.name}.`);
    }
    if (!plan.complete) throw new Error("Image plan is partial; generate a full plan before applying.");
    const { data: emptyProducts, error: emptyProductsError } = await supabase
      .from("products")
      .select("id")
      .eq("store_id", store.id)
      .eq("is_active", true)
      .eq("has_variants", false)
      .is("image_url", null);
    if (emptyProductsError) throw new Error(emptyProductsError.message);
    const emptyProductIds = new Set((emptyProducts ?? []).map((product) => product.id));

    let updated = 0;
    for (const match of plan.matches) {
      if (!emptyProductIds.has(match.productId)) continue;
      const { error: updateError } = await supabase
        .from("products")
        .update({ image_url: match.imageUrl })
        .eq("id", match.productId)
        .eq("store_id", store.id)
        .is("image_url", null);
      if (updateError) {
        plan.unmatched.push(`${match.productName} (database update failed: ${updateError.message})`);
      } else {
        updated++;
      }
    }
    fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
    console.log(`Updated ${updated} products in ${store.name}.`);
    console.log(`${plan.unmatched.length} products remain unmatched.`);
    return;
  }

  const { data, error } = await supabase
    .from("products")
    .select("id, name, category:categories(name)")
    .eq("store_id", store.id)
    .eq("is_active", true)
    .eq("has_variants", false)
    .is("image_url", null)
    .order("name");
  if (error) throw new Error(error.message);

  const allProducts = (data ?? []) as unknown as Product[];
  if (process.argv.includes("--openverse-unmatched")) {
    if (!fs.existsSync(PLAN_PATH)) throw new Error(`No image plan found at ${PLAN_PATH}; run a dry run first.`);
    const plan = JSON.parse(fs.readFileSync(PLAN_PATH, "utf8")) as {
      storeId: string;
      storeName: string;
      complete: boolean;
      matches: Match[];
      unmatched: string[];
    };
    if (plan.storeId !== store.id || plan.storeName !== store.name || !plan.complete) {
      throw new Error("A complete image plan for this store is required before the Openverse fallback.");
    }
    const productsToTry = allProducts.filter((product) => plan.unmatched.includes(product.name));
    const usedIds = new Set<string>();
    const stillUnmatched: string[] = [];
    for (let index = 0; index < productsToTry.length; index++) {
      const product = productsToTry[index];
      try {
        const match = await findOpenverseImage(product, usedIds);
        if (match) plan.matches.push(match);
        else stillUnmatched.push(product.name);
      } catch (lookupError) {
        stillUnmatched.push(product.name);
        console.error(`Openverse lookup failed for ${product.name}: ${lookupError instanceof Error ? lookupError.message : lookupError}`);
      }
      if ((index + 1) % 10 === 0 || index + 1 === productsToTry.length) {
        console.log(`Checked ${index + 1}/${productsToTry.length} unmatched products`);
      }
      if (index + 1 < productsToTry.length) await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    plan.unmatched = stillUnmatched;
    fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
    console.log(`${plan.matches.length} licensed images planned; ${plan.unmatched.length} unmatched remain.`);
    console.log("No database records were changed. Run with --apply to use this plan.");
    return;
  }

  const limitArg = process.argv.find((argument) => argument.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : allProducts.length;
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer.");
  const products = allProducts.slice(0, limit);
  const usedPageIds = new Set<number>();
  const matches: Match[] = [];
  const unmatched: string[] = [];

  for (let index = 0; index < products.length; index++) {
    const product = products[index];
    try {
      const match = await findImage(product, usedPageIds);
      if (match) matches.push(match);
      else unmatched.push(product.name);
    } catch (lookupError) {
      unmatched.push(product.name);
      console.error(`Lookup failed for ${product.name}: ${lookupError instanceof Error ? lookupError.message : lookupError}`);
    }
    if ((index + 1) % 10 === 0 || index + 1 === products.length) {
      console.log(`Looked up ${index + 1}/${products.length} products`);
    }
    if (index + 1 < products.length) await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const plan = {
    storeId: store.id,
    storeName: store.name,
    complete: products.length === allProducts.length,
    productCount: products.length,
    matches,
    unmatched,
  };
  fs.writeFileSync(PLAN_PATH, JSON.stringify(plan, null, 2));
  console.log(`Saved image plan to ${PLAN_PATH}.`);
  console.log(`${matches.length} licensed unique images matched; ${unmatched.length} products unmatched.`);
  if (unmatched.length > 0) {
    console.log("Unmatched products:");
    for (const name of unmatched) console.log(`- ${name}`);
  }
  if (matches.length > 0) {
    for (const match of matches) {
      console.log(`- ${match.productName}: ${match.license} ${match.sourceUrl}`);
    }
  }
  console.log("No database records were changed. Run with --apply to use this plan.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});