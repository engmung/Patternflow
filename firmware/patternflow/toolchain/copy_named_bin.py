# After a successful link, copy firmware.bin to <PIOENV>.bin so the
# cascade build is distinguishable on disk (firmware64x2.bin).
Import("env")
from pathlib import Path
import shutil


def copy_named(source, target, env):
    built = Path(str(target[0]))
    dest = built.with_name(f"{env['PIOENV']}.bin")
    if dest.resolve() == built.resolve():
        return
    shutil.copy2(built, dest)
    print(f"[patternflow] {built.name} -> {dest.name}")


env.AddPostAction("$BUILD_DIR/${PROGNAME}.bin", copy_named)
