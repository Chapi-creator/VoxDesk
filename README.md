[![Build](https://github.com/Chapi-creator/VoxDesk/actions/workflows/test.yml/badge.svg)](https://github.com/Chapi-creator/VoxDesk/actions/workflows/test.yml)
[![Release](https://img.shields.io/github/v/release/Chapi-creator/VoxDesk)](https://github.com/Chapi-creator/VoxDesk/releases)
[![Licencia GPL-3.0](https://img.shields.io/badge/licencia-GPL--3.0-blue)](LICENSE)
[![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D4)](https://github.com/Chapi-creator/VoxDesk/releases)

[English version](README.en.md)

# VoxDesk

**Asistente de voz local-first para Windows, estilo JARVIS.** Habla (o escribe) y tu PC obedece: apps, archivos, sistema, timers, rutinas, OCR, control remoto desde el móvil — y opcionalmente IA.

![VoxDesk](assets/cover.png)

Lo que lo hace distinto: **tu voz no sale de tu PC**. La transcripción (Vosk), la detección de voz (Silero) y la síntesis (Piper) corren 100% en local. Sin cuentas, sin nube, sin telemetría.

## Descargar (2 minutos)

1. Baja `VoxDesk-X.Y.Z-setup.exe` de [**Releases**](https://github.com/Chapi-creator/VoxDesk/releases).
2. Siguiente, siguiente. Sin Python, sin cuentas, sin keys.
3. Di tu palabra de activación (por defecto **"asistente"**) o escribe en la consola.

> Si SmartScreen avisa (sin firma comercial): *Más información > Ejecutar de todas formas*.
> La app avisa sola de actualizaciones y tú eliges cuándo reiniciar.

**Requisitos:** Windows 10/11 de 64 bits + micrófono. Todo lo demás viene incluido.

## Qué sabe hacer

**Control del PC** — `abre chrome`, `abre youtube`, `sube el volumen`, `captura la pantalla`, `bloquea`, `cierra todo`, `mata el proceso 1234`, `vacía la papelera`, `apaga el equipo`…
**Compuestos** — `abre chrome y pon música` (múltiples órdenes con *y / luego / después*).
**Te entiende aunque varíes** — `apaga la compu` = `apaga el equipo`; pregunta `¿quisiste decir…?` cuando duda (di **sí**); aprende con 👍/👎; recuerda contexto (`a las 8`, `y en Madrid`, `repítelo`).
**Te enseña trucos** — `cuando diga trabajo abre chrome` → desde entonces obedece. Rutinas (`todos los días a las 8 dime el clima`), recordatorios, macros, notas.
**Con personalidad** — te saluda por tu nombre, varía sus frases, opina del café, te resume el día al arrancar.
**Utilidades** — hora/fecha, clima, calculadora en español (`cuánto es el 15 por ciento de 240`), temporizadores, QR, noticias, email/WhatsApp por voz, `lee esto` (OCR).
**Botón que para de verdad** — a mitad de respuesta, el botón de hablar lo detiene todo.
**Control remoto** — desde el móvil en tu WiFi: QR en Ajustes, sin nube.
**IA opcional** — Gemini, OpenAI, Groq, DeepSeek, Anthropic, Ollama, LM Studio… Sin IA configurada, todo lo anterior funciona igual.

## Voz

- **Oídos**: Vosk offline (rápido incluido; preciso de 2,3 GB descargable desde la app) + VAD neuronal Silero. Palabra de activación configurable con detección tolerante.
- **Boca**: Piper neuronal (mexicana por defecto, española y argentina incluidas, más descargables) con respaldo a voz del sistema. Ajustes muestra el motor en uso, velocidad, y botones **Probar voz**, **Diagnosticar** y **Diagnosticar micrófono**.
- Si no suena: revisa salida de audio, volumen por app y permiso de micrófono.

## Privacidad (resumen; ver [PRIVACY.md](PRIVACY.md))

- Audio, transcripción, memoria y cerebro: **100% locales**. Cero telemetría.
- Red solo cuando tú la pides: clima, noticias, velocidad, IA con **tu** key, updates.
- Tus datos viven en `%APPDATA%\ai-desktop-assistant` (desinstalar no los borra; hay botón **Borrar mis datos** en Ajustes).

## Seguridad

Puede ejecutar PowerShell y abrir apps: **todo lo delicado pide permiso** (apagados, borrados, servicios, comandos, email). El filtro de lista negra no es defensa completa: revisa antes de aceptar.

## Desarrollo

```bash
npm install
npm run setup     # modelo Vosk ~40 MB + Piper/voces ~150 MB (una vez)
npm start         # correr en dev
npm test          # 200+ tests (unitarias, renderer, integración)
npm run lint
```

- `python src/main/wake.py --self-test[-capture|-wake]` verifica voz sin micro.
- `VOXDESK_NO_WAKE=1` arranca sin abrir el micro.
- CI en GitHub en cada push.

## Publicar una release

1. Versión en `package.json`, push a `main` (CI verde).
2. `npm run build` → verifica `dist/VoxDesk-<versión>-setup.exe`.
3. Release en GitHub con el `.exe` **y** `dist/latest.yml` (sin el yml el auto-update falla).

## Licencia

**GPL-3.0** — ver [LICENSE](LICENSE). Eres libre de usar, modificar y compartir; si distribuyes cambios, comparte el código igual. Ver [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) por los componentes de terceros.
