# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec: empaqueta semroute.py (cerebro semántico) en un solo exe.
# Solo onnxruntime + numpy + tokenizers. El modelo (.onnx) se descarga aparte.

import os
from PyInstaller.utils.hooks import collect_dynamic_libs

SRC = os.path.abspath(os.path.join(os.getcwd(), 'src', 'main'))

a = Analysis(
    [os.path.join(SRC, 'semroute.py')],
    pathex=[SRC],
    binaries=collect_dynamic_libs('onnxruntime') + collect_dynamic_libs('numpy'),
    datas=[],
    hiddenimports=['onnxruntime', 'numpy', 'tokenizers'],
    hookspath=[],
    runtime_hooks=[],
    excludes=['speech_recognition', 'webrtcvad', 'tensorflow', 'torch', 'vosk', 'pyaudio'],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='semroute',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
