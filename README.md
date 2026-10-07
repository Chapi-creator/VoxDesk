# VoxDesk

Asistente de voz para Windows. Controla tu PC con comandos hablados: aplicaciones, archivos, macros, sistema, OCR, clima, traducción e IA.

El audio se procesa **localmente en tu equipo** (reconocimiento Vosk, sin internet, sin nube).

## Descargar

- **Instalador:** descarga la última versión desde [Releases](https://github.com/Chapi-creator/VoxDesk/releases).
- La app instalada se actualiza sola al abrir (electron-updater).

## Requisitos

- Windows 10/11 (64-bit)
- Micrófono
- Sin Python, sin dependencias externas: todo viene incluido en la app.

## Qué hace

Dile la palabra de activación (por defecto **"asistente"**) y luego el comando:

### Aplicaciones y web
- `abre chrome` / `abre youtube` / `abre gmail` — abre apps o sitios web.
- `abre chrome y pon youtube` — abre YouTube en Chrome.

### Sistema
- `sube el volumen` / `baja el volumen`
- `sube el brillo` / `baja el brillo`
- `captura la pantalla` / `captura parte de la pantalla`
- `cambia el fondo de escritorio` (con ruta de imagen)
- `bloquea la pantalla`, `cierra sesión`, `apaga el equipo`, `reinicia`

### Archivos y búsqueda
- `busca notas de ...` — busca en tus archivos.
- `crea una nota` — crea notas.

### Macros
- Graba y ejecuta secuencias de comandos hablados: `guarda macro <nombre>`, `ejecuta la macro <nombre>`.

### Utilidades
- `qué hora es` / `qué fecha es`
- `clima en <ciudad>` / `dime el clima`
- `traduce <frase> a <idioma>`
- `mi ip` / `velocidad de internet` / `crea un código qr para <texto>`
- `temporizador de <n> segundos/minutos/horas`

### IA (opcional)
- Configura tu propia API key (Gemini, OpenAI, Groq, DeepSeek, Anthropic, etc. u Ollama local) y pídele cosas: `ia, <tu pregunta>`.
- Sin API key, la app funciona sin IA.

## Configuración

- Palabra de activación, palabras de IA, proveedor/modelo de IA, SMTP para correos.
- Todo se guarda cifrado en tu equipo (`%APPDATA%\ai-desktop-assistant`).

## Privacidad

Lee la [Política de Privacidad](PRIVACY.md). Resumen:

- El audio se procesa **localmente** (Vosk). **No se sube a ningún servidor.**
- No hay telemetría, no hay analytics, no se venden datos.
- Las únicas llamadas de red ocurren **cuando tú las pides** (traducir, clima, preguntar a tu IA con tu API key).
- El reconocimiento de voz funciona **sin conexión a internet**.

## Riesgos y advertencias

- La app puede **ejecutar comandos de PowerShell** dictados por voz (`ejecuta comando ...`) y código PowerShell generado por la IA. Esto es poderoso y **potencialmente peligroso**: un comando mal redactado (por ti o por la IA) puede modificar tu sistema.
- Hay un filtro de seguridad que bloquea operaciones conocidas peligrosas (apagados, formato de discos, borrados recursivos, etc.), pero no es una defensa completa.
- Cuando la IA genera código PowerShell, la app te pide confirmación si detecta una operación peligrosa.
- **Usa la ejecución de comandos solo si entiendes qué hace.**

## Desarrollo

- `npm install` y `npm run setup` (descarga el modelo de voz, ~40 MB, solo una vez).
- `npm start` para probar. `npm test` corre las pruebas. `npm run build` genera el instalador.
- Voz: Vosk (transcripción) + Silero VAD neuronal (~2 MB, MIT, commiteado en `src/main/silero_vad.onnx`; +~15 MB al `wake.exe`). Sin el modelo, usa detector por energía.
- `python src/main/wake.py --self-test` verifica el VAD sin micro.

## Publicar una release

1. Sube la versión en `package.json` y pushea a `main`.
2. `npm run build` y verifica el instalador `VoxDesk-<versión>-setup.exe`.
3. Crea la release en GitHub con notas en español (qué cambió, cómo actualizar).
4. Sube el mismo `.exe` a itch.io como espejo.
5. La app instalada avisa sola de la actualización (el usuario elige cuándo reiniciar).

## Licencia

Privado hasta nuevo aviso. Contacta al autor para uso comercial.
