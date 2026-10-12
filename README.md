# VoxDesk

Asistente de voz para Windows con presencia estilo JARVIS: controla tu PC con comandos hablados **o escritos**, actúa por su cuenta cuando se lo permites y habla contigo.

El audio se procesa **localmente en tu equipo** (Vosk + Silero, sin internet, sin nube).

## Descargar

- **Instalador:** última versión en [Releases](https://github.com/Chapi-creator/VoxDesk/releases). Un solo `.exe`: siguiente-siguiente, sin Python, sin cuentas.
- La app avisa sola de actualizaciones y tú eliges cuándo reiniciar.
- Si SmartScreen avisa (app sin firma comercial): Más información > Ejecutar de todas formas.

## Requisitos

- Windows 10/11 (64-bit)
- Micrófono (para voz; también acepta órdenes escritas en su consola)
- Todo incluido en el instalador: motor de voz, VAD neuronal y voces neuronales MX/ES.

## Qué hace

Dile la palabra de activación (por defecto **"asistente"**) o escribe en la consola:

### Control del PC
- `abre chrome` / `abre youtube` / `abre gmail` — apps o sitios.
- `abre chrome y pon youtube` — compuestos con "y / luego / después".
- `sube/baja el volumen|brillo`, `captura la pantalla`, `bloquea`, `cierra sesión`, `apaga/reinicia el equipo`.
- `cierra X`, `cierra todo`, `mata el proceso N`, servicios, papelera, archivos.
- `ejecuta el comando ...` / `corre npm ...` — **siempre piden permiso antes**.

### Entiende aunque varíes
- Fuzzy por intención: `apaga la compu` = `apaga el equipo`. Aprende tus frases y las reutiliza (👍/👎 en el historial enseñan).
- Recuerda lo último: `analiza eso`, `repítelo`, `¿y eso qué significa?`.

### Autonomía (`encárgate de ...`)
- Arma un plan con IA, te lo muestra, lo ejecuta paso a paso y replanifica si algo falla. Requiere IA configurada.

### Vida propia (configurable)
- Buenos días, rachas, batería baja, pausas, dormir por inactividad, modo silencio por voz (`descansa` / `despierta`).
- Nivel en Ajustes: total / solo visual / silencio. Sin voz de 22 a 8.

### Utilidades
- `qué hora|fecha es`, `clima en <ciudad>`, `traduce <frase>`, `temporizador|alarma`, `lee esto` (lee tu selección), `cuéntame un chiste|un dato`, `sistemas` (reporte con puntaje).
- Notas, macros (`graba macro` / `ejecuta macro`), email/WhatsApp por voz.

### IA (opcional, online primero)
- 12 proveedores (Gemini, OpenAI, Groq, DeepSeek, Anthropic, Ollama, LM Studio…) + URL custom. Key vacía vale para servidores caseros en tu red.
- Sin IA: comandos, fuzzy, macros y utilidades funcionan igual.

## Voz

- Transcripción Vosk offline + VAD neuronal Silero + voces neuronales Piper (mexicana default, española) con fallback a voz del sistema.
- Ajustes muestra el motor activo (`VOZ: NEURONAL/SISTEMA/SIN VOZ`) y botones **Probar voz** y **Diagnosticar** (dice si falla al generar o al reproducir).
- Si no suena: revisa dispositivo de salida (cuidado con drivers virtuales tipo FxSound), volumen por app y que el micrófono tenga permiso.

## Configuración

Palabra de activación, micrófono, pausa de fin, tu nombre, iniciativa, voz y velocidad, IA, SMTP. Claves cifradas en `%APPDATA%\ai-desktop-assistant`.

## Privacidad

Lee la [Política de Privacidad](PRIVACY.md). Resumen:

- Audio y transcripción 100% locales. Sin telemetría ni analytics.
- Red solo cuando tú la pides (clima, noticias, IA con tu key, updates).
- La IA con tu key envía tus preguntas a ese proveedor (opcional).

## Riesgos

- Puede ejecutar PowerShell dictado o generado por IA: **todo lo delicado pide permiso** (apagados, borrados, servicios, comandos, email). El filtro de lista negra no es defensa completa: revisa antes de aceptar.
- Sin firma comercial: SmartScreen avisará hasta firmarlo.

## Desarrollo

- `npm install` y `npm run setup` (modelo Vosk ~40 MB + Piper/voces ~150 MB, una vez).
- `npm start` · `npm test` (unitarias + renderer) · `npm run lint` · CI en GitHub.
- `python src/main/wake.py --self-test` verifica el VAD sin micro.
- `VOXDESK_NO_WAKE=1` arranca sin abrir el micro (verificación).

## Publicar una release

1. Versión en `package.json`, push a `main` (CI debe estar verde).
2. `npm run build` → verifica `dist/VoxDesk-<versión>-setup.exe`.
3. Release en GitHub con el `.exe` **y** `dist/latest.yml` (sin el yml el auto-update falla con 404).
4. Espejo en itch.io.

## Licencia

Privado hasta nuevo aviso. Contacta al autor para uso comercial.
