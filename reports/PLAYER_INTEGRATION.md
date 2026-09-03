# Reproductor de verificacion

El reproductor existente del USB fue conectado a la coleccion canonica:

- Interfaz: `/Volumes/ADATA SC740/MÚSICA/BLACKMAMBA_LIBRARY/blackmamba_music_player.html`
- Servidor: `/Volumes/ADATA SC740/MÚSICA/BLACKMAMBA_LIBRARY/music_server.py`
- Lanzador: `/Volumes/ADATA SC740/MÚSICA/BLACKMAMBA_LIBRARY/launch_music_player.sh`
- Audio: `/Volumes/ADATA SC740/MÚSICA/WAV_MASTER`

Validacion realizada:

- 472 pistas cargadas.
- 472 archivos WAV y cero formatos alternos.
- Streaming validado por cabecera RIFF/WAVE.
- Las rutas externas a `WAV_MASTER` no se sirven.

Este reproductor sera la estacion de escucha para confirmar coincidencias SoundCloud ↔ Suno, distinguir versiones y decidir duplicados.
