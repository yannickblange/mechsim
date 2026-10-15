"""Entry point of the packaged app (PyInstaller starts this file)."""
import sys

from mechsim.launcher import main

if __name__ == "__main__":
    sys.exit(main())
