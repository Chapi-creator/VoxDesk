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
    sys.stdout.write(json.dumps(kw) + '\n')
    sys.stdout.flush()

def detect_wake(text, words):
    lower = text.lower()
    return any(re.search(r'(?<!\w)' + re.escape(w) + r'(?!\w)', lower) for w in words)

def capture_speech(stream, timeout=15, initial_frames=None, end_pause=None, vad=None):
    frames = []
    preroll = collections.deque(maxlen=20)
    triggered = False
    started = time.time()
    speech_ended = None
    last_emit = 0.0
    hp = HighPass()
    END = end_pause if end_pause else END_PAUSE
    floor = 0.02
    consec = [0]
    pending = list(initial_frames) if initial_frames else None
    if vad is not None:
        try:
            vad.reset()
        except Exception:
            vad = None

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
        if triggered and speech_ended and now - speech_ended > END:
            break
        if os.path.exists(LISTEN_TRIGGER):
            try: os.remove(LISTEN_TRIGGER)
            except: pass

        frame = hp.process(stream.read(FRAME_SIZE, exception_on_overflow=False))
        level = rms_level(frame)
        is_speech = consume(frame)

        if now - last_emit >= LEVEL_INTERVAL:
            emit(level=round(level, 4), speaking=is_speech or triggered, vad="speaking" if triggered else "listening")
            last_emit = now

    if not frames or len(frames) < 10:
        return None
    emit(level=0.0, speaking=False, vad="processing")
    return b''.join(frames)

_model = None

def recognize(raw):
    global _model
    try:
        rec = vosk.KaldiRecognizer(_model, RATE)
        rec.AcceptWaveform(raw)
        res = json.loads(rec.FinalResult())
        text = res.get('text', '').strip()
        if text:
            emit(text=text)
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


def main():
    global stream, p, _model, WAKE_WORDS, END_PAUSE
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('wakewords', nargs='*')
    ap.add_argument('--device', default='')
    ap.add_argument('--end-pause', type=float, default=1.2)
    ap.add_argument('--list-devices', action='store_true')
    ap.add_argument('--self-test', action='store_true')
    args = ap.parse_args()
    if args.wakewords:
        WAKE_WORDS = [w.lower() for w in args.wakewords]
    END_PAUSE = args.end_pause

    if args.self_test:
        sys.exit(self_test())

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
        _model = vosk.Model(MODEL_PATH)

        rec = vosk.KaldiRecognizer(_model, RATE)
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

        while True:
            data = stream.read(FRAME_SIZE, exception_on_overflow=False)
            ringbuf.append(data)
            final = rec.AcceptWaveform(data)

            if final:
                result = json.loads(rec.Result())
                text = result.get('text', '')
            else:
                result = json.loads(rec.PartialResult())
                text = result.get('partial', '')

            if os.path.exists(LISTEN_TRIGGER):
                try: os.remove(LISTEN_TRIGGER)
                except: pass
                audio = capture_speech(stream, timeout=15, initial_frames=list(ringbuf),
                                         end_pause=args.end_pause, vad=vad)
                if audio is not None:
                    recognize(audio)
                else:
                    emit(error="No te escuché")
                rec = vosk.KaldiRecognizer(_model, RATE)
                continue

            if detect_wake(text, WAKE_WORDS):
                emit(wake=True)
                rec = vosk.KaldiRecognizer(_model, RATE)

                audio = capture_speech(stream, initial_frames=list(ringbuf),
                                         end_pause=args.end_pause, vad=vad)
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
