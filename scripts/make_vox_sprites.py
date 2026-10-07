# Genera los sprites de Vox (robot chibi) con Pillow. Sin assets externos, sin fuentes.
# Reglas: todo a 4x + LANCZOS, base RGB; la alfa sale de una máscara espejada
# (cada forma se dibuja en RGB y en blanco sobre negro). Verificado por píxeles.
from PIL import Image, ImageDraw

SS = 4
W = H = 200

HEAD = (30, 45, 170, 165)
OUTLINE = (27, 42, 173, 168)
SCREEN = (48, 70, 152, 140)

C_HEAD = (147, 167, 189)
C_OUT = (51, 64, 79)
C_SCREEN = (14, 20, 32)
C_CYAN = (79, 195, 247)
C_CORE = (216, 243, 255)
C_RED = (255, 82, 82)
C_STEM = (91, 107, 125)
C_PINK = (255, 150, 170, 90)
C_HL = (255, 255, 255, 50)

D = None  # draw RGB
M = None  # draw máscara


def B(box):
    return [v * SS for v in box]


def RRECT(box, r, fill):
    D.rounded_rectangle(B(box), radius=r * SS, fill=fill)
    M.rounded_rectangle(B(box), radius=r * SS, fill=255)


def ELL(box, fill=None, outline=None, width=1):
    D.ellipse(B(box), fill=fill, outline=outline, width=width * SS)
    M.ellipse(B(box), fill=255 if fill else None,
              outline=255 if outline else None, width=width * SS)


def RECT(box, fill):
    D.rectangle(B(box), fill=fill)
    M.rectangle(B(box), fill=255)


def LINE(box, fill, width=1):
    D.line(B(box), fill=fill, width=width * SS)
    M.line(B(box), fill=255, width=width * SS)


def ARC(box, start, end, fill, width=1):
    D.arc(B(box), start=start, end=end, fill=fill, width=width * SS)
    M.arc(B(box), start=start, end=end, fill=255, width=width * SS)


def base():
    # orejas
    RRECT((16, 95, 30, 115), 6, C_OUT)
    RRECT((170, 95, 184, 115), 6, C_OUT)
    ELL((20, 101, 26, 107), fill=C_CYAN)
    ELL((174, 101, 180, 107), fill=C_CYAN)
    # antena
    RECT((96, 16, 104, 46), C_STEM)
    ELL((91, 5, 109, 23), fill=C_RED)              # led
    # cabeza
    RRECT(OUTLINE, 38, C_OUT)
    RRECT(HEAD, 35, C_HEAD)
    ELL((44, 54, 72, 72), fill=C_HL)               # brillo
    # pantalla
    RRECT(SCREEN, 18, C_SCREEN)
    # mejillas
    ELL((56, 116, 70, 126), fill=C_PINK)
    ELL((130, 116, 144, 126), fill=C_PINK)


def eyes_open(y0=92, y1=112):
    for (ax, bx) in ((68, 88), (112, 132)):
        cx = (ax + bx) / 2
        RRECT((ax, y0, bx, y1), 8, C_CYAN)
        RRECT((cx - 5, y0 + 4, cx + 5, y1 - 4), 4, C_CORE)


def eyes_closed():
    for (ax, bx) in ((68, 88), (112, 132)):
        RRECT((ax, 100, bx, 104), 2, C_CYAN)


def eyes_x():
    for (ax, bx) in ((68, 88), (112, 132)):
        LINE((ax, 92, bx, 112), C_RED, width=5)
        LINE((bx, 92, ax, 112), C_RED, width=5)


def mouth_smile():
    ARC((88, 116, 112, 132), 20, 160, C_CYAN, width=4)


def mouth_open():
    ELL((90, 120, 110, 134), fill=C_CYAN)


def mouth_closed():
    RRECT((92, 124, 108, 129), 2, C_CYAN)


def mouth_flat():
    RRECT((90, 126, 110, 130), 2, C_RED)


def eyes_happy():
    for (ax, bx) in ((68, 88), (112, 132)):
        ARC((ax, 92, bx, 112), 200, 340, C_CYAN, width=5)


def mouth_big():
    ELL((86, 118, 114, 136), fill=C_CYAN)


def zzz():
    LINE((160, 56, 172, 56), C_CYAN, width=4)
    LINE((172, 56, 160, 68), C_CYAN, width=4)
    LINE((160, 68, 172, 68), C_CYAN, width=4)
    LINE((176, 36, 188, 36), C_CYAN, width=5)
    LINE((188, 36, 176, 50), C_CYAN, width=5)
    LINE((176, 50, 188, 50), C_CYAN, width=5)


def sweat():
    ELL((146, 96, 156, 110), fill=C_CYAN)


