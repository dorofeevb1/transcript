.PHONY: install-extension build-extension dev-extension dev-server server test test-e2e test-server install-server restart-server build-server-binary

install-extension:
	cd extension && npm install

build-extension:
	cd extension && npm run build

build-firefox:
	cd extension && npm run build:firefox

build-firefox-zip:
	cd extension && npm run build:firefox
	cd extension/dist-firefox && rm -f ../transcript-firefox.zip && zip -rq ../transcript-firefox.zip .
	cd extension && node scripts/validate-firefox-zip.mjs transcript-firefox.zip
	@echo "OK: extension/transcript-firefox.zip (из dist-firefox/)"

dev-extension:
	cd extension && npm run dev

install-server:
	cd whisper-server && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

install-translate:
	cd whisper-server && .venv/bin/pip install argostranslate && .venv/bin/python install_translate_models.py

dev-server:
	cd whisper-server && .venv/bin/python main.py

server: dev-server

restart-server:
	-fuser -k 8765/tcp 2>/dev/null
	sleep 1
	cd whisper-server && WHISPER_MODEL=base WHISPER_DEVICE=cpu .venv/bin/python main.py

test:
	cd extension && npm run test
	cd whisper-server && .venv/bin/python -m pytest tests/ -v --ignore=tests/test_live_server.py

test-e2e:
	cd extension && npm run test:e2e
	cd whisper-server && .venv/bin/python -m pytest tests/test_api.py::test_youtube_captions_me_at_the_zoo -v

test-server:
	curl -sf http://127.0.0.1:8765/health | grep -q '"ok":true'

# Build a single-file binary of whisper-server for the current OS via PyInstaller.
# Output: whisper-server/dist/whisper-server (or .exe on Windows).
# The Whisper model itself is downloaded on first run; the binary just bundles
# Python + faster-whisper + uvicorn so users don't need a Python install.
build-server-binary:
	cd whisper-server && .venv/bin/pip install pyinstaller && .venv/bin/pyinstaller whisper-server.spec --clean --noconfirm
	@echo "OK: whisper-server/dist/whisper-server[.exe]"
