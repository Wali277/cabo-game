/**
 * render-email.ts — DEV-only: render the auth email HTML to a static file the
 * Vite dev server serves, so the preview gate can screenshot the real output.
 * Writes cobo/public/__email_preview.html (a temp file; delete after previewing).
 *
 *   node --import tsx scripts/render-email.ts [code] [purpose]
 */
import { renderHtml } from "../src/auth/email.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";

const code = process.argv[2] || "621583";
const purpose = (process.argv[3] || "signup") as "signup" | "reset" | "change_email";

const out = resolve(process.cwd(), "..", "cobo", "public", "__email_preview.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, renderHtml(code, purpose), "utf8");
console.log("wrote", out, "purpose=", purpose, "code=", code);
