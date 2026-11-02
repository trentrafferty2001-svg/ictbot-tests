"""Where logs, state and run records live."""
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def home() -> Path:
    """Logs and state (git-ignored). QUANTLAB_HOME overrides."""
    p = Path(os.environ.get("QUANTLAB_HOME") or (REPO_ROOT / "quantlab_data"))
    p.mkdir(parents=True, exist_ok=True)
    return p


def logs_dir() -> Path:
    p = home() / "logs"
    p.mkdir(parents=True, exist_ok=True)
    return p


def state_dir() -> Path:
    p = home() / "state"
    p.mkdir(parents=True, exist_ok=True)
    return p


def runs_dir() -> Path:
    """Immutable run records (committed to git)."""
    p = Path(os.environ.get("QUANTLAB_RUNS") or (REPO_ROOT / "runs"))
    p.mkdir(parents=True, exist_ok=True)
    return p
