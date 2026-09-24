"""Exercise the bounded HTTP sender under backpressure and disconnects, and
the cache policies it applies to console pages.

python firmware/toolchain/check_send.py [--sanitize]
Production code is compiled against deterministic hardware fixtures.

Also fails when anything but src/core_http.h calls collectHeaders(): the
server keeps one list and each call replaces it, so a second caller silently
takes If-None-Match (and with it every 304) away from the pages.
"""
import argparse
from pathlib import Path
import re
import subprocess
import tempfile

from check_module_elf import ROOT, compiler_environment

SKETCH = ROOT / 'firmware/patternflow'
HEADER_LIST_OWNER = SKETCH / 'src/core_http.h'
# Build output and fetched libraries (all gitignored), and the vendored server,
# which defines collectHeaders() and calls it from close().
NOT_SCANNED = [SKETCH / 'build', SKETCH / 'lib', SKETCH / 'pio_src', SKETCH / 'src/webserver']
COMMENT = re.compile(r'//[^\n]*|/\*.*?\*/', re.DOTALL)
CALL = re.compile(r'\bcollectHeaders\s*\(')


def collect_headers_calls():
    """(file, count) for every source under the sketch that calls collectHeaders()."""
    found = []
    for path in sorted(SKETCH.rglob('*')):
        if path.suffix not in ('.h', '.hpp', '.c', '.cpp', '.ino') or not path.is_file():
            continue
        if any(path.is_relative_to(skip) for skip in NOT_SCANNED):
            continue
        text = COMMENT.sub('', path.read_text(encoding='utf-8', errors='replace'))
        count = len(CALL.findall(text))
        if count:
            found.append((path, count))
    return found


def check_header_list():
    calls = collect_headers_calls()
    strays = [f'{path.relative_to(ROOT).as_posix()} ({count})'
              for path, count in calls if path != HEADER_LIST_OWNER or count != 1]
    if strays or not calls:
        raise SystemExit('collectHeaders() must be called exactly once, in '
                         f'{HEADER_LIST_OWNER.relative_to(ROOT).as_posix()}; found: '
                         + (', '.join(strays) or 'none'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sanitize', action='store_true')
    args = parser.parse_args()
    check_header_list()
    compiler, env = compiler_environment()
    with tempfile.TemporaryDirectory(prefix='patternflow-send-') as directory:
        work = Path(directory)
        # Laid out like the sketch, so core_build.h's "../net_config.h" resolves.
        src = work / 'src'
        src.mkdir()
        for name in ('core_send.h', 'core_build.h'):
            (src / name).write_bytes((SKETCH / 'src' / name).read_bytes())
        for name in ('Arduino.h', 'pgmspace.h', 'lwip/sockets.h', 'webserver/WebServer.h',
                     'core_loop_sync.h', 'core_net_maintenance.h', 'esp_ota_ops.h'):
            (src / name).parent.mkdir(parents=True, exist_ok=True)
            (src / name).write_text('// Hardware supplied by send_test.cpp\n')
        (work / 'net_config.h').write_text('// PF_IMPROV_FW_VERSION supplied by send_test.cpp\n')
        source = ROOT / 'firmware/toolchain/tests/send_test.cpp'
        exe = work / ('send_test.exe' if Path(compiler).suffix.lower() == '.exe' else 'send_test')
        if Path(compiler).stem.lower() == 'cl':
            if args.sanitize:
                raise SystemExit('--sanitize requires GCC or Clang')
            command = [compiler, '/nologo', '/std:c++20', '/EHsc', '/O2', '/W4', '/WX', '/utf-8',
                       f'/I{src}', str(source), f'/Fe:{exe}']
        else:
            command = [compiler, '-std=c++20', '-O2', '-Wall', '-Wextra', '-Werror',
                       f'-I{src}', str(source), '-o', str(exe)]
            if args.sanitize:
                command += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
        subprocess.run(command, cwd=work, env=env, check=True)
        subprocess.run([str(exe)], cwd=work, env=env, check=True)


if __name__ == '__main__':
    main()
