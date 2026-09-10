"""Compile/run the loader's portable ELF checks and the shipped Basics corpus.

    python firmware/toolchain/check_module_elf.py [--sanitize]

Needs a C++17 host compiler (GCC/Clang, or MSVC Build Tools on Windows).
No board or PlatformIO required. --sanitize enables ASan/UBSan on GCC/Clang.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def compiler_environment() -> tuple[str, dict[str, str]]:
    env = dict(os.environ)
    for name in (os.environ.get("CXX"), "c++", "g++", "clang++", "cl"):
        if name and (compiler := shutil.which(name)):
            return compiler, env
    if os.name == "nt":
        vswhere = Path(os.environ.get("ProgramFiles(x86)", "C:/Program Files (x86)")) / (
            "Microsoft Visual Studio/Installer/vswhere.exe"
        )
        if vswhere.is_file():
            install = subprocess.check_output([
                str(vswhere), "-latest", "-products", "*", "-requires",
                "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath",
            ], text=True).strip()
            if install:
                setup = Path(install) / "VC/Auxiliary/Build/vcvars64.bat"
                # cmd does not understand subprocess's CRT-style escaping
                # of embedded quotes in a list argument. Pass its command
                # line directly; this path comes from the local VS installer.
                output = subprocess.check_output(
                    f'cmd /d /u /s /c "call "{setup}" >nul && set"',
                    encoding="utf-16-le", timeout=60,
                )
                updates = dict(line.split("=", 1) for line in output.splitlines() if "=" in line)
                # Some shells inherit both Path and PATH. vcvars writes PATH;
                # do not let the stale mixed-case value hide the compiler.
                env = {key.upper(): value for key, value in env.items()}
                env.update({key.upper(): updates.get(key.upper(), value)
                            for key, value in updates.items()})
                compiler = shutil.which("cl", path=env.get("PATH"))
                if compiler:
                    return compiler, env
    raise SystemExit("No C++17 compiler found; set CXX or install GCC/Clang/MSVC Build Tools.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sanitize", action="store_true")
    args = parser.parse_args()
    compiler, env = compiler_environment()
    with tempfile.TemporaryDirectory(prefix="patternflow-elf-") as directory:
        work = Path(directory)
        executable = work / ("module_elf_test.exe" if os.name == "nt" else "module_elf_test")
        source = ROOT / "firmware/toolchain/tests/module_elf_test.cpp"
        include = ROOT / "firmware/patternflow/src"
        if Path(compiler).stem.lower() == "cl":
            if args.sanitize:
                raise SystemExit("--sanitize requires GCC or Clang (ASan + UBSan).")
            command = [compiler, "/nologo", "/std:c++17", "/EHsc", "/W4", "/WX",
                       f"/I{include}", str(source), f"/Fe:{executable}"]
        else:
            command = [compiler, "-std=c++17", "-Wall", "-Wextra", "-Werror",
                       f"-I{include}", str(source), "-o", str(executable)]
            if args.sanitize:
                command += ["-fsanitize=address,undefined", "-fno-omit-frame-pointer"]
        subprocess.run(command, cwd=work, env=env, check=True)
        fixtures = []
        with zipfile.ZipFile(ROOT / "web/public/packs/basics.zip") as pack:
            for index, member in enumerate(pack.namelist()):
                if member.endswith(".pfm"):
                    # Archive paths never reach the filesystem: Path().name drops any
                    # directory component an archive might carry, and the substitution
                    # leaves nothing that could be one. The index keeps it unique even
                    # if two entries sanitise to the same string. The name is kept
                    # rather than generated because the test now reports which module
                    # is the largest, and "module_52.pfm" does not answer that.
                    safe = re.sub(r"[^A-Za-z0-9._-]", "_", Path(member).name)
                    fixture = work / f"{index:02d}-{safe}"
                    fixture.write_bytes(pack.read(member))
                    fixtures.append(str(fixture))
        if not fixtures:
            raise SystemExit("Basics pack has no .pfm fixtures")
        subprocess.run([str(executable), *fixtures], cwd=work, env=env, check=True)


if __name__ == "__main__":
    main()