def build(name, fn):
    global D, M
    img = Image.new('RGB', (W * SS, H * SS), (14, 14, 24))
    mask = Image.new('L', (W * SS, H * SS), 0)
    D = ImageDraw.Draw(img, 'RGBA')
    M = ImageDraw.Draw(mask)
    base()
    fn()
    small = img.resize((W, H), Image.LANCZOS)
    msmall = mask.resize((W, H), Image.LANCZOS)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.paste(small, (0, 0), msmall)
    out.save(f'assets/vox/vox-{name}.png')
    return out


def main():
    import os
    os.makedirs('assets/vox', exist_ok=True)
    frames = {}
    frames['idle'] = build('idle', lambda: (eyes_open(), mouth_smile()))
    frames['blink'] = build('blink', lambda: (eyes_closed(), mouth_smile()))
    frames['listening'] = build('listening', lambda: (
        eyes_open(86, 118), mouth_open(),
        ELL((52, 2, 148, 98), outline=C_CYAN, width=4),
        ELL((64, 14, 136, 86), outline=C_CYAN, width=3)))
    frames['thinking'] = build('thinking', lambda: (
        eyes_open(86, 104), mouth_closed(),
        ELL((156, 62, 164, 70), fill=C_CYAN),
        ELL((168, 50, 178, 60), fill=C_CYAN),
        ELL((182, 36, 194, 48), fill=C_CYAN)))
    frames['speaking-open'] = build('speaking-open', lambda: (eyes_open(), mouth_open()))
    frames['speaking-closed'] = build('speaking-closed', lambda: (eyes_open(), mouth_closed()))
    frames['error'] = build('error', lambda: (eyes_x(), mouth_flat()))
    frames['sleep'] = build('sleep', lambda: (eyes_closed(), mouth_closed(), zzz()))
    frames['happy'] = build('happy', lambda: (eyes_happy(), mouth_big()))
    frames['worried'] = build('worried', lambda: (eyes_open(90, 104), mouth_flat(), sweat()))
    verify(frames)
    print('sprites ok:', sorted(frames))


def verify(frames):
    import os
    assert set(frames) == {'idle', 'blink', 'listening', 'thinking',
                           'speaking-open', 'speaking-closed', 'error',
                           'sleep', 'happy', 'worried'}
    for name, im in frames.items():
        assert im.size == (200, 200), name
        p = os.path.getsize(f'assets/vox/vox-{name}.png')
        assert p < 60 * 1024, (name, p)

    # invariante estructural: anclas de la base idénticas en todos los frames
    def near(a, b, tol=24):
        return all(abs(x - y) <= tol for x, y in zip(a[:3], b[:3]))

    anchors = {(18, 111): (51, 64, 79),      # oreja sólida
               (100, 60): (147, 167, 189),   # relleno cabeza
               (100, 74): (14, 20, 32),       # pantalla
               (100, 35): (91, 107, 125)}     # mástil antena
    for name, im in frames.items():
        p = im.load()
        for (x, y), color in anchors.items():
            assert near(p[x, y], color), (name, x, y, p[x, y])
            assert im.split()[3].getpixel((x, y)) > 200, (name, 'alfa', x, y)

    def cyan(im):
        p = im.load()
        return sum(1 for y in range(200) for x in range(200)
                   if abs(p[x, y][0] - 79) < 30 and abs(p[x, y][1] - 195) < 30
                   and abs(p[x, y][2] - 247) < 30)

    def red(im):
        p = im.load()
        return sum(1 for y in range(200) for x in range(200)
                   if p[x, y][0] > 200 and p[x, y][1] < 120 and p[x, y][2] < 120)

    assert cyan(frames['blink']) < cyan(frames['idle']) * 0.5, 'blink cierra ojos'
    assert red(frames['error']) > red(frames['idle']) + 200, 'error en rojo'

    def mouth_cyan(im):
        p = im.load()
        return sum(1 for y in range(118, 137) for x in range(85, 116)
                   if abs(p[x, y][0] - 79) < 40 and abs(p[x, y][1] - 195) < 40)

    assert mouth_cyan(frames['speaking-open']) > mouth_cyan(frames['speaking-closed']) * 2, 'boca habla'
    assert mouth_cyan(frames['happy']) > mouth_cyan(frames['speaking-open']), 'happy sonríe más'

    def zone_cyan(name, box):
        p = frames[name].load()
        (x0, y0, x1, y1) = box
        return sum(1 for y in range(y0, y1) for x in range(x0, x1)
                   if abs(p[x, y][0] - 79) < 40 and abs(p[x, y][1] - 195) < 40)

    assert zone_cyan('sleep', (155, 30, 195, 72)) > 60, 'sleep tiene Z'
    assert zone_cyan('sleep', (60, 92, 140, 113)) < zone_cyan('idle', (60, 92, 140, 113)), 'sleep ojos cerrados'

    a = frames['idle'].split()[3]
    left = sum(1 for y in range(200) for x in range(100) if a.getpixel((x, y)) > 64)
    right = sum(1 for y in range(200) for x in range(100, 200) if a.getpixel((x, y)) > 64)
    assert abs(left - right) / max(left, right) < 0.15, f'simetría {left}/{right}'


if __name__ == '__main__':
    main()
