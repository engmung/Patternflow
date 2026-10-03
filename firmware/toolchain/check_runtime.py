"""Exercise module admission, loader lifecycle, resident modules and conditional
loop requests.

python firmware/toolchain/check_runtime.py [--sanitize]
Production code is compiled against deterministic hardware fixtures. Two
programs: runtime_test.cpp (admission, the frame-boundary hand-off, the
registry's load/park/resume lifecycle against a fake loader) and
resident_test.cpp (the resident table, and the loader's own park, resume,
unload and eviction code lifted out of core_module_loader.h).
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
        for name in ('core_module_memory.h', 'core_module_resident.h', 'core_loop_sync.h',
                     'core_net_maintenance.h'):
            (work / name).write_bytes((ROOT / 'firmware/patternflow/src' / name).read_bytes())
        for name in ('Arduino.h', 'esp_heap_caps.h', 'core_runtime.h'):
            (work / name).write_text('// Hardware supplied by runtime_test.cpp\n')
        registry = (ROOT / 'firmware/patternflow/pattern_registry.h').read_text(encoding='utf-8')
        start = registry.index('inline uint32_t activatedAtMs = 0;')
        end = registry.index('// \u2500\u2500 Naming a pattern', start)
        (work / 'registry_lifecycle.h').write_text(registry[start:end], encoding='utf-8')
        start = registry.index('inline bool jsonStringValue(')
        end = registry.index('// Deliberately a substring scan', start)
        (work / 'sidecar_name.h').write_text(registry[start:end], encoding='utf-8')
        # The sidecar cache's forget calls: every module-file writer reports
        # its write through one, so they move the loader's storage generation.
        start = registry.index('inline int sidecarFind(')
        end = registry.index('inline void sidecarRemember(', start)
        (work / 'sidecar_forget.h').write_text(registry[start:end], encoding='utf-8')
        manager = (ROOT / 'firmware/patternflow/src/core_patterns_http.h').read_text(encoding='utf-8')
        start = manager.index('inline char restorePath[')
        end = manager.index('// The rescan-and-reload', start)
        (work / 'patterns_lifecycle.h').write_text(manager[start:end], encoding='utf-8')
        # The loader's residency, in the pieces that need no ELF, no flash and
        # no cache: its state, api->alloc(), unload(), the load timings, and
        # the "Staying loaded" block. Each runs from one anchor to the next.
        loader = (ROOT / 'firmware/patternflow/src/core_module_loader.h').read_text(encoding='utf-8')
        for name, begin, finish in (
            ('loader_state.h', 'constexpr int MAX_SECTIONS = 8;', 'inline bool fail(const char* message) {'),
            ('loader_alloc.h', 'inline void* moduleAlloc(size_t bytes) {', 'inline void hostLog('),
            ('loader_unload.h', "// The current module's globals back to", 'inline bool copyExecutable('),
            ('loader_timings.h', '// Phase timings from the last successful load()', '// Cheap structural check'),
            ('loader_resident.h', '// \u2500\u2500 Staying loaded', '// The two calls a frame makes into the module'),
        ):
            start = loader.index(begin)
            end = loader.index(finish, start)
            (work / name).write_text(loader[start:end], encoding='utf-8')
        for test in ('runtime_test', 'resident_test'):
            source = ROOT / f'firmware/toolchain/tests/{test}.cpp'
            exe = work / (f'{test}.exe' if Path(compiler).suffix.lower() == '.exe' else test)
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
