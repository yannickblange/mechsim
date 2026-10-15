# -*- mode: python ; coding: utf-8 -*-
# PyInstaller recipe of the packaged app; run by tools/package.py (do not call it with a relative path from another folder).
# Windows: a folder with MechSim.exe (with a console window: it shows what the program does and closing it ends the program).
# macOS: MechSim.app (no console; the log is Documents/MechSim/mechsim.log).
import os
import sys

from PyInstaller.utils.hooks import collect_submodules

root = os.path.abspath(os.path.join(SPECPATH, ".."))
lib_dir = os.path.join(root, "python", "mechsim", "lib")
libs = [(os.path.join(lib_dir, f), "mechsim/lib") for f in os.listdir(lib_dir) if f.startswith(("libmechsim", "mechsim."))]
if not libs:
    raise SystemExit("python/mechsim/lib has no native library: build it first (tools/package.py does)")

datas = [
    (os.path.join(root, "frontend"), "frontend"),
    (os.path.join(root, "scenes"), "scenes"),
    (os.path.join(root, "contracts"), "contracts"),
]

# uvicorn and the WebSocket library load their parts by name; the analysis does not see that
hiddenimports = collect_submodules("uvicorn") + collect_submodules("websockets") + [
    "mechsim.server.app", "mechsim.server.mock", "mechsim.sim", "mechsim._native",
]

a = Analysis(
    [os.path.join(root, "tools", "app_entry.py")],
    pathex=[os.path.join(root, "python")],
    binaries=libs,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter", "pytest", "matplotlib", "scipy", "IPython", "PIL", "uvloop", "httptools", "watchfiles"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="MechSim",
    debug=False,
    strip=False,
    upx=False,
    console=sys.platform != "darwin",
    disable_windowed_traceback=False,
)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name="MechSim")

if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name="MechSim.app",
        bundle_identifier="de.mechsim.app",
        info_plist={
            "CFBundleName": "MechSim",
            "CFBundleDisplayName": "MechSim",
            "CFBundleShortVersionString": os.environ.get("MECHSIM_VERSION", "0.8"),
            "NSHighResolutionCapable": True,
            "LSMinimumSystemVersion": "11.0",
            # a background app: no Dock icon that cannot be quit (the program has no event loop of its own for the Quit command);
            # the page has a "Beenden" button, and the program ends by itself when the last browser tab is closed
            "LSUIElement": True,
        },
    )
