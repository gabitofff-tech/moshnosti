"""Keep CI test failures visible in GitHub annotations, including without login."""
from pathlib import Path
import os
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
suite=unittest.defaultTestLoader.discover('tests')
result=unittest.TextTestRunner(verbosity=2).run(suite)
if os.environ.get('GITHUB_ACTIONS'):
    for test,trace in result.failures+result.errors:
        text=trace.replace('%','%25').replace('\r','%0D').replace('\n','%0A')
        print(f'::error title={test.id()}::{text}',flush=True)
raise SystemExit(0 if result.wasSuccessful() else 1)
