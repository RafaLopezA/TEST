// Sniffs media requests per tab and keeps them in chrome.storage.session
// (the MV3 service worker can be killed at any time).

const MEDIA_URL = /\.(mp4|m4v|mov|webm|m3u8|mpd)(\?|$)|videomanifest/i;
const SEGMENT_URL = /\.(ts|m4s|aac|cmfv|cmfa)(\?|$)/i;
const MIN_FILE_BYTES = 100 * 1024;

function header(headers, name) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name);
  return h ? h.value || "" : "";
}

function classify(url, contentType) {
  const ct = contentType.toLowerCase();
  if (ct.includes("mpegurl") || /\.m3u8(\?|$)/i.test(url)) return "hls";
  if (ct.includes("dash+xml") || /\.mpd(\?|$)/i.test(url)) return "dash";
  if (/videomanifest/i.test(url)) {
    const fmt = (new URL(url).searchParams.get("format") || "").toLowerCase();
    return fmt.startsWith("hls") ? "hls" : "dash";
  }
  if (ct.startsWith("video/") || /\.(mp4|m4v|mov|webm)(\?|$)/i.test(url)) return "file";
  return null;
}

function totalSize(headers) {
  const range = header(headers, "content-range"); // bytes 0-1023/456789
  const m = range.match(/\/(\d+)$/);
  if (m) return Number(m[1]);
  return Number(header(headers, "content-length")) || 0;
}

let queue = Promise.resolve();
function addItem(tabId, item) {
  queue = queue.then(async () => {
    const key = `tab:${tabId}`;
    const items = (await chrome.storage.session.get(key))[key] || [];
    const id = item.url.split("?")[0];
    const existing = items.find((i) => i.id === id);
    if (existing) {
      if (item.size > existing.size) existing.size = item.size;
      existing.url = item.url; // keep the freshest signed URL
    } else {
      items.push({ ...item, id, ts: Date.now() });
    }
    await chrome.storage.session.set({ [key]: items });
    chrome.action.setBadgeText({ tabId, text: String(items.length) });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#0b6a0b" });
  });
}

chrome.webRequest.onResponseStarted.addListener(
  (d) => {
    if (d.tabId < 0 || d.statusCode >= 400) return;
    if (SEGMENT_URL.test(d.url)) return;
    const ct = header(d.responseHeaders, "content-type");
    if (!MEDIA_URL.test(d.url) && !/^(video\/|application\/(vnd\.apple\.mpegurl|x-mpegurl|dash\+xml))/i.test(ct)) return;
    const type = classify(d.url, ct);
    if (!type) return;
    const size = totalSize(d.responseHeaders);
    if (type === "file" && size && size < MIN_FILE_BYTES) return;
    addItem(d.tabId, { url: d.url, type, size });
  },
  { urls: ["<all_urls>"] },
  ["responseHeaders"]
);

chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove(`tab:${tabId}`));

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "list") {
    chrome.storage.session.get(`tab:${msg.tabId}`).then((r) => reply(r[`tab:${msg.tabId}`] || []));
    return true;
  }
  if (msg.type === "clear") {
    queue = queue.then(async () => {
      await chrome.storage.session.remove(`tab:${msg.tabId}`);
      chrome.action.setBadgeText({ tabId: msg.tabId, text: "" });
      reply(true);
    });
    return true;
  }
});
