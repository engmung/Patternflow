# Pre-build: sync Arduino sketch into PlatformIO src_dir; vendor libs under
# short paths (Windows breaks on "Adafruit GFX Library" style folder names).
Import("env")
import subprocess
from pathlib import Path

root = Path(env["PROJECT_DIR"])
lib = root / "lib"
lib.mkdir(exist_ok=True)

pio_src = root / "pio_src"
pio_src.mkdir(exist_ok=True)
ino = root / "patternflow.ino"
main_cpp = pio_src / "main.cpp"
if not ino.is_file():
    raise SystemExit(f"Missing sketch: {ino}")
main_cpp.write_text(ino.read_text(encoding="utf-8"), encoding="utf-8")
print(f"[patternflow] synced {ino.name} -> pio_src/main.cpp")


def ensure_git(dest: Path, url: str) -> None:
    marker = dest / ".git"
    if dest.is_dir() and (marker.is_dir() or (dest / "src").is_dir() or (dest / "library.properties").is_file()):
        return
    if dest.exists():
        raise SystemExit(f"[patternflow] {dest} exists but looks incomplete; remove it and rebuild")
    print(f"[patternflow] cloning {url} -> {dest}")
    subprocess.check_call(["git", "clone", "--depth", "1", url, str(dest)])


ensure_git(lib / "HUB75", "https://github.com/mrfaptastic/ESP32-HUB75-MatrixPanel-DMA.git")
ensure_git(lib / "Adafruit_GFX", "https://github.com/adafruit/Adafruit-GFX-Library.git")
ensure_git(lib / "Adafruit_BusIO", "https://github.com/adafruit/Adafruit_BusIO.git")
ensure_git(lib / "WebSockets", "https://github.com/Links2004/arduinoWebSockets.git")

# PlatformIO does not always inject WiFi include paths into this lib's compile
# units; declare the deps and skip Socket.IO client (unused by Patternflow).
# PlatformIO: compile only the WebSockets pieces Patternflow uses, and avoid
# UTF-8 BOM (Windows PowerShell Set-Content) which breaks library.json parsing.
ws_json = lib / "WebSockets" / "library.json"
ws_json.write_text(
    '{\n'
    '  "name": "WebSockets",\n'
    '  "version": "2.7.3",\n'
    '  "frameworks": "arduino",\n'
    '  "platforms": ["espressif32", "espressif8266"],\n'
    '  "build": {\n'
    '    "srcFilter": [\n'
    '      "+<WebSockets.cpp>",\n'
    '      "+<WebSocketsServer.cpp>",\n'
    '      "+<WebSocketsClient.cpp>",\n'
    '      "+<libsha1/libsha1.c>"\n'
    '    ]\n'
    '  }\n'
    '}\n',
    encoding="utf-8",
    newline="\n",
)
props = lib / "WebSockets" / "library.properties"
if props.is_file():
    text = props.read_text(encoding="utf-8")
    lines = [ln for ln in text.splitlines() if not ln.startswith("depends=")]
    props.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")

# Inject WiFi include paths for WebSockets compile units (PlatformIO LDF gap).
from pathlib import Path as _P
import os as _os
pio_home = _P(_os.environ.get("PLATFORMIO_CORE_DIR", _P.home() / ".platformio"))
wifi_inc = pio_home / "packages" / "framework-arduinoespressif32" / "libraries" / "WiFi" / "src"
wifics_inc = pio_home / "packages" / "framework-arduinoespressif32" / "libraries" / "WiFiClientSecure" / "src"
for inc in (wifi_inc, wifics_inc):
    if inc.is_dir():
        env.Append(CPPPATH=[str(inc)])
