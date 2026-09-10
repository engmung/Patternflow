"""Check the panel's per-plane light budget: binary weights, monotone response.

python firmware/toolchain/check_oe.py [--sanitize]
No board required.

setBrightnessOE writes OE bits into a live DMA buffer, which is why nothing ever
tested it. The defect was not in writing the buffer: it was in one expression
deciding how wide each plane's window should be. That expression is now
pfOEWindowPixels() in the driver, pure and dependency-free, and this lifts it out
verbatim - not a copy - so what runs on the panel is what is asserted here.
"""
import argparse
from pathlib import Path
import re
import subprocess
import tempfile

from check_module_elf import ROOT, compiler_environment


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sanitize', action='store_true')
    args = parser.parse_args()
    compiler, env = compiler_environment()

    driver = ROOT / 'firmware/patternflow/src/hub75'
    cpp = (driver / 'ESP32-HUB75-MatrixPanel-I2S-DMA.cpp').read_text(encoding='utf-8')
    header = (driver / 'ESP32-HUB75-MatrixPanel-I2S-DMA.h').read_text(encoding='utf-8')

    # The function under test, taken from the tracked driver rather than restated.
    start = cpp.index('int pfOEWindowPixels(')
    end = cpp.index('\n}', start) + len('\n}')
    fn = cpp[start:end]

    table = re.search(r'static const uint16_t lumConvTab\[\]\s*=\s*\{.*?\};', header, re.S)
    if not table:
        raise SystemExit('lumConvTab not found in the driver header')

    with tempfile.TemporaryDirectory(prefix='patternflow-oe-') as directory:
        work = Path(directory)
        (work / 'oe_under_test.h').write_text(
            '#include <cstdint>\n' + table.group(0) + '\n' + fn + '\n', encoding='utf-8')
        source = ROOT / 'firmware/toolchain/tests/oe_test.cpp'
        exe = work / ('oe_test.exe' if Path(compiler).suffix.lower() == '.exe' else 'oe_test')
        if Path(compiler).stem.lower() == 'cl':
            if args.sanitize:
                raise SystemExit('--sanitize requires GCC or Clang')
            command = [compiler, '/nologo', '/std:c++17', '/EHsc', '/O2', '/W4', '/WX', '/utf-8',
                       f'/I{work}', str(source), f'/Fe:{exe}']
        else:
            command = [compiler, '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror',
                       f'-I{work}', str(source), '-o', str(exe)]
            if args.sanitize:
                command += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
        subprocess.run(command, cwd=work, env=env, check=True)
        subprocess.run([str(exe)], cwd=work, env=env, check=True)


if __name__ == '__main__':
    main()
