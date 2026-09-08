"""Exercise the production MIDI handoff and remote-input echo suppression."""
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
    with tempfile.TemporaryDirectory(prefix='patternflow-midi-') as directory:
        work = Path(directory)
        for name in ('features/midi/core_midi.h', 'features/midi/midi_queue.h', 'src/core_bus.h'):
            dest = work / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes((ROOT / 'firmware/patternflow' / name).read_bytes())
        for name in ('Arduino.h', 'Preferences.h', 'src/core_encoders.h'):
            (work / name).write_text('// Hardware supplied by midi_test.cpp\n')
        source = ROOT / 'firmware/toolchain/tests/midi_test.cpp'
        exe = work / ('midi_test.exe' if Path(compiler).suffix.lower() == '.exe' else 'midi_test')
        if Path(compiler).stem.lower() == 'cl':
            if args.sanitize:
                raise SystemExit('--sanitize requires GCC or Clang')
            command = [compiler, '/nologo', '/std:c++20', '/EHsc', '/O2', '/W4', '/WX', '/utf-8',
                       f'/I{work}', str(source), f'/Fe:{exe}']
        else:
            command = [compiler, '-std=c++20', '-O2', '-pthread', '-Wall', '-Wextra', '-Werror',
                       f'-I{work}', str(source), '-o', str(exe)]
            if args.sanitize:
                command += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
        subprocess.run(command, cwd=work, env=env, check=True)
        subprocess.run([str(exe)], cwd=work, env=env, check=True)


if __name__ == '__main__':
    main()
