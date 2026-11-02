"""Small JSON state files (IBS demo switch, positions, forward state)."""
import json

from .paths import state_dir


def load(name: str, default: dict) -> dict:
    p = state_dir() / f"{name}.json"
    if not p.exists():
        return dict(default)
    return {**default, **json.loads(p.read_text())}


def save(name: str, data: dict) -> None:
    p = state_dir() / f"{name}.json"
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, default=str))
    tmp.replace(p)
