// Runs in the page's MAIN world at document_start: records every buffer the player
// feeds into Media Source Extensions (the "blob:" video source).
(() => {
  if (window.__vedlTracks || typeof MediaSource === "undefined") return;
  const tracks = (window.__vedlTracks = []);
  const byBuffer = new WeakMap();

  const addSourceBuffer = MediaSource.prototype.addSourceBuffer;
  MediaSource.prototype.addSourceBuffer = function (mime) {
    const sb = addSourceBuffer.call(this, mime);
    const track = { mime, chunks: [], bytes: 0, seen: new Set() };
    tracks.push(track);
    byBuffer.set(sb, track);
    return sb;
  };

  const appendBuffer = SourceBuffer.prototype.appendBuffer;
  SourceBuffer.prototype.appendBuffer = function (data) {
    try {
      const track = byBuffer.get(this);
      if (track) {
        const view = ArrayBuffer.isView(data)
          ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
          : new Uint8Array(data);
        // cheap fingerprint to skip segments the player re-appends after seeking
        let key = view.length + ":";
        const step = Math.max(1, Math.floor(view.length / 64));
        for (let i = 0; i < view.length; i += step) key += view[i] + ",";
        if (!track.seen.has(key)) {
          track.seen.add(key);
          track.chunks.push(view.slice());
          track.bytes += view.length;
        }
      }
    } catch (e) {}
    return appendBuffer.call(this, data);
  };
})();
