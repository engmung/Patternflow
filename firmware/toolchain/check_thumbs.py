"""Exercise the actual thumbnail mailbox with deterministic I/O interleavings.

python firmware/toolchain/check_thumbs.py [--sanitize]
Only hardware includes are replaced; production cache and mailbox code is used.
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
    with tempfile.TemporaryDirectory(prefix='patternflow-thumbs-') as directory:
        work = Path(directory)
        header = ROOT / 'firmware/patternflow/src/core_thumbs.h'
        (work / header.name).write_bytes(header.read_bytes())
        for name in ('Arduino.h', 'FFat.h', 'esp_heap_caps.h', 'core_canvas.h', 'core_mem.h'):
            (work / name).write_text('// Hardware supplied by thumbs_test.cpp\n')
        source = ROOT / 'firmware/toolchain/tests/thumbs_test.cpp'
        exe = work / ('thumbs_test.exe' if Path(compiler).suffix.lower() == '.exe' else 'thumbs_test')
        if Path(compiler).stem.lower() == 'cl':
            if args.sanitize:
                raise SystemExit('--sanitize requires GCC or Clang')
            command = [compiler, '/nologo', '/std:c++20', '/EHsc', '/O2', '/W4', '/WX', '/utf-8',
                       f'/I{work}', str(source), f'/Fe:{exe}']
        else:
            command = [compiler, '-std=c++20', '-O2', '-Wall', '-Wextra', '-Werror',
                       f'-I{work}', str(source), '-o', str(exe)]
            if args.sanitize:
                command += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
        subprocess.run(command, cwd=work, env=env, check=True)
        subprocess.run([str(exe)], cwd=work, env=env, check=True)


if __name__ == '__main__':
    main()
