# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec: empaqueta wake.py + vosk + pyaudio + modelo en un solo exe.
# El modelo se incluye como dato y wake.py lo localiza via sys._MEIPASS.

import os
from PyInstaller.utils.hooks import collect_dynamic_libs, collect_data_files

SRC = os.path.abspath(os.path.join(os.getcwd(), 'src', 'main'))

a = Analysis(
    [os.path.join(SRC, 'wake.py')],
    pathex=[SRC],
    binaries=collect_dynamic_libs('vosk') + collect_dynamic_libs('pyaudio'),
    datas=[(os.path.join(SRC, 'vosk-model'), 'vosk-model')],
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=['speech_recognition', 'webrtcvad', 'tensorflow', 'torch'],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='wake',
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
