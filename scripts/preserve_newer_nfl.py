"""Keep a delayed job from replacing a more recent NFL price snapshot."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

def timestamp(payload):
    try:
        value = datetime.fromisoformat(payload.get('updated_at', '').replace('Z', '+00:00'))
        return value.timestamp() if value.tzinfo else None
    except (ValueError, TypeError, AttributeError):
        return None

def replace_if_newer(source, target):
    source, target = Path(source), Path(target)
    raw = source.read_text()
    candidate = json.loads(raw)
    stamp = timestamp(candidate)
    if stamp is None or stamp > datetime.now(timezone.utc).timestamp() + 300:
        raise ValueError('NFL snapshot timestamp invalid')
    if not isinstance(candidate.get('games'), list) or any(not isinstance(g.get('markets'), list) for g in candidate['games']):
        raise ValueError('NFL snapshot schema invalid')
    try:
        existing = timestamp(json.loads(target.read_text()))
    except (OSError, ValueError):
        existing = None
    if existing is not None and existing <= datetime.now(timezone.utc).timestamp() + 300 and existing >= stamp:
        print('Keeping newer NFL snapshot already on main')
        return False
    target.write_text(raw)
    return True

if __name__ == '__main__':
    replace_if_newer(sys.argv[1], sys.argv[2])
