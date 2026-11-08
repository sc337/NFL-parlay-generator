"""Publish only the independent ESPN lookup; never overwrite a newer result."""
import json
import subprocess
from pathlib import Path

PATH = 'data/espn-intel-nfl.json'


def git(*args):
    return subprocess.run(['git', *args], check=True)


def main():
    candidate = Path(PATH).read_text()
    at = json.loads(candidate).get('lastAttemptAt', '')
    tracked = subprocess.run(['git', 'ls-files', '--error-unmatch', PATH], capture_output=True).returncode == 0
    if tracked:
        git('restore', PATH)
    else:
        Path(PATH).unlink()
    git('config', 'user.name', 'github-actions[bot]')
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    for attempt in range(3):
        git('pull', '--rebase', 'origin', 'main')
        current = json.loads(Path(PATH).read_text()) if Path(PATH).exists() else {}
        if current.get('lastAttemptAt', '') >= at:
            return
        Path(PATH).write_text(candidate)
        git('add', PATH)
        git('commit', '-m', 'Refresh automatic ESPN matchup intelligence')
        if subprocess.run(['git', 'push', 'origin', 'HEAD:main']).returncode == 0:
            return
        git('reset', '--soft', 'HEAD~1')
        git('reset', 'HEAD', '--', PATH)
        if subprocess.run(['git', 'ls-files', '--error-unmatch', PATH], capture_output=True).returncode == 0:
            git('restore', PATH)
        else:
            Path(PATH).unlink(missing_ok=True)
    raise RuntimeError('ESPN lookup publish failed after three attempts')


if __name__ == '__main__':
    main()
