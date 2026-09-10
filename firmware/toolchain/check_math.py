"""Pin the accuracy of the three headers every loadable pattern compiles into itself.

python firmware/toolchain/check_math.py [--sanitize]
No board required, and deliberately no claim about cycles - this suite pins error,
which is exact. Cycles stay a job for /api/status on a panel.

core_math.h, core_color.h and core_noise.h are reached by a .pfm through
abi/pf_module.h, which #includes them rather than calling into the host. They are
therefore the published pattern SDK, and until this check nothing in the repository
ran a single number through any of them.
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
    headers = ROOT / 'firmware/patternflow/src'
    source = ROOT / 'firmware/toolchain/tests/math_test.cpp'
    with tempfile.TemporaryDirectory(prefix='patternflow-math-') as directory:
        work = Path(directory)
        exe = work / ('math_test.exe' if Path(compiler).suffix.lower() == '.exe' else 'math_test')
        if Path(compiler).stem.lower() == 'cl':
            if args.sanitize:
                raise SystemExit('--sanitize requires GCC or Clang')
            command = [compiler, '/nologo', '/std:c++17', '/EHsc', '/O2', '/W4', '/WX', '/utf-8',
                       f'/I{headers}', str(source), f'/Fe:{exe}']
        else:
            command = [compiler, '-std=c++17', '-O2', '-Wall', '-Wextra', '-Werror',
                       f'-I{headers}', str(source), '-o', str(exe)]
            if args.sanitize:
                command += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
        subprocess.run(command, cwd=work, env=env, check=True)
        subprocess.run([str(exe)], cwd=work, env=env, check=True)


if __name__ == '__main__':
    main()
