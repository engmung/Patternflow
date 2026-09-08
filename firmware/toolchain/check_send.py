"""Exercise the bounded HTTP sender under backpressure and disconnects.

python firmware/toolchain/check_send.py [--sanitize]
Production code is compiled against deterministic hardware fixtures.
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
    with tempfile.TemporaryDirectory(prefix='patternflow-send-') as directory:
        work = Path(directory)
        (work / 'core_send.h').write_bytes((ROOT / 'firmware/patternflow/src/core_send.h').read_bytes())
        for name in ('Arduino.h', 'pgmspace.h', 'lwip/sockets.h', 'webserver/WebServer.h',
                     'core_loop_sync.h', 'core_net_maintenance.h'):
            (work / name).parent.mkdir(parents=True, exist_ok=True)
            (work / name).write_text('// Hardware supplied by send_test.cpp\n')
        source = ROOT / 'firmware/toolchain/tests/send_test.cpp'
        exe = work / ('send_test.exe' if Path(compiler).suffix.lower() == '.exe' else 'send_test')
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
