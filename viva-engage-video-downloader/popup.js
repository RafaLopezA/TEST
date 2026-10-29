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

function frames(func, args = []) {
  return chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, world: "MAIN", func, args });
}

async function renderMse() {
  const res = await frames(() => {
    const t = window.__vedlTracks;
    if (!t || !t.length) return null;
    const v = [...document.querySelectorAll("video")].sort((a, b) => b.videoWidth - a.videoWidth)[0];
    return { tracks: t.map((x) => ({ mime: x.mime, bytes: x.bytes })), dur: v && v.duration, time: v && v.currentTime };
  });
  const r = res.map((x) => x.result).find(Boolean);
  $("mse").textContent = r
    ? r.tracks.map((t) => `${t.mime.split(";")[0]}: ${(t.bytes / 1048576).toFixed(1)} MB`).join(" | ") +
      (r.dur ? ` · posición ${Math.round(r.time)}s de ${Math.round(r.dur)}s` : "")
    : "No se detectó captura. Recarga la página de Engage (F5) con la extensión activa y dale play.";
}

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  $("refresh").onclick = render;
  $("clear").onclick = async () => {
    await chrome.runtime.sendMessage({ type: "clear", tabId: tab.id });
    render();
  };
  $("refresh").addEventListener("click", renderMse);
  $("fast").onclick = async () => {
    await frames(() => {
      const v = [...document.querySelectorAll("video")].sort((a, b) => b.videoWidth - a.videoWidth)[0];
      if (!v) return;
      v.muted = true;
      v.currentTime = 0;
      v.playbackRate = 16;
      v.play();
      v.addEventListener("ended", () => { v.playbackRate = 1; v.muted = false; }, { once: true });
    });
    $("mse").textContent = "Reproduciendo a 16x… vuelve a abrir el popup y pulsa Actualizar hasta llegar al final.";
  };
  $("save").onclick = async () => {
    await frames((base) => {
      const t = window.__vedlTracks;
      if (!t) return;
      t.filter((x) => x.bytes).forEach((x, i) => {
        const audio = /^audio/.test(x.mime);
        const ext = /webm/.test(x.mime) ? "webm" : audio ? "m4a" : "mp4";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(x.chunks, { type: x.mime.split(";")[0] }));
        a.download = `${base}${t.length > 1 ? (audio ? "_audio" : "_video") : ""}.${ext}`;
        a.click();
      });
    }, [fileName("x").replace(/\.x$/, "")]);
  };
  renderMse();
  render();
})();
