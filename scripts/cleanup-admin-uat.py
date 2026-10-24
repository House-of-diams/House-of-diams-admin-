#!/usr/bin/env python3
"""Delete only managed admin artifacts, protecting configured/running/rollback releases."""
import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess

NAME = re.compile(r"[0-9a-f]{40}(?:-[0-9]+(?:-[0-9]+)?)?")
ARCHIVE = re.compile(r"admin-release-([0-9a-f]{40}-[0-9]+(?:-[0-9]+)?)\.tar\.gz(?:\.sha256)?")


def clean(base, temporary, active, rollback, running, keep_candidate=None):
    base = base.resolve(strict=True)
    protected = {active.resolve(strict=True), rollback.resolve(strict=True), *running}
    for value in [active, rollback]:
        if value.is_symlink() or value.parent.resolve() != base or not NAME.fullmatch(value.name):
            raise RuntimeError("Refusing invalid protected release")
    if keep_candidate:
        if not NAME.fullmatch(keep_candidate):
            raise RuntimeError("Invalid candidate")
        protected.add(base / keep_candidate)
    removed = []
    for candidate in base.iterdir():
        if not NAME.fullmatch(candidate.name) or candidate.is_symlink() or not candidate.is_dir():
            continue
        resolved = candidate.resolve(strict=True)
        if resolved.parent != base or resolved in protected:
            continue
        if os.path.ismount(candidate):
            raise RuntimeError("Refusing mounted release")
        shutil.rmtree(candidate)
        removed.append(candidate.name)
    for candidate in temporary.iterdir():
        match = ARCHIVE.fullmatch(candidate.name)
        if match and match[1] != keep_candidate and candidate.is_file() and not candidate.is_symlink():
            candidate.unlink()
            removed.append(candidate.name)
    return removed


def main():
    import fcntl
    parser = argparse.ArgumentParser()
    parser.add_argument("--keep-candidate")
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise RuntimeError("Existing root deployment account required")
    with open('/run/lock/hod-admin-uat-deploy.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        base = Path('/opt/hod-admin/releases')
        active = Path(subprocess.check_output(['systemctl', 'show', 'hod-admin-uat.service', '-p', 'WorkingDirectory', '--value'], text=True).strip())
        pid = subprocess.check_output(['systemctl', 'show', 'hod-admin-uat.service', '-p', 'MainPID', '--value'], text=True).strip()
        if not pid.isdigit() or int(pid) < 1 or Path('/proc/' + pid + '/cwd').resolve() != active.resolve():
            running = Path('/proc/' + pid + '/cwd').resolve() if pid.isdigit() and int(pid) > 0 else None
            # Never delete anything while it is unclear which release is live, but do not block the deployment: activating the new
            # release restarts the service, which makes the configured and running release the same again (or rolls back safely).
            print('WARNING: service configured/running release differs; no cleanup performed (configured=%s running=%s pid=%s)' % (active, running, pid))
            return
        marker = Path('/opt/hod-admin/rollback-release')
        # Initial migration release is the known-good fallback before first managed success.
        rollback = Path(marker.read_text().strip()) if marker.exists() else base / '111f8c53d738d0b799b38bf0edd4cefa04654d52'
        running = set()
        for item in Path('/proc').glob('[0-9]*/cwd'):
            try:
                cwd = item.resolve(strict=True)
                for release in [cwd, *cwd.parents]:
                    if release.parent == base and NAME.fullmatch(release.name):
                        running.add(release)
                        break
            except (FileNotFoundError, PermissionError, ProcessLookupError):
                continue
        removed = clean(base, Path('/tmp'), active, rollback, running, args.keep_candidate)
        print('Protected active:', active)
        print('Protected rollback:', rollback)
        print('Removed managed stale artifacts:', ', '.join(removed) or 'none')


if __name__ == '__main__':
    main()
