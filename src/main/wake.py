import sys, os, json, re, struct, math, collections, time
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
import vosk
import pyaudio

MODEL_PATH = os.path.join(
    getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__))),
    'vosk-model', 'vosk-model-small-es-0.42')
RATE = 16000
FRAME_MS = 30
FRAME_SIZE = int(RATE * FRAME_MS / 1000)
LEVEL_INTERVAL = 0.1
LISTEN_TRIGGER = os.path.join(os.environ.get('TEMP', ''), 'voxdesk_listen_trigger')

WAKE_WORDS = ['asistente']
END_PAUSE = 1.2

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

def capture_speech(stream, timeout=15, initial_frames=None, end_pause=None):
    frames = []
    preroll = collections.deque(maxlen=20)
    triggered = False
    started = time.time()
    speech_ended = None
    last_emit = 0.0
    hp = HighPass()
    END = end_pause if end_pause else END_PAUSE
    floor = 0.02
    pending = list(initial_frames) if initial_frames else None

    def consume(frame):
        nonlocal triggered, frames, speech_ended, floor
        level = rms_level(frame)
        if level > 0.08:
            is_speech = True
        elif level > floor * 1.6:
            is_speech = True
        else:
            is_speech = False
            floor = 0.9 * floor + 0.1 * level
        if not triggered:
            preroll.append(frame)
            if is_speech:
                consecutive = 0
                for i in range(len(preroll) - 1, -1, -1):
                    if rms_level(preroll[i]) > floor:
                        consecutive += 1
                    else:
                        break
                if consecutive >= 2:
                    triggered = True
                    frames = list(preroll)
                    speech_ended = None
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


def main():
    global stream, p, _model, WAKE_WORDS, END_PAUSE
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('wakewords', nargs='*')
    ap.add_argument('--device', default='')
    ap.add_argument('--end-pause', type=float, default=1.2)
    ap.add_argument('--list-devices', action='store_true')
    args = ap.parse_args()
    if args.wakewords:
        WAKE_WORDS = [w.lower() for w in args.wakewords]
    END_PAUSE = args.end_pause

    if args.list_devices:
        try:
            emit(devices=list_devices())
        except Exception as e:
            emit(error=str(e))
        return

    try:
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
                audio = capture_speech(stream, timeout=15, initial_frames=list(ringbuf))
                if audio is not None:
                    recognize(audio)
                else:
                    emit(error="No te escuché")
                rec = vosk.KaldiRecognizer(_model, RATE)
                continue

            if detect_wake(text, WAKE_WORDS):
                emit(wake=True)
                rec = vosk.KaldiRecognizer(_model, RATE)

                audio = capture_speech(stream, initial_frames=list(ringbuf))
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
