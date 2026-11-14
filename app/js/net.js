// Network helpers. When the page is served by server.py, requests to
// remote archives go through its allow-listed /proxy endpoint (avoids CORS issues).

let useProxy = false;
// The proxy sits at the site root (server.py). Resolve it from this module's location, so pages
// in sub-folders (e.g. /spherex-immersive/) find it too; net.js lives in /js/.
const PROXY = new URL('../proxy', import.meta.url).href;

export async function detectProxy() {
  try {
    const r = await fetch(`${PROXY}/health`, { cache: 'no-store' });
    useProxy = r.ok && (await r.text()).trim() === 'ok';
  } catch {
    useProxy = false;
  }
  return useProxy;
}

export function proxyEnabled() {
  return useProxy;
}

const RETRY_STATUS = new Set([429, 502, 503, 504]);

/**
 * Fetch from a remote archive, through the local server's proxy when there is one.
 * proxyParams go to the proxy only (e.g. { fits: 'planes' } to have it trim and cache FITS).
 */
export async function fetchRemote(url, opts = {}, retries = 3, proxyParams = null) {
  const extra = proxyParams ? `&${new URLSearchParams(proxyParams)}` : '';
  const target = useProxy ? `${PROXY}?url=${encodeURIComponent(url)}${extra}` : url;
  for (let attempt = 0; ; attempt++) {
    let r;
    try {
      r = await fetch(target, opts);
    } catch (e) {
      const hint = useProxy ? '' : ' (the archive may block cross-origin requests — run "python3 server.py" and open the app from it)';
      throw new Error(`Network error fetching ${new URL(url).host}${hint}`);
    }
    if (r.ok) return r;
    // Busy archive: back off and try again.
    if (RETRY_STATUS.has(r.status) && attempt < retries) {
      await new Promise((res) => setTimeout(res, 1500 * 2 ** attempt * (0.75 + Math.random() / 2)));
      continue;
    }
    throw new Error(`HTTP ${r.status} from ${new URL(url).host}`);
  }
}

/** Run async tasks with a concurrency limit, reporting progress. */
export async function pool(items, limit, worker, onProgress) {
  const results = new Array(items.length);
  let next = 0, done = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = await worker(items[i], i);
      } catch (e) {
        results[i] = { error: e };
      }
      done++;
      onProgress?.(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

/** Parse a VOTable TABLEDATA response into an array of row objects. */
export function parseVoTable(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const err = doc.querySelector('INFO[name="QUERY_STATUS"][value="ERROR"]');
  if (err) throw new Error(`Archive query failed: ${err.textContent.trim() || 'unknown error'}`);
  const table = doc.getElementsByTagName('TABLE')[0];
  if (!table) return [];
  const fields = [...table.getElementsByTagName('FIELD')].map((f) => ({
    name: f.getAttribute('name'),
    numeric: /double|float|int|long|short/.test(f.getAttribute('datatype') || ''),
  }));
  const tableData = table.getElementsByTagName('TABLEDATA')[0];
  if (!tableData) {
    if (table.getElementsByTagName('BINARY').length || table.getElementsByTagName('BINARY2').length) {
      throw new Error('Binary VOTable responses are not supported; request TABLEDATA');
    }
    return [];
  }
  return [...tableData.getElementsByTagName('TR')].map((tr) => {
    const row = {};
    [...tr.getElementsByTagName('TD')].forEach((td, i) => {
      const f = fields[i];
      if (!f) return;
      const txt = td.textContent.trim();
      row[f.name] = f.numeric ? (txt === '' ? NaN : Number(txt)) : txt;
    });
    return row;
  });
}
