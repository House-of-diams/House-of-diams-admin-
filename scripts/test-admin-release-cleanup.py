import importlib.util
from pathlib import Path
import tempfile
import unittest
import sys

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('cleanup', Path(__file__).with_name('cleanup-admin-uat.py'))
cleanup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleanup)


class RetentionTests(unittest.TestCase):
    def test_keep_active_rollback_running_and_unrelated_remove_failed_release_and_archives(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            base = root / 'releases'
            base.mkdir()
            names = [character * 40 for character in 'abcdef']
            active, rollback, stale, running, pending, unrelated = [base / n for n in names]
            for p in [active, rollback, stale, running, pending, unrelated]:
                p.mkdir()
                (p / 'file').write_text('test')
            (base / 'other-project').mkdir()
            archives = root / 'tmp'
            archives.mkdir()
            stale_archive = archives / ('admin-release-' + names[2] + '-123-1.tar.gz')
            stale_archive.write_text('failed upload')
            other_file = archives / 'other-project.tar.gz'
            other_file.write_text('preserve')
            cleanup.clean(base, archives, active, rollback, {running.resolve()}, pending.name)
            for p in [active, rollback, running, pending, base / 'other-project', other_file]:
                self.assertTrue(p.exists(), str(p))
            self.assertFalse(stale.exists())
            self.assertFalse(unrelated.exists())  # managed-looking inactive release only
            self.assertFalse(stale_archive.exists())

    def test_invalid_protected_path_aborts_before_deleting_anything(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            base = root / 'releases'
            base.mkdir()
            active = base / ('a' * 40)
            active.mkdir()
            rollback = root / ('b' * 40)
            rollback.mkdir()
            stale = base / ('c' * 40)
            stale.mkdir()
            with self.assertRaises(RuntimeError):
                cleanup.clean(base, root, active, rollback, set())
            self.assertTrue(stale.exists())


if __name__ == '__main__':
    unittest.main()
