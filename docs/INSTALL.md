# Installing MechSim from zero

Two routes. **Pick route 1 unless you want to change the program.**

| | Route 1: the ready-made program | Route 2: from the source code (with git) |
|---|---|---|
| For | everyone who just wants to use MechSim | people who want to change MechSim, or build their own zip |
| Needs | a zip file, nothing else | git, Python, CMake, a C++ compiler, a GitHub login |
| Time | 2 minutes | 20 to 40 minutes the first time |

What you need in both cases: **Windows 10 or 11 (64 bit)** or **macOS 11 or newer**, and a modern browser (Chrome, Edge, Firefox or Safari).
MechSim runs on your own computer only; the browser just shows it (address `http://127.0.0.1:8000`). Nothing is sent to the internet.

---

## Route 1: the ready-made program (no git, no Python)

### 1. Get the zip

**Download page: <https://github.com/yannickblange/mechsim/releases/latest>** (no account needed; scroll to "Assets"). Take the zip that fits your computer:

| Your computer | File | On the download page |
|---|---|---|
| Mac with an Apple chip (M1, M2, M3, M4 ...) | `MechSim-1.0-macos-arm64.zip` | yes |
| Windows | `MechSim-1.0-windows-x86_64.zip` | not yet - see below |
| Mac with an Intel processor | `MechSim-1.0-macos-x86_64.zip` | not yet - see below |

*Which Mac do I have?* Apple menu  → **About This Mac**. "Chip: Apple M..." means Apple chip, "Processor: Intel ..." means Intel.

The Windows and Intel-Mac zips are not on the download page yet. Until they are: ask the owner for the file, or take it from GitHub: <https://github.com/yannickblange/mechsim/actions> → the newest green run of "Programm packen" → **Artifacts** at the bottom, one per system (you must be logged in to GitHub to download them; they are kept for 90 days).

### 2. Windows

1. Right-click the zip → **Extract All...** → **Extract**. (Do not start it from inside the zip window: it must be extracted first.)
2. Open the new folder, then the folder `MechSim`, and double-click **`MechSim.exe`**.
3. The first time, Windows shows a blue window **"Windows protected your PC"** because the program is not signed with a paid certificate. Click **More info** → **Run anyway**.
4. A black window opens and stays open (it shows that the program runs). After a few seconds your browser opens with MechSim. Done.

If your antivirus program quarantines `MechSim.exe`: this happens with many programs of this kind. Restore it and allow it (it is safe; the source code is in the repository).

### 2. macOS

1. Double-click the zip (Safari does this by itself). You get `MechSim.app`. Drag it to **Applications** or anywhere you like.
2. Double-click `MechSim.app`. The first time macOS refuses ("Apple could not verify ...") because the program is not signed with a paid Apple certificate. Open it anyway:
   - **macOS 15 (Sequoia) and newer:** click **Done**, open **System Settings** → **Privacy & Security**, scroll down to "MechSim was blocked", click **Open Anyway**, enter your password, click **Open Anyway** once more.
   - **macOS 14 and older:** right-click (or Control-click) `MechSim.app` → **Open** → **Open**.
   - If both fail, open the **Terminal** and run (drag the app into the Terminal window to type its path):
     ```bash
     xattr -dr com.apple.quarantine /path/to/MechSim.app
     ```
3. There is no window and no Dock icon: MechSim runs in the background. After a few seconds your browser opens with MechSim. Done.

You only have to do the "Open Anyway" step once.

### 3. Using it

- The page is MechSim. **Bearbeiten** edits a layout, **Speichern** saves it under a name, the scene list at the top has the examples ("Beispiele") and your own layouts ("Meine Aufbauten").
- **Your saved layouts** are files in the folder `Documents/MechSim/Aufbauten` (on a German system `Dokumente/MechSim/Aufbauten`). Copy a `.json` file from there to give a layout to someone else; put a file there to add one. Deleted layouts go to the folder `.trash` inside it.
- **Quit:** click **Beenden** at the bottom right of the page. (Closing the browser tab also ends MechSim after about a minute; on Windows closing the black window ends it at once.)
- Starting MechSim a second time while it runs only opens the browser again.

### 4. If something does not work

| Problem | What to do |
|---|---|
| The browser does not open | Open it yourself and go to `http://127.0.0.1:8000`. |
| The page says "Getrennt" (disconnected) | MechSim was closed or the computer slept. Start `MechSim.exe` / `MechSim.app` again and reload the page. |
| Nothing happens when starting (Windows) | Look at the black window: it names the problem. |
| Nothing happens when starting (macOS) | Read `Documents/MechSim/mechsim.log` (the reason is at the end). A dialog appears if MechSim could not start. |
| "Address already in use" | Another program uses port 8000. MechSim takes the next free port by itself; read the address in the black window / the log. |
| Update to a newer version | Delete the old folder or app and unzip the new zip. Your layouts stay, they are in `Documents/MechSim`. |

---

## Route 2: from the source code (with git)

Only needed if you want to change MechSim or build the zips yourself. All commands below are typed into a terminal:
**Windows:** open the Start menu, type `PowerShell`, press Enter. **macOS:** open the app **Terminal** (Spotlight: press Cmd+Space, type `Terminal`).

### A. Install git

*What is git?* A program that downloads a project with its whole history and later brings you the changes ("pull") or sends yours ("push").

**Windows**
1. Download the installer from <https://git-scm.com/download/win> (the "64-bit Git for Windows Setup") and run it. Every question can be answered with **Next**; the defaults are fine. (Or, in PowerShell: `winget install --id Git.Git -e`.)
2. Close PowerShell and open it again (so it finds git).

