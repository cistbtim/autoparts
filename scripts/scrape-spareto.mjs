// Scrape a Spareto product page into structured JSON: image, OE numbers, and
// vehicle fitments (make/model/generation/years, plus KW/HP/CCM where available).
//
// Usage:
//   node scripts/scrape-spareto.mjs <spareto-product-url> [--deep] [--out file.json]
//
// --deep  also fetches each model's lazy-loaded fitment fragment to get the
//         full per-generation breakdown (chassis code, exact years, KW/HP/CCM).
//         Without it you still get make + base model + overall year range for free —
//         that's already in the initial page HTML.
//
// The page is plain server-rendered HTML (Rails/Turbo), so no headless browser
// is needed — a regular fetch() with a browser User-Agent is enough.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
  return res.text();
}

const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const strip = (s) => unesc(s).replace(/<[^>]+>/g, "").trim();

function parseProduct(html, pageUrl) {
  const title = (html.match(/<title>([^<]*)<\/title>/) || [, ""])[1].trim();
  const image = (html.match(/<meta content=['"]([^'"]+)['"] property=['"]og:image['"]/) || [, ""])[1];

  // ── OE Numbers + Cross-Reference Numbers — both live in the #nav-oe section,
  // as repeated "<make label> / <list of codes>" row pairs.
  const parseCodeRows = (section) => {
    const rows = [];
    const rowRe = /<div class='col-md-2 col-4 ps-4'>([^<]+)<\/div>\s*<div class='col-md-10 col-8'>([\s\S]*?)<\/div>\s*<\/div>/g;
    let m;
    while ((m = rowRe.exec(section))) {
      const make = strip(m[1]);
      const codes = [...m[2].matchAll(/>([^<]+)<\/a>|<span class='me-3'>\s*([^<]+?)\s*<\/span>/g)]
        .map(c => strip(c[1] || c[2] || ""))
        .filter(Boolean);
      if (make && codes.length) rows.push({ make, codes });
    }
    return rows;
  };
  const oeSection = html.split("OE Numbers</h3>")[1]?.split("Cross-Reference Numbers</h3>")[0] || "";
  const crossSection = html.split("Cross-Reference Numbers</h3>")[1]?.split(/<section|<h2>Shipping/)[0] || "";
  const oe_numbers = parseCodeRows(oeSection);
  const cross_references = parseCodeRows(crossSection);

  // ── Fit Vehicles — one block per make, each containing one row per base model
  // (name + overall year range) immediately followed by a turbo-frame whose `src`
  // is the lazy-loaded per-generation detail fragment.
  const vehSection = html.split("Fit Vehicles</h2>")[1]?.split("</section>")[0] || "";
  const makeChunks = vehSection.split("<div data-controller='collapse'>").slice(1);
  const vehicles = makeChunks.map(chunk => {
    const make = strip((chunk.match(/<div class='col-6' style='font-weight: bold'>([^<]+)<\/div>/) || [, ""])[1]);
    const rowRe = /<div class='col-6 ps-4'>([^<]+)<\/div>\s*<div class='col-5'>([^<]+)<\/div>[\s\S]*?<turbo-frame[^>]*src="([^"]+)"/g;
    const models = [];
    let m;
    while ((m = rowRe.exec(chunk))) {
      const [yearFrom, yearTo] = strip(m[2]).split(" - ").map(s => s.trim());
      models.push({
        model: strip(m[1]),
        year_from: yearFrom || null,
        year_to: (yearTo && yearTo !== "...") ? yearTo : null,
        fitment_url: new URL(unesc(m[3]), pageUrl).href,
      });
    }
    return { make, models };
  }).filter(v => v.make);

  return { title, image, oe_numbers, cross_references, vehicles };
}

function parseGenerations(fragmentHtml) {
  const rows = [];
  const rowRe = /<tr data-model-short-name="[^"]*">([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(fragmentHtml))) {
    const cell = m[1];
    const name = strip((cell.match(/<a href="[^"]*">([^<]+)<\/a>/) || [, ""])[1]);
    const yearFrom = strip((cell.match(/<span class="from">([^<]*)<\/span>/) || [, ""])[1]);
    const yearTo = strip((cell.match(/<span class="to">([^<]*)<\/span>/) || [, ""])[1]);
    const power = strip((cell.match(/<td class="power">([^<]*)<\/td>/) || [, ""])[1]);
    const ccm = strip((cell.match(/<td class="ccm">([^<]*)<\/td>/) || [, ""])[1]);
    const hpMatch = cell.match(/<td class="power">[^<]*<\/td>\s*<td>([^<]*)<\/td>/);
    const hp = hpMatch ? strip(hpMatch[1]) : "";
    if (name) rows.push({
      name,
      year_from: yearFrom || null,
      year_to: (yearTo && yearTo !== "...") ? yearTo : null,
      kw: power ? Number(power) : null,
      hp: hp ? Number(hp) : null,
      ccm: ccm ? Number(ccm) : null,
    });
  }
  return rows;
}

async function scrape(url, { deep = false } = {}) {
  const html = await fetchHtml(url);
  const product = parseProduct(html, url);

  if (deep) {
    await Promise.all(product.vehicles.flatMap(v => v.models.map(async model => {
      try {
        const frag = await fetchHtml(model.fitment_url);
        model.generations = parseGenerations(frag);
      } catch (e) {
        model.generations = [];
        model.error = e.message;
      }
    })));
  }
  return product;
}

// ── CLI ──
import { pathToFileURL } from "node:url";
import * as readline from "node:readline";

async function promptForUrl() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const url = await new Promise(res => rl.question("Paste Spareto product URL: ", res));
  rl.close();
  return url.trim();
}

async function runOne(url, { deep, outFile }) {
  const data = await scrape(url, { deep });
  const json = JSON.stringify(data, null, 2);
  if (outFile) {
    const fs = await import("node:fs/promises");
    await fs.writeFile(outFile, json);
    console.error(`Wrote ${outFile}`);
  } else {
    console.log(json);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const argUrl = args.find(a => !a.startsWith("--"));
  const deep = args.includes("--deep");
  const outIdx = args.indexOf("--out");
  const outFile = outIdx >= 0 ? args[outIdx + 1] : null;

  if (argUrl) {
    runOne(argUrl, { deep, outFile }).catch(e => {
      console.error("Scrape failed:", e.message);
      process.exit(1);
    });
  } else {
    // No URL given on the command line — prompt for one, then keep prompting
    // for more (Ctrl+C or an empty line to stop) so this can run once and
    // scrape several pages in a row.
    (async () => {
      for (;;) {
        const url = await promptForUrl();
        if (!url) break;
        try {
          await runOne(url, { deep, outFile });
        } catch (e) {
          console.error("Scrape failed:", e.message);
        }
      }
    })();
  }
}

export { scrape, parseProduct, parseGenerations };
