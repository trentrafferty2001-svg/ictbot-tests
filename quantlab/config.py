"""Pre-registered test configs: load, validate, hash, and check git registration."""
import hashlib
import subprocess
from dataclasses import dataclass
from pathlib import Path

import yaml

from .paths import REPO_ROOT

REQUIRED = {
    "id": None,
    "registered_at": None,
    "status": None,
    "market": ["execution_symbol", "timezone"],
    "timeframe": ["session_open", "decision_time", "min_bar_coverage"],
    "entry_rule": ["type", "threshold", "direction", "max_positions"],
    "exit_rule": ["type", "extend_if_signal_repeats"],
    "holding_period": ["min_days", "max_days"],
    "position": ["leverage"],
    "cost_model": [
        "name", "spread_points", "slippage_points_per_side", "commission_pct_per_side",
        "swap_long_annual_pct", "swap_day_count", "stress_multiplier",
    ],
    "sample_split": ["in_sample", "out_of_sample", "forward_start"],
    "random_controls": ["count", "seed", "method"],
    "multiple_testing": ["prior_trials", "alpha"],
    "pass_thresholds": ["historical", "forward"],
}

HIST_KEYS = [
    "H1_min_trades", "H2_min_mean_net_pct", "H2_min_t", "H3_min_random_percentile",
    "H4_min_positive_year_share", "H4_min_trades_per_year", "H5_stressed_mean_net_pct_above",
    "H6_max_drawdown_pct", "min_day_coverage",
]
FWD_KEYS = ["F1_min_closed_trades", "F2_min_mean_net_pct", "F3_max_cost_ratio", "F4_config_unchanged"]


class ConfigError(ValueError):
    pass


@dataclass
class Config:
    path: Path
    raw_bytes: bytes
    data: dict

    @property
    def id(self) -> str:
        return self.data["id"]

    @property
    def sha256(self) -> str:
        """Hash of the file bytes exactly as committed (comments included)."""
        return hashlib.sha256(self.raw_bytes).hexdigest()

    def __getitem__(self, k):
        return self.data[k]


def validate(d: dict) -> None:
    missing = []
    for k, sub in REQUIRED.items():
        if k not in d or d[k] is None:
            missing.append(k)
            continue
        for s in sub or []:
            if not isinstance(d[k], dict) or s not in d[k]:
                missing.append(f"{k}.{s}")
    if missing:
        raise ConfigError("config is missing required fields: " + ", ".join(missing))
    pt = d["pass_thresholds"]
    miss = [f"pass_thresholds.historical.{k}" for k in HIST_KEYS if k not in pt["historical"]]
    miss += [f"pass_thresholds.forward.{k}" for k in FWD_KEYS if k not in pt["forward"]]
    if miss:
        raise ConfigError("config is missing thresholds: " + ", ".join(miss))
    if float(d["position"]["leverage"]) > 1.0:
        raise ConfigError("leverage above 1x is not allowed")
    if int(d["entry_rule"]["max_positions"]) != 1:
        raise ConfigError("max_positions must be 1 (no adding, averaging down, grid or martingale)")
    if d["entry_rule"]["direction"] != "long":
        raise ConfigError("only the long IBS rule is implemented")
    if d["status"] not in ("draft", "registered"):
        raise ConfigError("status must be 'draft' or 'registered'")
    if int(d["random_controls"]["count"]) < 1000:
        raise ConfigError("random_controls.count must be at least 1000")


def load(path) -> Config:
    path = Path(path)
    raw = path.read_bytes()
    d = yaml.safe_load(raw)
    if not isinstance(d, dict):
        raise ConfigError(f"{path} is not a YAML mapping")
    validate(d)
    return Config(path=path.resolve(), raw_bytes=raw, data=d)


def _git(*args, cwd=REPO_ROOT) -> str:
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, check=False).stdout.strip()


def git_registration(cfg: Config) -> dict:
    """Is the config committed, unmodified, and when was it first committed?"""
    try:
        rel = str(cfg.path.relative_to(REPO_ROOT))
    except ValueError:
        return {"tracked": False, "clean": False, "first_commit": None, "first_commit_date": None, "head": None}
    tracked = bool(_git("ls-files", "--error-unmatch", rel))
    dirty = bool(_git("status", "--porcelain", "--", rel))
    first = _git("log", "--diff-filter=A", "--format=%H %cI", "--", rel).splitlines()
    first_commit, first_date = (first[-1].split(" ", 1) if first else (None, None))
    return {
        "tracked": tracked,
        "clean": tracked and not dirty,
        "first_commit": first_commit,
        "first_commit_date": first_date,
        "head": _git("rev-parse", "HEAD") or None,
    }
