#!/usr/bin/env python3
"""Restricted SSH entry point; receives a dist tarball and activates a release."""
import fcntl
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile

ROOT = Path('/var/www/revo')


def deploy():
    command = os.environ.get('SSH_ORIGINAL_COMMAND', '')
    if not re.fullmatch(r'deploy [a-f0-9]{40}-[0-9]+-[0-9]+', command):
        raise ValueError('Only a versioned deployment is allowed')
    release_id = command.split()[1]
    with (ROOT / '.deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        current = ROOT / 'dist'
        if not current.is_symlink():
            raise ValueError('The live directory must be a release symlink')
        previous = current.resolve(strict=True)
        release = ROOT / 'releases' / release_id
        release.mkdir()
        # No links, devices, absolute paths, or parent traversal from the archive.
        with tarfile.open(fileobj=sys.stdin.buffer, mode='r|gz') as archive:
            for member in archive:
                parts = Path(member.name).parts
                if member.name.startswith('/') or '..' in parts:
                    raise ValueError('Unsafe archive path')
                target = release.joinpath(*parts)
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                elif member.isfile():
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.extractfile(member) as source, target.open('xb') as output:
                        shutil.copyfileobj(source, output)
                    target.chmod(0o644)
                else:
                    raise ValueError('Only regular files and directories are allowed')
        if not (release / 'index.html').is_file():
            raise ValueError('Missing application entry point')
        # Keep hashed assets available to browsers using the previous application.
        old_assets = previous / 'assets'
        if old_assets.is_dir():
            def preserve(source, destination):
                if not Path(destination).exists():
                    shutil.copy2(source, destination)
                return destination
            shutil.copytree(old_assets, release / 'assets', dirs_exist_ok=True,
                            copy_function=preserve)
        (release / 'release.txt').write_text(release_id + '\n')
        pending = ROOT / '.dist-next'
        pending.symlink_to(release)
        os.replace(pending, current)
        try:
            result = subprocess.check_output([
                'curl', '--fail', '--silent', '--show-error', '--max-time', '30',
                '--resolve', 'revo.iamspecial.com.sa:443:127.0.0.1',
                'https://revo.iamspecial.com.sa/release.txt',
            ], text=True)
            if result.strip() != release_id:
                raise ValueError('Live release verification failed')
        except BaseException:
            pending.symlink_to(previous)
            os.replace(pending, current)
            raise
        print('Activated release ' + release_id)


if __name__ == '__main__':
    deploy()
