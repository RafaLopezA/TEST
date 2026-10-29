# Viva Engage Video Downloader

Extensión de Chrome (Manifest V3) que detecta los videos que se reproducen en Viva Engage
(`engage.cloud.microsoft`, `*.mcas.ms`, `web.yammer.com`…) y te deja descargarlos.

## Instalación
1. Abre `chrome://extensions` y activa **Modo desarrollador**.
2. **Cargar descomprimida** → selecciona esta carpeta.

## Uso
1. Abre el hilo en Viva Engage y dale **play** al video (la extensión captura las peticiones de red).
2. El icono muestra un contador; abre el popup y pulsa **Descargar**.

## Qué soporta
- MP4/WebM directo → descarga con el gestor de Chrome.
- HLS (`.m3u8`, incluido `videomanifest?format=hls` de SharePoint/Stream), sin cifrar o AES-128:
  se bajan los segmentos en una pestaña y se guarda un `.mp4`/`.ts`. Si el audio es una pista
  separada se guarda como segundo archivo.
- Manifest DASH de SharePoint: se intenta pedir la variante HLS. DASH puro (`.mpd`) no está soportado.

Úsalo solo con contenido al que tengas acceso y permiso para descargar según las políticas de tu empresa.

## Videos "blob:" (Media Source Extensions)
Si el reproductor usa una fuente `blob:`, la extensión captura los trozos que el reproductor alimenta al buffer.
Recarga la página (F5), pulsa "Reproducir rápido" en el popup, espera a que llegue al final y pulsa "Guardar captura".
Si audio y video vienen por separado se guardan dos archivos; únelos con:
`ffmpeg -i x_video.mp4 -i x_audio.m4a -c copy final.mp4`
