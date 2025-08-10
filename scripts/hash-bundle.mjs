import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const publicDir = path.resolve("public");
const indexPath = path.join(publicDir, "index.html");
const bundlePath = path.join(publicDir, "bundle.js");
const distMetaDir = path.resolve("dist", "meta");
const manifestPath = path.join(distMetaDir, "bundle-manifest.json");

function upsertMeta(html, hash) {
  const tag = `<meta name="build-hash" content="${hash}">`;
  if (/meta[^>]+name=["']build-hash["']/i.test(html)) {
    return html.replace(/<meta[^>]+name=["']build-hash["'][^>]*>/i, tag);
  }
  return html.replace(/<head([^>]*)>/i, `<head$1>\n  ${tag}`);
}

async function main() {
  try {
    const data = await fs.readFile(bundlePath);
    const hash = createHash("sha256").update(data).digest("hex").slice(0, 10);
    const hashedName = `bundle.${hash}.js`;
    const hashedPath = path.join(publicDir, hashedName);
    // If hashed file already exists with same content, just remove original bundle.js and update HTML if needed.
    try {
      const existing = await fs.readFile(hashedPath);
      const existingHash = createHash("sha256").update(existing).digest("hex").slice(0, 10);
      if (existingHash === hash) {
        await fs.unlink(bundlePath).catch(() => {});
        let html = await fs.readFile(indexPath, "utf8");
        if (!html.includes(hashedName)) {
          html = html.replace(/bundle(?:\.[a-f0-9]{10})?\.js/g, hashedName);
        }
        html = upsertMeta(html, hash);
        await fs.mkdir(distMetaDir, { recursive: true });
        await fs.writeFile(indexPath, html, "utf8");
        const manifest = {
          hashedFile: hashedName,
          hash,
          reused: true,
          generatedAt: new Date().toISOString(),
        };
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
        console.log(`[hash-bundle] Reusing existing ${hashedName}`);
        return;
      }
    } catch {
      // no existing hashed file
    }
    await fs.writeFile(hashedPath, data);
    await fs.unlink(bundlePath).catch(() => {});
    let html = await fs.readFile(indexPath, "utf8");
    html = html.replace(/bundle(?:\.[a-f0-9]{10})?\.js/g, hashedName);
    html = upsertMeta(html, hash);
    await fs.mkdir(distMetaDir, { recursive: true });
    await fs.writeFile(indexPath, html, "utf8");
    const manifest = {
      hashedFile: hashedName,
      hash,
      reused: false,
      generatedAt: new Date().toISOString(),
    };
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    console.log(`[hash-bundle] Generated ${hashedName}`);
  } catch (err) {
    console.error("[hash-bundle] Failed:", err);
    process.exit(1);
  }
}

main();
