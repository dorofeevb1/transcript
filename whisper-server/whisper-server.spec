# PyInstaller spec for the local whisper-server binary.
#
# Output: dist/whisper-server (Linux/macOS) or dist/whisper-server.exe (Windows).
# The binary embeds the Python runtime, faster-whisper (CTranslate2), uvicorn,
# fastapi, argostranslate, and youtube-transcript-api. The Whisper model itself
# is NOT bundled — faster-whisper downloads it from HuggingFace on first run
# (~250MB for "small"; controlled by the WHISPER_MODEL env var).
#
# Build locally:   pyinstaller whisper-server.spec --clean
# CI build:        .github/workflows/release-whisper.yml runs this on
#                  ubuntu-latest, windows-latest, macos-latest.

# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# faster-whisper / CTranslate2 ship a few .so/.dll/.dylib helpers and tokenizer
# JSON files that PyInstaller's static analyzer misses.
hidden = (
    collect_submodules('faster_whisper')
    + collect_submodules('ctranslate2')
    + collect_submodules('argostranslate')
)
datas = (
    collect_data_files('faster_whisper')
    + collect_data_files('ctranslate2')
    + collect_data_files('tokenizers')
)

block_cipher = None

a = Analysis(
    ['main.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=hidden + [
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['matplotlib', 'tkinter', 'PyQt5', 'PySide2', 'PIL'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='whisper-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
