import type { HelpStep } from "./types";

/**
 * Self-contained SVG fallback shown when no screenshot has been captured or
 * the user is offline. Returned as a Base64 data URI so it can be cached in
 * IndexedDB and rendered with a plain <img>.
 */
export function fallbackIllustration(step: HelpStep, workflowTitle: string, mobile = false): string {
  const w = mobile ? 390 : 640;
  const h = mobile ? 300 : 360;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const wrap = (text: string, max: number) => {
    const words = text.split(" ");
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      if ((line + " " + word).trim().length > max) {
        lines.push(line);
        line = word;
      } else line = (line + " " + word).trim();
    }
    if (line) lines.push(line);
    return lines.slice(0, 5);
  };
  const body = wrap(step.description, mobile ? 34 : 60)
    .map((l, i) => `<text x="32" y="${170 + i * 24}" font-size="15" fill="#475569">${esc(l)}</text>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="system-ui,sans-serif">
<rect width="${w}" height="${h}" rx="16" fill="#f1f5f9"/>
<rect x="16" y="16" width="${w - 32}" height="28" rx="8" fill="#e2e8f0"/>
<circle cx="34" cy="30" r="5" fill="#f87171"/><circle cx="52" cy="30" r="5" fill="#fbbf24"/><circle cx="70" cy="30" r="5" fill="#34d399"/>
<circle cx="52" cy="102" r="22" fill="#4f46e5"><animate attributeName="r" values="22;27;22" dur="2s" repeatCount="indefinite"/></circle>
<text x="52" y="108" text-anchor="middle" font-size="18" font-weight="700" fill="#fff">${step.step_number}</text>
<text x="92" y="98" font-size="12" fill="#64748b">${esc(workflowTitle)}</text>
<text x="92" y="120" font-size="18" font-weight="700" fill="#0f172a">${esc(step.title)}</text>
${body}
</svg>`;
  const b64 =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(svg)))
      : Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${b64}`;
}
