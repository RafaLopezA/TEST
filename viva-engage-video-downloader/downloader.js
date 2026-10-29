const params = new URLSearchParams(location.search);
const srcUrl = params.get("u");
const kind = params.get("t");
const outName = params.get("n") || "video.mp4";
const $ = (id) => document.getElementById(id);
const status = (s) => ($("status").textContent = s);
const log = (s) => ($("log").textContent += s + "\n");

async function fetchOk(url, type) {
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url.slice(0, 120)}`);
  return type === "text" ? r.text() : r.arrayBuffer();
}

function parseAttrs(s) {
  const o = {};
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;
  let m;
  while ((m = re.exec(s))) o[m[1]] = m[2].replace(/^"|"$/g, "");
  return o;
}

const abs = (u, base) => new URL(u, base).href;

function parseMaster(text, base) {
  const lines = text.split(/\r?\n/);
  const variants = [];
  const audio = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("#EXT-X-STREAM-INF:")) {
      const a = parseAttrs(lines[i].slice(18));
      const uri = lines.slice(i + 1).find((l) => l && !l.startsWith("#"));
      variants.push({ bw: Number(a.BANDWIDTH) || 0, audio: a.AUDIO, url: abs(uri, base) });
    } else if (lines[i].startsWith("#EXT-X-MEDIA:")) {
      const a = parseAttrs(lines[i].slice(13));
      if (a.TYPE === "AUDIO" && a.URI) audio.push({ group: a["GROUP-ID"], url: abs(a.URI, base) });
    }
  }
  return { variants, audio };
}

function parseMedia(text, base) {
  const segs = [];
  let seq = 0, key = null, map = null, pendingDuration = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) seq = Number(line.split(":")[1]);
    else if (line.startsWith("#EXT-X-KEY:")) {
      const a = parseAttrs(line.slice(11));
      key = a.METHOD === "NONE" ? null : { method: a.METHOD, url: a.URI && abs(a.URI, base), iv: a.IV };
    } else if (line.startsWith("#EXT-X-MAP:")) map = abs(parseAttrs(line.slice(11)).URI, base);
    else if (line.startsWith("#EXTINF:")) pendingDuration = true;
    else if (line && !line.startsWith("#") && pendingDuration) {
      segs.push({ url: abs(line, base), seq: seq++, key });
      pendingDuration = false;
    }
  }
  return { segs, map };
}

const keyCache = new Map();
async function decrypt(buf, seg) {
  if (seg.key.method !== "AES-128") throw new Error(`Cifrado no soportado: ${seg.key.method}`);
  if (!keyCache.has(seg.key.url)) {
    const raw = await fetchOk(seg.key.url);
    keyCache.set(seg.key.url, crypto.subtle.importKey("raw", raw, "AES-CBC", false, ["decrypt"]));
  }
  const iv = new Uint8Array(16);
  if (seg.key.iv) {
    const hex = seg.key.iv.replace(/^0x/i, "").padStart(32, "0");
    for (let i = 0; i < 16; i++) iv[i] = parseInt(hex.substr(i * 2, 2), 16);
  } else {
    new DataView(iv.buffer).setUint32(12, seg.seq);
  }
  return crypto.subtle.decrypt({ name: "AES-CBC", iv }, await keyCache.get(seg.key.url), buf);
}

function save(parts, name, mime) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(parts, { type: mime }));
  a.download = name;
  a.click();
}

async function downloadPlaylist(url, name) {
  const { segs, map } = parseMedia(await fetchOk(url, "text"), url);
  if (!segs.length) throw new Error("La playlist no contiene segmentos.");
  const parts = [];
  if (map) parts.push(await fetchOk(map));
  const results = new Array(segs.length);
  let next = 0, done = 0;
  async function worker() {
    while (next < segs.length) {
      const i = next++;
      let buf = await fetchOk(segs[i].url);
      if (segs[i].key) buf = await decrypt(buf, segs[i]);
      results[i] = buf;
      $("bar").value = ++done / segs.length;
      status(`Segmentos: ${done}/${segs.length}`);
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  parts.push(...results);
  const fmp4 = !!map || /\.(m4s|mp4|cmfv)(\?|$)/i.test(segs[0].url);
  save(parts, name.replace(/\.mp4$/i, fmp4 ? ".mp4" : ".ts"), fmp4 ? "video/mp4" : "video/mp2t");
}

async function run() {
  let url = srcUrl;
  if (kind === "dash") {
    // SharePoint/Stream manifests can usually also be served as HLS.
    const u = new URL(url);
    if (/videomanifest/i.test(u.pathname) && u.searchParams.has("format")) {
      u.searchParams.set("format", "hls");
      url = u.href;
      log("Manifest DASH detectado; intentando versión HLS (format=hls).");
    } else {
      throw new Error("DASH (.mpd) no está soportado todavía; solo HLS y MP4 directo.");
    }
  }
  const text = await fetchOk(url, "text");
  if (!text.startsWith("#EXTM3U")) throw new Error("La respuesta no es una playlist HLS válida.");
  if (!text.includes("#EXT-X-STREAM-INF")) {
    await downloadPlaylist(url, outName);
  } else {
    const { variants, audio } = parseMaster(text, url);
    variants.sort((a, b) => b.bw - a.bw);
    const best = variants[0];
    log(`Calidad elegida: ${Math.round(best.bw / 1000)} kbps`);
    await downloadPlaylist(best.url, outName);
    const aud = audio.find((a) => a.group === best.audio);
    if (aud) {
      log("El audio viene en una pista separada; se descarga como segundo archivo (_audio).");
      await downloadPlaylist(aud.url, outName.replace(/\.mp4$/i, "_audio.mp4"));
    }
  }
  $("title").textContent = "Listo";
  status("Descarga completada.");
}

run().catch((e) => {
  $("title").textContent = "Error";
  status(e.message);
});
