import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import runtime_paths

class DesktopPathsTests(unittest.TestCase):
    def test_frozen_uses_persistent_calendar_without_overwriting_edits(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(os.environ, {'CAPACITY_DATA_DIR':tmp}), patch('sys.frozen',True,create=True):
                folder=runtime_paths.calendar_directory()
                self.assertEqual(folder,Path(tmp).resolve()/'calendars')
                p=folder/'2026.json';data=json.loads(p.read_text(encoding='utf-8'))
                data['source']='Проверенный календарь предприятия'
                p.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
                self.assertEqual(runtime_paths.calendar_directory(),folder)
                self.assertEqual(json.loads(p.read_text(encoding='utf-8'))['source'],data['source'])
    def test_frozen_defaults_to_local_appdata(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(os.environ,{'LOCALAPPDATA':tmp}):
                with patch('sys.frozen',True,create=True):
                    # CAPACITY_DATA_DIR deliberately overrides the default, when present.
                    env=dict(os.environ);env.pop('CAPACITY_DATA_DIR',None)
                    with patch.dict(os.environ,env,clear=True):
                        self.assertEqual(runtime_paths.data_directory(),Path(tmp)/'Moshnosti')
