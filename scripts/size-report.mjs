import { promises as fs } from "node:fs";
import path from "node:path";
import { gzipSync, brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { createHash } from "node:crypto";

const publicDir = path.resolve("public");
const distMetaDir = path.resolve("dist", "meta");
const manifestPath = path.join(distMetaDir, "bundle-manifest.json");
const jsonReportPath = path.join(distMetaDir, "size-report.json");

function gzipSize(buffer) {
  return gzipSync(buffer, { level: 9 }).length;
}

function brotliSize(buffer) {
  return brotliCompressSync(buffer, { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 } })
    .length;
}

async function main() {
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    /* no manifest */
  }
  const filesAll = await fs.readdir(publicDir);
  const files = filesAll.filter((f) => /^bundle\.[a-f0-9]{10}\.js$/.test(f));
  // Keep only newest hashed (lexicographically last by mtime) and remove older hashed bundles
  const stats = await Promise.all(
    files.map(async (f) => ({ f, st: await fs.stat(path.join(publicDir, f)) }))
  );
  stats.sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
  if (stats.length > 1) {
    for (const s of stats.slice(1)) {
      await fs.unlink(path.join(publicDir, s.f)).catch(() => {});
    }
  }
  const activeFiles = stats.length ? [stats[0].f] : [];
  if (!activeFiles.length) {
    console.log("[size-report] No bundle files found");
    return;
  }
  if (manifest?.reused) {
    console.log("[size-report] Hash reused – sizes unchanged (skipping recompute)");
    return;
  }
  console.log("[size-report] Bundle size report");
  const out = [];
  let previousReport;
  try {
    previousReport = JSON.parse(await fs.readFile(jsonReportPath, "utf8"));
  } catch {
    /* no previous report */
  }
  const prevMap = new Map();
  if (previousReport?.files) {
    for (const f of previousReport.files) prevMap.set(f.file, f);
  }
  for (const f of activeFiles) {
    const p = path.join(publicDir, f);
    const buf = await fs.readFile(p);
    const raw = buf.length;
    const gz = gzipSize(buf);
    const br = brotliSize(buf);
    const sha = createHash("sha256").update(buf).digest("hex").slice(0, 10);
    const prev = prevMap.get(f);
    const rec = {
      file: f,
      rawBytes: raw,
      gzipBytes: gz,
      brotliBytes: br,
      sha256: sha,
      rawKB: +(raw / 1024).toFixed(2),
      gzipKB: +(gz / 1024).toFixed(2),
      brotliKB: +(br / 1024).toFixed(2),
      prevRawKB: prev?.rawKB ?? null,
      prevGzipKB: prev?.gzipKB ?? null,
      prevBrotliKB: prev?.brotliKB ?? null,
      deltaRawKB: prev ? +(+(raw / 1024).toFixed(2) - prev.rawKB).toFixed(2) : null,
      deltaGzipKB: prev ? +(+(gz / 1024).toFixed(2) - prev.gzipKB).toFixed(2) : null,
      deltaBrotliKB: prev ? +(+(br / 1024).toFixed(2) - prev.brotliKB).toFixed(2) : null,
    };
    out.push(rec);
    console.log(
      `  ${f} | raw ${rec.rawKB} KB${rec.deltaRawKB != null ? ` (${rec.deltaRawKB >= 0 ? "+" : ""}${rec.deltaRawKB})` : ""} | gzip ${rec.gzipKB} KB${rec.deltaGzipKB != null ? ` (${rec.deltaGzipKB >= 0 ? "+" : ""}${rec.deltaGzipKB})` : ""} | brotli ${rec.brotliKB} KB${rec.deltaBrotliKB != null ? ` (${rec.deltaBrotliKB >= 0 ? "+" : ""}${rec.deltaBrotliKB})` : ""} | sha256:${sha}`
    );
  }
  await fs.mkdir(distMetaDir, { recursive: true });
  await fs.writeFile(
    jsonReportPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), files: out }, null, 2),
    "utf8"
  );
}

main().catch((e) => {
  console.error("[size-report] Failed", e);
  process.exit(1);
});
