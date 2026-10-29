const $ = (id) => document.getElementById(id);
let tab;

function fmtSize(n) {
  return n ? `${(n / 1048576).toFixed(1)} MB` : "tamaño desconocido";
}

function fileName(ext) {
  const base = (tab.title || "viva-engage-video").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${base || "viva-engage-video"}.${ext}`;
}

async function download(item) {
  // Run inside the page so the request carries the page's own cookies/origin.
  const cfg = { u: item.url, t: item.type, n: fileName("mp4") };
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", func: (c) => { window.__VEDL = c; }, args: [cfg] });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: "MAIN", files: ["downloader.js"] });
  window.close();
}

async function render() {
  const items = await chrome.runtime.sendMessage({ type: "list", tabId: tab.id });
  $("list").textContent = "";
  $("empty").hidden = items.length > 0;
  for (const item of items) {
    const div = document.createElement("div");
    div.className = "item";
    const meta = document.createElement("div");
    meta.className = "meta";
    const label = { file: "MP4 directo", hls: "HLS (segmentos)", dash: "DASH (manifest)" }[item.type];
    const u = new URL(item.url);
    meta.textContent = `${label} · ${fmtSize(item.size)} · ${u.host}${u.pathname.slice(-60)}`;
    const btn = document.createElement("button");
    btn.textContent = "Descargar";
    btn.onclick = () => download(item);
    div.append(meta, btn);
    $("list").append(div);
  }
}

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("refresh").onclick = render;
  $("clear").onclick = async () => {
    await chrome.runtime.sendMessage({ type: "clear", tabId: tab.id });
    render();
  };
  render();
})();
