# BlackMamba Music Desktop

- WebUI y aplicación macOS comparten React/Vite.
- El DMG no incluye MP3 ni WAV.
- `electron-updater` consulta `https://updates.blackmambarecords.com/music` y aplica versiones al cerrar.
- Audio: `streamUrl` de SoundCloud para escucha, USB para masters locales y Suno para recuperar faltantes.
- La página pública de SoundCloud no es un archivo de audio; un backend autorizado debe resolver la URL temporal de streaming.
- Producción requiere publicar DMG, ZIP y `latest-mac.yml`, además de firma Developer ID y notarización.
