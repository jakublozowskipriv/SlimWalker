// Pobiera surowe dane OSM dla Poznania z Overpass API do data/raw/.
// Uruchom: npm run osm:fetch   (potem: npm run osm:build)
import { writeFile, mkdir } from 'node:fs/promises';

const ENDPOINTS = [
  process.env.OVERPASS_URL,
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
].filter(Boolean);

const AREA = `area["boundary"="administrative"]["name"="Poznań"]["admin_level"="8"]->.a;`;

const QUERIES = {
  city: `[out:json][timeout:120];rel["boundary"="administrative"]["name"="Poznań"]["admin_level"="8"];out geom;`,
  districts: `[out:json][timeout:180];${AREA}rel(area.a)["boundary"="administrative"]["admin_level"~"^(9|10|11)$"];out geom;`,
  highways: `[out:json][timeout:300];${AREA}way(area.a)["highway"];out body geom;`,
  water: `[out:json][timeout:180];${AREA}(way(area.a)["waterway"="river"];way(area.a)["natural"="water"];rel(area.a)["natural"="water"];way(area.a)["waterway"="riverbank"];);out geom;`,
  bridges: `[out:json][timeout:120];${AREA}(way(area.a)["man_made"="bridge"];rel(area.a)["man_made"="bridge"];);out geom;`,
  parks: `[out:json][timeout:180];${AREA}(way(area.a)["leisure"="park"];rel(area.a)["leisure"="park"];);out geom;`,
};

async function run(name, q) {
  let lastErr;
  for (const url of ENDPOINTS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'mgla-poznania-data-build/1.0' },
          body: 'data=' + encodeURIComponent(q),
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const text = await res.text();
        JSON.parse(text);
        await writeFile(`data/raw/${name}.json`, text);
        console.log(`✓ ${name}: ${(text.length / 1e6).toFixed(1)} MB z ${url}`);
        return;
      } catch (e) {
        lastErr = e;
        console.warn(`… ${name} (${url}, próba ${attempt + 1}): ${e.message}`);
        await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

await mkdir('data/raw', { recursive: true });
const only = process.argv.slice(2);
for (const [name, q] of Object.entries(QUERIES)) {
  if (only.length && !only.includes(name)) continue;
  await run(name, q);
}
