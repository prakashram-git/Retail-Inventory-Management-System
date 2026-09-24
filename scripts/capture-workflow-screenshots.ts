#!/usr/bin/env -S npx tsx
/**
 * Regenerates Help Center step screenshots.
 *
 * For every workflow it logs in as the lowest-privilege demo role allowed to
 * see it, walks each step's [data-tour] target with a frozen clock and
 * animations disabled (deterministic pixels), draws a halo around the target,
 * captures Desktop 1280x800 and Mobile 390x844, compresses to WebP (<150KB),
 * uploads to Storage bucket mall-assets/help/<workflow_id>/, then writes the
 * URLs and a fresh feature_hash back to help_workflows.
 *
 *   BASE_URL=http://localhost:3000 npm run help:refresh-assets [-- --only=wf_id]
 *
 * Requires a running app. POS workflows are captured in Training Mode so no
 * register session or sale is ever written.
 */
import { chromium, type Page } from "playwright";
import sharp from "sharp";
import { adminClient } from "./_help-env";
import { computeFeatureHash } from "../lib/help/driftDetector";
import { HELP_WORKFLOWS } from "../lib/help/workflows";
import type { UserRole } from "../lib/types/domain";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const BUCKET = "mall-assets";
const MAX_BYTES = 150 * 1024;
const FIXED_TIME = new Date("2026-09-24T12:00:00Z");

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
} as const;

const DEMO_LOGIN: Partial<Record<UserRole, string>> = {
  cashier: "Cashier",
  store_manager: "Store Manager",
  super_admin: "Super Admin",
};
const ROLE_PREFERENCE: UserRole[] = ["cashier", "store_manager", "super_admin"];

const FREEZE_CSS = "* { animation: none !important; transition: none !important; caret-color: transparent !important; } nextjs-portal { display: none !important; }";

async function login(page: Page, role: UserRole) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: DEMO_LOGIN[role]! }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 20000 });
}

async function enableTraining(page: Page) {
  await page.keyboard.press("F1");
  const toggle = page.getByRole("switch", { name: "Training sandbox" });
  await toggle.waitFor({ timeout: 5000 });
  if ((await toggle.getAttribute("aria-checked")) !== "true") await toggle.click();
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}

/** Opens whatever dialog a step's target lives in. */
async function prepare(page: Page, anchor: string) {
  const visible = async (a: string) => (await page.locator(`[data-tour="${a}"]:visible`).count()) > 0;
  if (anchor.startsWith("checkout-")) {
    if (await visible("pos-open-submit")) await page.locator('[data-tour="pos-open-submit"]').click();
    if (!(await visible("checkout-payment"))) {
      await page.locator('[data-tour="pos-product-card"] button').first().click();
      await page.locator('[data-tour="pos-charge-btn"]:visible').first().click();
    }
  } else if (anchor.startsWith("close-")) {
    if (await visible("pos-open-submit")) await page.locator('[data-tour="pos-open-submit"]').click();
    if (!(await visible("close-counted-cash"))) await page.locator('[data-tour="pos-close-shift"]').click();
  } else if (anchor === "orders-return-btn") {
    await page.locator('[data-tour="orders-table"] tbody tr').first().click();
  }
  await page.waitForTimeout(500);
}

async function drawHalo(page: Page, selector: string) {
  await page.evaluate((sel) => {
    document.getElementById("__help_halo")?.remove();
    const el = document.querySelector(sel);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 10;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.id = "__help_halo";
    svg.setAttribute("style", `position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none`);
    for (const [grow, opacity] of [[pad + 8, 0.25], [pad, 0.9]] as const) {
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", String(r.x - grow));
      rect.setAttribute("y", String(r.y - grow));
      rect.setAttribute("width", String(r.width + grow * 2));
      rect.setAttribute("height", String(r.height + grow * 2));
      rect.setAttribute("rx", "14");
      rect.setAttribute("fill", "none");
      rect.setAttribute("stroke", "#6366f1");
      rect.setAttribute("stroke-width", "3");
      rect.setAttribute("stroke-opacity", String(opacity));
      svg.appendChild(rect);
    }
    document.body.appendChild(svg);
  }, selector);
}

async function toWebp(png: Buffer): Promise<Buffer> {
  for (const quality of [80, 65, 50, 35, 25]) {
    const out = await sharp(png).webp({ quality, effort: 4 }).toBuffer();
    if (out.length < MAX_BYTES) return out;
  }
  return sharp(png).webp({ quality: 15 }).toBuffer();
}

async function main() {
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
  const admin = adminClient();
  const targets = HELP_WORKFLOWS.filter((w) => !only || w.id === only);
  if (targets.length === 0) throw new Error(`No workflow matches --only=${only}`);

  const browser = await chromium.launch();
  const stamp = Date.now().toString(36);
  let failures = 0;

  try {
    for (const def of targets) {
      const role = ROLE_PREFERENCE.find((r) => def.allowed_roles.includes(r))!;
      const urls: Record<number, { desktop?: string; mobile?: string }> = {};

      for (const [kind, viewport] of Object.entries(VIEWPORTS) as [keyof typeof VIEWPORTS, { width: number; height: number }][]) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
        const page = await context.newPage();
        page.setDefaultTimeout(6000);
        await page.clock.setFixedTime(FIXED_TIME);
        await login(page, role);
        await page.goto(`${BASE_URL}${def.target_route}`, { waitUntil: "networkidle" });
        await page.addStyleTag({ content: FREEZE_CSS });
        if (def.target_route === "/pos") await enableTraining(page);

        for (const step of def.steps) {
          const anchor = /data-tour="([^"]+)"/.exec(step.target_selector)![1];
          try {
            await prepare(page, anchor);
            const el = page.locator(`${step.target_selector}:visible`).first();
            await el.waitFor({ state: "visible", timeout: 4000 });
            await el.scrollIntoViewIfNeeded();
            await drawHalo(page, `${step.target_selector}`);
            const png = await page.screenshot({ type: "png" });
            const webp = await toWebp(png);
            const objectPath = `help/${def.id}/step-${step.step_number}-${kind}.webp`;
            const { error } = await admin.storage
              .from(BUCKET)
              .upload(objectPath, webp, { contentType: "image/webp", upsert: true, cacheControl: "3600" });
            if (error) throw new Error(error.message);
            const { data } = admin.storage.from(BUCKET).getPublicUrl(objectPath);
            (urls[step.step_number] ??= {})[kind] = `${data.publicUrl}?v=${stamp}`;
            console.log(`  ${def.id} step ${step.step_number} ${kind}: ${(webp.length / 1024).toFixed(1)}KB`);
          } catch (e) {
            failures++;
            console.warn(`  ${def.id} step ${step.step_number} ${kind}: skipped (${e instanceof Error ? e.message.split("\n")[0] : e}) — SVG fallback will be used`);
          }
          await page.evaluate(() => document.getElementById("__help_halo")?.remove());
        }
        await context.close();
      }

      const steps = def.steps.map((s) => ({
        ...s,
        desktop_image_url: urls[s.step_number]?.desktop ?? null,
        mobile_image_url: urls[s.step_number]?.mobile ?? null,
      }));
      const { error } = await admin
        .from("help_workflows")
        .update({
          steps,
          feature_hash: computeFeatureHash(def),
          drift_detected: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", def.id);
      if (error) throw new Error(`${def.id}: ${error.message}`);
      console.log(`Updated ${def.id}`);
    }
  } finally {
    await browser.close();
  }
  console.log(failures ? `Done with ${failures} skipped capture(s).` : "Done.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