**macOS**
1. In the Terminal run `git --version`. If git is missing, macOS offers to install the **Command Line Tools**: click **Install** (this also installs the C++ compiler you need later). Or run `xcode-select --install`. (Alternative: `brew install git` if you use Homebrew.)

**Check, and tell git who you are** (once; use your own name and e-mail):
```bash
git --version
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### B. Log in to GitHub (only to send changes back)

The repository is **public**: <https://github.com/yannickblange/mechsim>. To **download** it you need no account and no login (step C). A free GitHub account (<https://github.com/signup>) is only needed to download the finished zips from the *Actions* page, to run the packaging workflow, or to send your own changes back: for the last one the owner must add you under *Settings → Collaborators* (or you work in your own copy, a "fork").

Logging in from the terminal is easiest with the GitHub command-line tool (optional):

| | Install | Log in |
|---|---|---|
| Windows | `winget install --id GitHub.cli -e` (then close and reopen PowerShell) | `gh auth login` |
| macOS | `brew install gh` (needs Homebrew, <https://brew.sh>) | `gh auth login` |

`gh auth login`: choose **GitHub.com** → **HTTPS** → "Authenticate Git with your GitHub credentials": **Yes** → **Login with a web browser**, type the one-time code in the browser page that opens.

### C. Download the code

Go to the folder where the project should live (for example `cd ~/Documents` on macOS, `cd $HOME\Documents` on Windows) and run:
```bash
git clone https://github.com/yannickblange/mechsim.git
cd mechsim
```
(No login is needed to download. With the `gh` tool from step B, `gh repo clone yannickblange/mechsim` does the same.)

### D. Install what the build needs

| Tool | Windows | macOS |
|---|---|---|
| **Python 3.10 or newer** | <https://www.python.org/downloads/> - run the installer and **tick "Add python.exe to PATH"** on the first page, then Install Now | `brew install python`, or the installer from python.org |
| **CMake 3.20 or newer** | `winget install --id Kitware.CMake -e` | `brew install cmake` |
| **C++ compiler** | **Visual Studio Build Tools**: <https://visualstudio.microsoft.com/downloads/> → "Build Tools for Visual Studio" → in the installer tick **Desktop development with C++** → Install (about 6 GB) | the Command Line Tools from step A (`xcode-select --install`) |

Close and reopen the terminal afterwards, then check:
```bash
python --version      # Windows; on macOS use  python3 --version
cmake --version
git --version
```

### E. Set up and run MechSim

In the folder `mechsim`:

**Windows (PowerShell)**
```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e . pyinstaller
cmake -S . -B build -DMECHSIM_BUILD_TESTS=OFF
cmake --build build --config Release --target mechsim
.venv\Scripts\python.exe -m mechsim.launcher
```

**macOS (Terminal)**
```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e . pyinstaller
cmake -S . -B build -DMECHSIM_BUILD_TESTS=OFF
cmake --build build --target mechsim
.venv/bin/python -m mechsim.launcher
```

The first two commands set up a private Python folder (`.venv`) and install the libraries. The `cmake` commands build the calculation engine (`libmechsim`; they put it where Python finds it). The last command starts MechSim and opens the browser, exactly like the double-click program (`--no-browser` and `--port 8010` are options).

*(You do not have to "activate" the virtual environment; the commands above call its Python directly. That also avoids the PowerShell message "running scripts is disabled".)*

### F. Build your own zip

```bash
.venv/bin/python tools/package.py          # macOS
.venv\Scripts\python.exe tools\package.py  # Windows
```
This builds the engine, packs everything with PyInstaller, writes `dist/MechSim-<version>-<system>-<machine>.zip` and tests the unzipped program. It only builds for the system it runs on: for the other systems use GitHub: **Actions → "Programm packen" → Run workflow** (or `gh workflow run package.yml`, then `gh run download`). It builds Windows, macOS (Apple chip and Intel) and Linux.

### G. Later: updates and changes

```bash
git pull                      # bring the newest version
git status                    # what did I change?
git add -A && git commit -m "what I changed"
git push                      # send it to GitHub (you need write access)
```
After a `git pull` that changes the C++ code run the two `cmake` lines of step E again. The tests: `.venv/bin/python -m pytest -q` (needs `pip install pytest httpx`), `node --test tests/frontend` (needs Node.js), and `ctest --test-dir build` when the build was made without `-DMECHSIM_BUILD_TESTS=OFF`.

### H. Problems when building

| Message | Cause and remedy |
|---|---|
| `python` or `cmake` "is not recognized" (Windows) | The tool is not in the PATH: reinstall Python with the tick "Add python.exe to PATH", or close and reopen PowerShell after installing. |
| `No CMAKE_CXX_COMPILER could be found` (Windows) | The C++ part of the Build Tools is missing: start the Visual Studio Installer → Modify → tick **Desktop development with C++**. |
| `ld: tapi error ... MacOSX27.sdk ... unknown architecture` (macOS) | A bug of the macOS 27 developer SDK. Use an older SDK: `ls /Library/Developer/CommandLineTools/SDKs`, then `export SDKROOT=/Library/Developer/CommandLineTools/SDKs/MacOSX26.sdk` (the newest one that is not 27) and build again; delete the folder `build` first. |
| `xcode-select: error: command line tools are already installed` | Fine: they are installed. |
| `fatal: repository ... not found` when cloning | Check the address for typos (`https://github.com/yannickblange/mechsim.git`). For *pushing* you need write access (step B). |
| `ModuleNotFoundError: No module named 'mechsim'` | `pip install -e .` was not run in the `.venv`, or you used the wrong Python: use `.venv/bin/python` (`.venv\Scripts\python.exe`). |
| `libmechsim not found` | The `cmake` build of step E was not run (or failed): run it and read its last lines. |
