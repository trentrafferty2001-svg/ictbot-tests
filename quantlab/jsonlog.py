"""Append-only CSV + JSONL logging. Every row gets a UTC timestamp."""
import csv
import datetime as dt
import json
from pathlib import Path


def utc_stamp() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def append(base: Path, row: dict) -> dict:
    """Append `row` to base.csv and base.jsonl. CSV columns grow if new keys appear."""
    row = {"logged_at_utc": utc_stamp(), **row}
    base = Path(base)
    base.parent.mkdir(parents=True, exist_ok=True)
    with open(base.with_suffix(".jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(row, default=str, sort_keys=False) + "\n")
    csv_path = base.with_suffix(".csv")
    existing = []
    fields = list(row.keys())
    if csv_path.exists():
        with open(csv_path, newline="", encoding="utf-8") as f:
            r = csv.DictReader(f)
            old_fields = r.fieldnames or []
            existing = list(r)
        new_keys = [k for k in fields if k not in old_fields]
        if new_keys:  # rewrite with the wider header; old values are kept
            fields = old_fields + new_keys
            with open(csv_path, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=fields)
                w.writeheader()
                w.writerows(existing)
        else:
            fields = old_fields
    with open(csv_path, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        if f.tell() == 0:
            w.writeheader()
        w.writerow(row)
    return row


def read_jsonl(base: Path) -> list:
    p = Path(base).with_suffix(".jsonl")
    if not p.exists():
        return []
    with open(p, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]
