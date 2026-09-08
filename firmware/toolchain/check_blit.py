"""Run the actual HUB75 blit on host DMA fixtures, checking colour and control bits.

python firmware/toolchain/check_blit.py [--sanitize]
No board required. The ESP32 benchmark still decides whether it is faster.
"""
import argparse
from pathlib import Path
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
    start = cpp.index('static uint32_t pfSpreadLo[256];')
    end = cpp.index('} // blitRGB888', start) + len('} // blitRGB888')
    table_start = header.index('static const uint16_t lumConvTab[]')
    table_end = header.index('};', table_start) + 2
    with tempfile.TemporaryDirectory(prefix='patternflow-blit-') as directory:
        work = Path(directory)
        (work / 'blit_under_test.h').write_text(header[table_start:table_end] + '\n' + cpp[start:end], encoding='utf-8')
        source = ROOT / 'firmware/toolchain/tests/blit_test.cpp'
        for swap in (0, 1):
            exe = work / ('blit_test.exe' if Path(compiler).suffix.lower() == '.exe' else 'blit_test')
            if Path(compiler).stem.lower() == 'cl':
                if args.sanitize:
                    raise SystemExit('--sanitize requires GCC or Clang')
                command = [compiler, '/nologo', '/std:c++17', '/EHsc', '/O2', '/W4', '/WX', '/utf-8',
                           f'/DPF_TEST_SWAP={swap}', f'/I{work}', str(source), f'/Fe:{exe}']
            else:
                command = [compiler, '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror',
                           f'-DPF_TEST_SWAP={swap}', f'-I{work}', str(source), '-o', str(exe)]
                if args.sanitize:
                    command += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
            subprocess.run(command, cwd=work, env=env, check=True)
            subprocess.run([str(exe)], cwd=work, env=env, check=True)


if __name__ == '__main__':
    main()
