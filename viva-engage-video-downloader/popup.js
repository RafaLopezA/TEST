const $ = (id) => document.getElementById(id);
let tab;

function fmtSize(n) {
  return n ? `${(n / 1048576).toFixed(1)} MB` : "tamaño desconocido";
}

function fileName(ext) {
  const base = (tab.title || "viva-engage-video").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${base || "viva-engage-video"}.${ext}`;
}

function download(item) {
  // HLS/DASH need segment downloading: done in a full tab so it survives the popup closing.
  const q = new URLSearchParams({ u: item.url, t: item.type, n: fileName("mp4") });
  chrome.tabs.create({ url: chrome.runtime.getURL("downloader.html?" + q) });
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
    meta.textContent = `${label} · ${fmtSize(item.size)} · ${new URL(item.url).host}`;
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
