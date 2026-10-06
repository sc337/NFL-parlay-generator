"""Do not let the slower archive job overwrite fresh price-worker output."""
import json
import sys
import time
from pathlib import Path
from refresh_price_worker import stamp

def replace_if_newer(source, target):
    source, target = Path(source), Path(target)
    raw = source.read_bytes()
    candidate = json.loads(raw)
    new = stamp(candidate)
    if new is None or new > time.time() + 300:
        raise ValueError('Invalid snapshot timestamp: ' + str(source))
    try:
        old = stamp(json.loads(target.read_text()))
    except (OSError, ValueError):
        old = None
    if old is not None and old <= time.time() + 300 and old >= new:
        print('Keeping newer snapshot:', target)
        return False
    target.write_bytes(raw)
    return True

if __name__ == '__main__':
    replace_if_newer(*sys.argv[1:])
