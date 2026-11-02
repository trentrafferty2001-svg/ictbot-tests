"""Immutable run records and the trial count.

Each run writes runs/<config id>/<UTC stamp>-<config hash 8>.json (+ .md report),
opened with mode 'x' so an existing record can never be overwritten, then made
read-only. runs/INDEX.csv is append-only. The same config id with a different
config hash is refused: a changed rule is a new id.
"""
import csv
import datetime as dt
import hashlib
import json
import os
import stat
from pathlib import Path

from .paths import runs_dir

INDEX_FIELDS = ["run_at_utc", "config_id", "config_sha256", "data_sha256", "data_from", "data_to",
                "trial_number", "historical_verdict", "real_money_verdict", "record"]


class RegistrationError(RuntimeError):
    pass


def file_sha256(path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_index(root: Path = None) -> list:
    p = (root or runs_dir()) / "INDEX.csv"
    if not p.exists():
        return []
    with open(p, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def check_id_hash(config_id: str, config_hash: str, root: Path = None) -> None:
    for r in read_index(root):
        if r["config_id"] == config_id and r["config_sha256"] != config_hash:
            raise RegistrationError(
                f"config id {config_id!r} already has a run with a different config hash "
                f"({r['config_sha256'][:12]}). A changed rule, cost model, split or threshold is a NEW "
                f"config: give it a new id."
            )


def trial_number(prior_trials: int, config_hash: str, root: Path = None) -> int:
    """prior_trials + distinct config hashes run here (re-running the same hash is not a new try)."""
    hashes = {r["config_sha256"] for r in read_index(root)}
    hashes.add(config_hash)
    return int(prior_trials) + len(hashes)


def write_record(record: dict, report_md: str, root: Path = None) -> Path:
    root = root or runs_dir()
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    d = root / record["config_id"]
    d.mkdir(parents=True, exist_ok=True)
    base = d / f"{stamp}-{record['config_sha256'][:8]}"
    record = {**record, "run_at_utc": stamp}
    body = json.dumps(record, indent=2, default=str, sort_keys=True)
    record_hash = hashlib.sha256(body.encode()).hexdigest()
    for path, text in ((base.with_suffix(".json"), body), (base.with_suffix(".md"), report_md),
                       (base.with_suffix(".sha256"), f"{record_hash}  {base.with_suffix('.json').name}\n")):
        with open(path, "x", encoding="utf-8") as f:  # 'x': never overwrite
            f.write(text)
        os.chmod(path, stat.S_IRUSR | stat.S_IRGRP | stat.S_IROTH)
    idx = root / "INDEX.csv"
    new = not idx.exists()
    with open(idx, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=INDEX_FIELDS)
        if new:
            w.writeheader()
        w.writerow({
            "run_at_utc": stamp, "config_id": record["config_id"], "config_sha256": record["config_sha256"],
            "data_sha256": record.get("data_sha256"), "data_from": record.get("data_from"),
            "data_to": record.get("data_to"), "trial_number": record.get("trial_number"),
            "historical_verdict": record.get("historical_verdict"),
            "real_money_verdict": record.get("real_money_verdict"),
            "record": str(base.with_suffix(".json").relative_to(root)),
        })
    return base.with_suffix(".json")


def verify(path) -> bool:
    """True if the record's .sha256 matches its .json content."""
    path = Path(path)
    want = path.with_suffix(".sha256").read_text().split()[0]
    return hashlib.sha256(path.read_bytes()).hexdigest() == want
