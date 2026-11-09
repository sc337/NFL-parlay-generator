"""Publish only the independent ESPN lookup; never overwrite a newer result."""
import json
import subprocess
from pathlib import Path

PATHS = ['data/espn-intel-'+sport+'.json' for sport in ('nfl','nba','nhl','mlb','ncaaf','ufc')]


def git(*args):
    return subprocess.run(['git', *args], check=True)


def main():
    candidates = {path: Path(path).read_text() for path in PATHS if Path(path).exists()}
    def clean():
        for path in candidates:
            if subprocess.run(['git','ls-files','--error-unmatch',path],capture_output=True).returncode == 0:
                git('restore',path)
            else:
                Path(path).unlink(missing_ok=True)
    clean()
    git('config', 'user.name', 'github-actions[bot]')
    git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
    for attempt in range(3):
        git('pull', '--rebase', 'origin', 'main')
        changed = []
        for path, candidate in candidates.items():
            current = json.loads(Path(path).read_text()) if Path(path).exists() else {}
            if current.get('lastAttemptAt', '') >= json.loads(candidate).get('lastAttemptAt', ''):
                continue
            Path(path).write_text(candidate)
            changed.append(path)
        if not changed:
            return
        git('add', *changed)
        git('commit', '-m', 'Refresh automatic ESPN matchup intelligence')
        if subprocess.run(['git', 'push', 'origin', 'HEAD:main']).returncode == 0:
            return
        git('reset', '--soft', 'HEAD~1')
        git('reset', 'HEAD', '--', *candidates)
        clean()
    raise RuntimeError('ESPN lookup publish failed after three attempts')


if __name__ == '__main__':
    main()
