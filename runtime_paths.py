"""Bundled assets are read-only; user data must survive EXE updates."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def data_directory():
    if os.environ.get('CAPACITY_DATA_DIR'):
        return Path(os.environ['CAPACITY_DATA_DIR']).expanduser().resolve()
    if getattr(sys, 'frozen', False):
        base = Path(os.environ.get('LOCALAPPDATA', Path.home()/'AppData'/'Local'))
        return base/'Moshnosti'
    return ROOT/'data'

def calendar_directory():
    # Source checkouts keep their existing calendars; frozen apps use persistent copies.
    if not getattr(sys, 'frozen', False) and not os.environ.get('CAPACITY_DATA_DIR'):
        return ROOT/'calendars'
    target = data_directory()/'calendars'
    target.mkdir(parents=True, exist_ok=True)
    for src in (ROOT/'calendars').glob('*.json'):
        dest = target/src.name
        if not dest.exists():
            # Exclusive creation avoids replacing any previously edited calendar.
            try:
                with dest.open('x', encoding='utf-8') as f:
                    f.write(src.read_text(encoding='utf-8'))
            except FileExistsError:
                pass
    return target
