"""Publish only NFL prices, independently of other sports and archive work."""
import json
import subprocess
import tempfile
from pathlib import Path
from preserve_newer_nfl import replace_if_newer

def git(*args):
    return subprocess.run(['git', *args], check=True)

def main():
    with tempfile.TemporaryDirectory() as directory:
        candidate = Path(directory) / 'kalshi-nfl.json'
        payload = json.loads(Path('data/kalshi-nfl.json').read_text())
        for game in payload.get('games', []):
            game['markets'] = [m for m in game['markets'] if not m.get('player') or m.get('_serverRosterVerified')]
        candidate.write_text(json.dumps(payload, separators=(',', ':')))
        git('config', 'user.name', 'github-actions[bot]')
        git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
        git('restore', 'data/kalshi-nfl.json')
        for attempt in range(3):
            git('pull', '--rebase', 'origin', 'main')
            if not replace_if_newer(candidate, 'data/kalshi-nfl.json'):
                return
            git('add', 'data/kalshi-nfl.json')
            git('commit', '-m', 'Refresh independent NFL price snapshot')
            if subprocess.run(['git', 'push', 'origin', 'HEAD:main']).returncode == 0:
                return
            # Undo only this runner's failed price commit before retrying.
            git('reset', '--soft', 'HEAD~1')
            git('restore', '--staged', 'data/kalshi-nfl.json')
            git('restore', 'data/kalshi-nfl.json')
        raise RuntimeError('NFL snapshot push failed after three attempts')

if __name__ == '__main__':
    main()
