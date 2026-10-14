import sys, os, json, re, struct, math, collections, time
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
try:
    import vosk
    import pyaudio
except ImportError:
    vosk = None
    pyaudio = None

BASE_DIR = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, 'vosk-model', 'vosk-model-small-es-0.42')
SILERO_PATH = os.path.join(BASE_DIR, 'silero_vad.onnx')
RATE = 16000
FRAME_MS = 32
FRAME_SIZE = 512
LEVEL_INTERVAL = 0.1
LISTEN_TRIGGER = os.path.join(os.environ.get('TEMP', ''), 'voxdesk_listen_trigger')

WAKE_WORDS = ['asistente']
END_PAUSE = 1.2


class SileroVad:
    # Fase 8: VAD neuronal (MIT, ~2MB). Ventana 512 @16k. Sin él, se usa energía.
    def __init__(self, model_path, threshold=0.5):
        import onnxruntime
        import numpy as np
        self._np = np
        self.threshold = threshold
        self.sess = onnxruntime.InferenceSession(model_path, providers=['CPUExecutionProvider'])
        self.sr = np.array(RATE, dtype=np.int64)
        self.reset()

    def reset(self):
        np = self._np
        self.h = np.zeros((2, 1, 64), dtype=np.float32)
        self.c = np.zeros((2, 1, 64), dtype=np.float32)

    def is_speech(self, frame):
        np = self._np
        x = np.frombuffer(frame, dtype=np.int16).astype(np.float32) / 32768.0
        x = x[:512] if x.shape[0] >= 512 else np.pad(x, (0, 512 - x.shape[0]))
        out, self.h, self.c = self.sess.run(
            None, {'input': x.reshape(1, -1), 'sr': self.sr, 'h': self.h, 'c': self.c})
        prob = float(out[0][0])
        return prob >= self.threshold, prob

def rms_level(frame):
    count = len(frame) // 2
    if count == 0:
        return 0.0
    n = count * 2
    if len(frame) < n:
        return 0.0
    fmt = '<' + 'h' * count
    samples = struct.unpack(fmt, frame[:n])
    avg = sum(s * s for s in samples) / count
    return min(1.0, math.sqrt(avg) / 4096.0)

class HighPass:
    def __init__(self, rate=RATE, fc=150.0):
        dt = 1.0 / rate
        rc = 1.0 / (2 * math.pi * fc)
        self.alpha = rc / (rc + dt)
        self._xi = 0.0
        self._yi = 0.0
        self._xi2 = 0.0
        self._yi2 = 0.0

    def process(self, frame):
        count = len(frame) // 2
        if count == 0:
            return frame
        n = count * 2
        if len(frame) < n:
            return frame
        fmt = '<' + 'h' * count
        samples = struct.unpack(fmt, frame[:n])
        a = self.alpha
        xi = self._xi
        yi = self._yi
        xi2 = self._xi2
        yi2 = self._yi2
        out = [0] * count
        for i, s in enumerate(samples):
            yi = a * (yi + s - xi)
            xi = s
            yi2 = a * (yi2 + yi - xi2)
            xi2 = yi
            if yi2 > 32767:
                v = 32767
            elif yi2 < -32768:
                v = -32768
            else:
                v = int(yi2)
            out[i] = v
        self._xi = xi
        self._yi = yi
        self._xi2 = xi2
        self._yi2 = yi2
        return struct.pack(fmt, *out)

def emit(**kw):
    if _quiet_emit:
        return
    sys.stdout.write(json.dumps(kw) + '\n')
    sys.stdout.flush()

# Calidad de un resultado Vosk: (confianza media, duración). Puro → testeable.
def result_quality(result):
    words = result.get('result') or []
    confs = []
    for w in words:
        if isinstance(w, dict):
            try:
                confs.append(float(w.get('conf', 0)))
            except (TypeError, ValueError):
                pass
    if not confs:
        return 0.0, 0.0
    try:
        dur = float(words[-1].get('end', 0)) - float(words[0].get('start', 0))
    except (TypeError, ValueError, IndexError):
        dur = 0.0
    return sum(confs) / len(confs), max(0.0, dur)

# True si el frame trae muestras recortadas (ganancia al tope). Puro.
def frame_clipped(frame, thresh=32000):
    n = len(frame) // 2
    if n <= 0:
        return False
    k = min(n, 256)
    try:
        for s in struct.unpack('<' + 'h' * k, frame[:k * 2]):
            if abs(s) >= thresh:
                return True
    except Exception:
        return False
    return False

