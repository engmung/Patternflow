"""Exercise module admission, loader lifecycle and conditional loop requests.

python firmware/toolchain/check_runtime.py [--sanitize]
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
    with tempfile.TemporaryDirectory(prefix='patternflow-runtime-') as directory:
        work = Path(directory)
        for name in ('core_module_memory.h', 'core_loop_sync.h', 'core_net_maintenance.h'):
            (work / name).write_bytes((ROOT / 'firmware/patternflow/src' / name).read_bytes())
        for name in ('Arduino.h', 'esp_heap_caps.h', 'core_runtime.h'):
            (work / name).write_text('// Hardware supplied by runtime_test.cpp\n')
        registry = (ROOT / 'firmware/patternflow/pattern_registry.h').read_text(encoding='utf-8')
        start = registry.index('inline uint32_t activatedAtMs = 0;')
        end = registry.index('// \u2500\u2500 Naming a pattern', start)
        (work / 'registry_lifecycle.h').write_text(registry[start:end], encoding='utf-8')
        manager = (ROOT / 'firmware/patternflow/src/core_patterns_http.h').read_text(encoding='utf-8')
        start = manager.index('inline char restorePath[')
        end = manager.index('// The rescan-and-reload', start)
        (work / 'patterns_lifecycle.h').write_text(manager[start:end], encoding='utf-8')
        source = ROOT / 'firmware/toolchain/tests/runtime_test.cpp'
        exe = work / ('runtime_test.exe' if Path(compiler).suffix.lower() == '.exe' else 'runtime_test')
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