# Umbrales medidos: voz clara 0.89-0.94, ruido 0.0. Margen amplio.
WAKE_MIN_CONF = 0.5
WAKE_MIN_DUR = 0.4
CMD_MIN_CONF = 0.4

def detect_wake(text, words):
    lower = text.lower()
    return any(re.search(r'(?<!\w)' + re.escape(w) + r'(?!\w)', lower) for w in words)

def _lev(a, b):
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (0 if ca == cb else 1)))
        prev = cur
    return prev[len(b)]

# Exacta con bordes de palabra (vale multi-palabra "oye vox"). Base de todo.
def exact_wake(text, words):
    lower = ' ' + text.lower() + ' '
    for w in words or []:
        wl = w.lower().strip()
        if wl and re.search(r'(?<!\w)' + re.escape(wl) + r'(?!\w)', lower):
            return True
    return False

# D: la palabra de Ajustes (sea cual sea) se detecta aunque Vosk la oiga con
# 1 letra de error ("asistent"). SIN prefijos: "asiste"/"asista" son palabras
# reales y disparaban solo el detector (falsos positivos por ruido). Puro.
def fuzzy_wake(text, words):
    lower = ' ' + text.lower() + ' '
    for w in words or []:
        wl = w.lower().strip()
        if not wl:
            continue
        if exact_wake(text, [w]):
            return True
        if len(wl) <= 3 or ' ' in wl:
            continue
        for tok in re.findall(r'[a-záéíóúñü]+', lower):
            if len(tok) < 4:
                continue
            if _lev(tok, wl) <= max(1, len(wl) // 5):
                return True
    return False

# Antitormenta: mínimo 3 s entre despertares, máximo 5 por minuto.
# Puro → testeable. Devuelve (allowed, hist_nueva, last_nuevo).
def wake_allowed(hist, last_at, now, min_gap=3.0, max_per_min=5):
    h = [t for t in (hist or []) if now - t < 60.0]
    if now - (last_at or 0.0) < min_gap:
        return False, h, last_at
    if len(h) >= max_per_min:
        return False, h, last_at
    h = h + [now]
    return True, h, now

# D: gramática restringida para la escucha en espera. El decodificador SOLO
# puede oír la palabra o [unk]: la detecta mejor y gasta menos CPU.
# Los comandos tras despertar siguen con decodificador completo.
def wake_grammar(words):
    seen = []
    for w in words or ['asistente']:
        wl = (w or '').lower().strip()
        if wl and wl not in seen:
            seen.append(wl)
    if not seen:
        seen = ['asistente']
    return json.dumps(seen + ['[unk]'])

def make_rec(grammar=None):
    try:
        if grammar:
            r = vosk.KaldiRecognizer(_model, RATE, grammar)
        else:
            r = vosk.KaldiRecognizer(_model, RATE)
        try:
            r.SetWords(True)
        except Exception:
            pass
        return r
    except Exception:
        try:
            return vosk.KaldiRecognizer(_model, RATE)
        except Exception:
            return None

def adaptive_end(speech_sec, base, mult):
    # A2: la pausa exigida crece con lo que llevas hablando.
    if speech_sec < 2:
        e = max(base, 1.5)
    elif speech_sec < 8:
        e = max(base, 2.5)
    else:
        e = max(base, 3.5)
    return min(8.0, max(1.0, e * mult))


PATIENCE_MULT = {'tranquilo': 1.8, 'normal': 1.0, 'rapido': 0.6}


def capture_speech(stream, timeout=30, initial_frames=None, end_pause=None, vad=None, patience='normal', stop_trigger=None):
    frames = []
    preroll = collections.deque(maxlen=20)
    triggered = False
    started = time.time()
    speech_ended = None
    last_emit = 0.0
    hp = HighPass()
    END = end_pause if end_pause else END_PAUSE
    MULT = PATIENCE_MULT.get(patience, 1.0)
    STOP = stop_trigger or os.path.join(os.environ.get('TEMP', ''), 'voxdesk_stop_trigger')
    floor = 0.02
    consec = [0]
    speech_sec = [0.0]
    pending = list(initial_frames) if initial_frames else None
    if vad is not None:
        try:
            vad.reset()
        except Exception:
            vad = None
    # Partial incremental (sin vosk no hay partial: se usa solo energía+END).
    rec = None
    if vosk is not None and _model is not None:
        try:
            rec = vosk.KaldiRecognizer(_model, RATE)
        except Exception:
            rec = None
    last_partial = ['']
    partial_since = [0.0]

    def energy(frame):
        nonlocal floor
        level = rms_level(frame)
        if level > 0.08:
            return True
        if level > floor * 1.6:
            return True
        floor = 0.9 * floor + 0.1 * level
        return False

    def consume(frame):
        nonlocal triggered, frames, speech_ended
        level = rms_level(frame)
        if vad is not None:
            try:
                is_speech, _ = vad.is_speech(frame)
            except Exception:
                is_speech = energy(frame)
        else:
            is_speech = energy(frame)
        if is_speech:
            speech_sec[0] += FRAME_MS / 1000.0
        if not triggered:
            preroll.append(frame)
            if is_speech:
                consec[0] += 1
                if vad is not None:
                    if consec[0] >= 2:
                        triggered = True
                        frames = list(preroll)
                        speech_ended = None
                else:
                    n = 0
                    for i in range(len(preroll) - 1, -1, -1):
                        if rms_level(preroll[i]) > floor:
                            n += 1
                        else:
                            break
                    if n >= 2:
                        triggered = True
                        frames = list(preroll)
                        speech_ended = None
            else:
                consec[0] = 0
        else:
            frames.append(frame)
            if not is_speech:
                if speech_ended is None:
                    speech_ended = time.time()
            else:
                speech_ended = None
        return is_speech

    while pending:
        consume(hp.process(pending.pop(0)))

    while True:
        now = time.time()
        elapsed = now - started
        if elapsed > timeout:
            break
        end_need = adaptive_end(speech_sec[0], END, MULT)
        partial_fresh = (now - partial_since[0]) < 1.0
        if triggered and speech_ended and (now - speech_ended) > end_need and not partial_fresh:
            break
        if os.path.exists(STOP):
            try: os.remove(STOP)
            except: pass
            break
        if os.path.exists(LISTEN_TRIGGER):
            try: os.remove(LISTEN_TRIGGER)
            except: pass

        frame = hp.process(stream.read(FRAME_SIZE, exception_on_overflow=False))
        level = rms_level(frame)
        is_speech = consume(frame)

        if rec is not None and triggered:
            try:
                rec.AcceptWaveform(frame)
                p = json.loads(rec.PartialResult()).get('partial', '')
                if p != last_partial[0]:
                    last_partial[0] = p
                    partial_since[0] = now
            except Exception:
                pass

        if now - last_emit >= LEVEL_INTERVAL:
            emit(level=round(level, 4), speaking=is_speech or triggered, vad="speaking" if triggered else "listening")
            last_emit = now

    if not frames or len(frames) < 10:
        return None
    emit(level=0.0, speaking=False, vad="processing")
    return b''.join(frames)

_model = None
_quiet_emit = False

def recognize(raw):
    global _model
    try:
        rec = vosk.KaldiRecognizer(_model, RATE)
        try:
            rec.SetWords(True)
        except Exception:
            pass
        rec.AcceptWaveform(raw)
        res = json.loads(rec.FinalResult())
        text = res.get('text', '').strip()
        if text:
            conf, _dur = result_quality(res)
            # Ruido con forma de palabras: se ignora en silencio (no alimenta loops).
            if conf < CMD_MIN_CONF:
                emit(silent=True)
                return
            emit(text=text, conf=round(conf, 3))
        else:
            emit(error="No te entendí")
    except Exception as e:
        emit(error=str(e))

stream = None
p = None

def list_devices():
    import pyaudio
    p = pyaudio.PyAudio()
    devs = []
    for i in range(p.get_device_count()):
        info = p.get_device_info_by_index(i)
        if info.get('maxInputChannels', 0) > 0:
            devs.append({'index': i, 'name': info.get('name', '')})
    p.terminate()
    return devs


def self_test():
    # Sin micro ni vosk: verifica que Silero carga, infiere rápido y calla en silencio.
    try:
        import numpy as np
    except ImportError:
        print(json.dumps({'ok': False, 'error': 'falta numpy'}))
        return 2
    if not os.path.exists(SILERO_PATH):
        print(json.dumps({'ok': False, 'error': 'sin modelo: ' + SILERO_PATH}))
        return 2
    try:
        vad = SileroVad(SILERO_PATH)
    except Exception as e:
        print(json.dumps({'ok': False, 'error': 'no carga: ' + str(e)[:200]}))
        return 1
    silence = np.zeros(512, dtype=np.int16).tobytes()
    t0 = time.time()
    probs = []
    for _ in range(5):
        ok, p = vad.is_speech(silence)
        probs.append(p)
    dt = (time.time() - t0) / 5 * 1000
    ok = all(p < 0.5 for p in probs)
    print(json.dumps({'ok': ok, 'silence_max': round(max(probs), 4), 'ms_por_frame': round(dt, 2)}))
    return 0 if ok else 1


def self_test_wake():
    # Sin micro ni vosk: la palabra de Ajustes (cualquiera) se detecta exacta,
    # a medias y con 1 letra mal; lo ajeno no dispara. D=activación.
    cases = [
        ('asistente vengo', ['asistente'], True),
        ('hola asistente', ['asistente'], True),
        ('asistent', ['asistente'], True),
        ('asistentw', ['asistente'], True),
        ('asist', ['asistente'], False),
        ('asiste', ['asistente'], False),
        ('asista', ['asistente'], False),
        ('computadoras', ['computadora'], True),
        ('hola mundo', ['asistente'], False),
        ('voy', ['vox'], False),
        ('vox', ['vox'], True),
        ('oye vox despierta', ['oye vox'], True),
        ('oye', ['oye vox'], False),
    ]
    bad = [f'{t!r}' for t, w, exp in cases if fuzzy_wake(t, w) != exp]
    g = wake_grammar(['Oye Vox'])
    ok = not bad and '"oye vox"' in g and '"[unk]"' in g
    # Puerta de calidad: voz clara pasa, ruido/vacío no.
    q_ok, q_dur = result_quality({'result': [{'conf': 0.9, 'start': 0.0, 'end': 1.0}, {'conf': 0.95, 'start': 1.0, 'end': 1.8}]})
    ok = ok and abs(q_ok - 0.925) < 0.001 and abs(q_dur - 1.8) < 0.001
    ok = ok and result_quality({'result': []}) == (0.0, 0.0)
    ok = ok and result_quality({}) == (0.0, 0.0)
    # Clipping: tope de escala sí, señal normal no.
    ok = ok and frame_clipped(struct.pack('<4h', 32767, -32767, 100, -100)) is True
    ok = ok and frame_clipped(struct.pack('<4h', 100, -200, 300, -400)) is False
    ok = ok and frame_clipped(b'') is False
    # exact_wake: exacta sí (sirve para parciales), trozos no.
    ok = ok and exact_wake('hola asistente', ['asistente']) is True
    ok = ok and exact_wake('asist', ['asistente']) is False
    ok = ok and exact_wake('oye vox ya', ['oye vox']) is True
    # Antitormenta: pega junto no, con pausa sí; 5/min topa.
    a1, h1, l1 = wake_allowed([], 0.0, 100.0)
    a2, h2, l2 = wake_allowed(h1, l1, 101.0)
    a3, h3, l3 = wake_allowed(h2, l2, 104.0)
    ok = ok and a1 and not a2 and a3
    h, l = [], 0.0
    for i in range(5):
        a, h, l = wake_allowed(h, l, 200.0 + i * 5.0)
        ok = ok and a
    a, h, l = wake_allowed(h, l, 225.0)
    ok = ok and not a
    print(json.dumps({'ok': ok, 'fallos': bad}))
    return 0 if ok else 1


def mic_check(seconds=3):
    # Diagnóstico sin modelos: graba N s e informa saturación real + consejo.
    # Sale por stdout como JSON (lo usa Ajustes > Diagnosticar micrófono).
    if pyaudio is None:
        print(json.dumps({'ok': False, 'error': 'sin pyaudio'}))
        return 1
    try:
        p = pyaudio.PyAudio()
        dev = None
        for i in range(p.get_device_count()):
            if p.get_device_info_by_index(i).get('maxInputChannels', 0) > 0:
                dev = i
                break
        if dev is None:
            print(json.dumps({'ok': False, 'error': 'sin micrófono'}))
            return 1
        st = p.open(format=pyaudio.paInt16, channels=1, rate=RATE, input=True,
                    input_device_index=dev, frames_per_buffer=FRAME_SIZE)
        n = int(seconds * RATE / FRAME_SIZE)
        clip = 0
        total = 0
        peak = 0.0
        speech = 0
        for _ in range(n):
            try:
                data = st.read(FRAME_SIZE, exception_on_overflow=False)
            except Exception:
                break
            if frame_clipped(data):
                clip += 1
            total += 1
            lvl = rms_level(data)
            peak = max(peak, lvl)
            if lvl > 0.08:
                speech += 1
        try:
            st.stop_stream(); st.close()
        except Exception:
            pass
        try:
            p.terminate()
        except Exception:
            pass
        clip_ratio = (clip / total) if total else 0.0
        if clip_ratio > 0.05:
            verdict = 'SATURADO'
            consejo = 'Baja la ganancia: Windows > Sonido > Entrada > volumen del micrófono.'
        elif peak < 0.05:
            verdict = 'BAJO'
            consejo = 'Casi no se oye nada: sube la ganancia o acércate al micro.'
        else:
            verdict = 'BIEN'
            consejo = 'Nivel sano.'
        print(json.dumps({'ok': True, 'verdict': verdict, 'clip': round(clip_ratio, 3),
                          'peak': round(peak, 3), 'speech': round(speech / max(total, 1), 3),
                          'consejo': consejo}))
        return 0
    except Exception as e:
        print(json.dumps({'ok': False, 'error': str(e)[:200]}))
        return 1


def self_test_capture():
    # Sin micro ni modelos: pausa media NO corta, pausa larga SÍ (VAD energía).
    # OJO: el END es tiempo real; se mockea el reloj (32ms/frame) para ir rápido.
    global _quiet_emit
    _quiet_emit = True
    import math
    real_time = time.time
    clock = [real_time()]

    def fake_time():
        return clock[0]

    sr = RATE
    n = FRAME_SIZE

    def tone(sec):
        out = bytearray()
        for i in range(int(sr * sec)):
            v = int(20000 * math.sin(2 * math.pi * 440 * i / sr))
            out += struct.pack('<h', v)
        return bytes(out)

    def silence(sec):
        return bytes(n * 2 * int(sr * sec / n))

    seq = tone(1.0) + silence(0.8) + tone(1.0) + silence(6.0)

    class FakeStream:
        def __init__(self, data):
            self.data = data
            self.pos = 0

        def read(self, size, exception_on_overflow=False):
            clock[0] += size / sr
            chunk = self.data[self.pos:self.pos + size * 2]
            self.pos += size * 2
            if len(chunk) < size * 2:
                chunk = chunk + bytes(size * 2 - len(chunk))
            return chunk

    time.time = fake_time
    try:
        raw = capture_speech(FakeStream(seq), timeout=30, vad=None)
    finally:
        time.time = real_time
        _quiet_emit = False
    if raw is None:
        print(json.dumps({'ok': False, 'error': 'no capturó nada'}))
        return 1
    dur = len(raw) / 2 / sr
    ok = 4.0 < dur < 7.5
    print(json.dumps({'ok': ok, 'capturado_s': round(dur, 2)}))
    return 0 if ok else 1


def main():
    global stream, p, _model, WAKE_WORDS, END_PAUSE
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('wakewords', nargs='*')
    ap.add_argument('--device', default='')
    ap.add_argument('--end-pause', type=float, default=2.2)
    ap.add_argument('--patience', default='normal', choices=['tranquilo', 'normal', 'rapido'])
    ap.add_argument('--model-dir', default='')
    ap.add_argument('--list-devices', action='store_true')
    ap.add_argument('--self-test', action='store_true')
    ap.add_argument('--self-test-capture', action='store_true')
    ap.add_argument('--self-test-wake', action='store_true')
    ap.add_argument('--mic-check', action='store_true')
    args = ap.parse_args()
    if args.wakewords:
        WAKE_WORDS = [w.lower() for w in args.wakewords]
    END_PAUSE = args.end_pause

    if args.self_test:
        sys.exit(self_test())

    if args.self_test_capture:
        sys.exit(self_test_capture())

    if args.self_test_wake:
        sys.exit(self_test_wake())

    if args.mic_check:
        sys.exit(mic_check())

    if args.list_devices:
        try:
            emit(devices=list_devices())
        except Exception as e:
            emit(error=str(e))
        return

    try:
        if vosk is None or pyaudio is None:
            emit(error='Faltan dependencias de audio (vosk, pyaudio)')
            return
        model_path = MODEL_PATH
        if args.model_dir:
            cand = os.path.join(args.model_dir, 'am', 'final.mdl')
            if os.path.exists(args.model_dir) and os.path.exists(cand):
                model_path = args.model_dir
            else:
                emit(error='Modelo no válido en ' + args.model_dir + ', uso el incluido')
        _model = vosk.Model(model_path)

        # D: la espera escucha SOLO la palabra (gramática); los comandos van completo.
        rec = make_rec(wake_grammar(WAKE_WORDS))
        if rec is None:
            emit(error='No pude iniciar el reconocedor')
            return
        p = pyaudio.PyAudio()
        dev_index = None
        if args.device != '':
            for i in range(p.get_device_count()):
                info = p.get_device_info_by_index(i)
                if info.get('maxInputChannels', 0) > 0 and (str(i) == args.device or args.device.lower() in str(info.get('name', '')).lower()):
                    dev_index = i
                    break
        if dev_index is None:
            for i in range(p.get_device_count()):
                info = p.get_device_info_by_index(i)
                if info.get('maxInputChannels', 0) > 0:
                    dev_index = i
                    break
        stream = p.open(format=pyaudio.paInt16, channels=1, rate=RATE,
                        input=True, input_device_index=dev_index, frames_per_buffer=FRAME_SIZE)
        ringbuf = collections.deque(maxlen=20)

        vad = None
        if os.path.exists(SILERO_PATH):
            try:
                vad = SileroVad(SILERO_PATH)
            except Exception:
                vad = None
        _clip_n = 0
        _clip_total = 0
        _clip_warned_at = 0.0
        _wake_hist = []
        _wake_last = 0.0

        while True:
            data = stream.read(FRAME_SIZE, exception_on_overflow=False)
            ringbuf.append(data)
            # Saturación: frames recortados en ventana de 64 (~2 s). Aviso
            # throttled; la app no puede bajar tu ganancia, solo avisarte.
            _clip_n += frame_clipped(data)
            _clip_total += 1
            if _clip_total >= 64:
                try:
                    if _clip_n / 64.0 > 0.05 and time.time() - _clip_warned_at > 30:
                        _clip_warned_at = time.time()
                        emit(level=1.0, speaking=False, vad='listening', clipped=True)
                except Exception:
                    pass
                _clip_n = 0
                _clip_total = 0
            final = rec.AcceptWaveform(data)

            if final:
                result = json.loads(rec.Result())
                text = result.get('text', '')
            else:
                result = json.loads(rec.PartialResult())
                text = result.get('partial', '')

            if os.path.exists(LISTEN_TRIGGER):
                try:
                    with open(LISTEN_TRIGGER) as _tf:
                        _trig = _tf.read().strip()
                except Exception:
                    _trig = ''
                _is_ptt = _trig == 'ptt'
                _is_follow = _trig == 'followup'
                try: os.remove(LISTEN_TRIGGER)
                except: pass
                audio = capture_speech(stream, timeout=(60 if _is_ptt else 30), initial_frames=list(ringbuf),
                                         end_pause=args.end_pause, vad=vad, patience=args.patience)
                if audio is not None:
                    recognize(audio)
                elif _is_follow:
                    emit(silent=True)
                else:
                    emit(error="No te escuché")
                rec = make_rec(wake_grammar(WAKE_WORDS)) or vosk.KaldiRecognizer(_model, RATE)
                continue

            # SOLO finales despiertan: los parciales alucinan la palabra con
            # micros saturados y no traen confianza. Cuesta ~0.5 s, mata chispazos.
            if final and fuzzy_wake(text, WAKE_WORDS):
                # Puerta de calidad: ruido con pinta de palabra no despierta.
                _qc, _qd = result_quality(result)
                if _qc < WAKE_MIN_CONF or _qd < WAKE_MIN_DUR:
                    rec = make_rec(wake_grammar(WAKE_WORDS)) or vosk.KaldiRecognizer(_model, RATE)
                    continue
                # Antitormenta: si el decodificador delira, no ametralla.
                _wake_ok, _wake_hist, _wake_last = wake_allowed(_wake_hist, _wake_last, time.time())
                if not _wake_ok:
                    rec = make_rec(wake_grammar(WAKE_WORDS)) or vosk.KaldiRecognizer(_model, RATE)
                    continue
                emit(wake=True)
                rec = make_rec(wake_grammar(WAKE_WORDS)) or vosk.KaldiRecognizer(_model, RATE)

                audio = capture_speech(stream, initial_frames=list(ringbuf),
                                         end_pause=args.end_pause, vad=vad, patience=args.patience)
                if audio is not None:
                    recognize(audio)
                else:
                    emit(error="No te escuché")

    except Exception:
        import traceback
        emit(error=traceback.format_exc())
        sys.exit(1)
    finally:
        try: stream.stop_stream(); stream.close()
        except: pass
        try: p.terminate()
        except: pass

if __name__ == "__main__":
    main()
