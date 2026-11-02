import json
import os

import pytest

from conftest import synthetic_snaps
from quantlab import records, runner


def rec(cid="x", h="a" * 64):
    return {"config_id": cid, "config_sha256": h, "data_sha256": "d", "data_from": "2015-01-01", "data_to": "2026-01-01",
            "trial_number": 62, "historical_verdict": "Fail", "real_money_verdict": "Fail"}


def test_record_is_written_once_and_read_only(tmp_path):
    p = records.write_record(rec(), "# report", root=tmp_path)
    assert p.exists() and p.with_suffix(".md").exists()
    assert not os.access(p, os.W_OK) or os.geteuid() == 0  # root ignores mode bits
    assert oct(p.stat().st_mode)[-3:] == "444"
    assert records.verify(p)
    with pytest.raises(FileExistsError):
        with open(p, "x"):
            pass
    assert len(records.read_index(tmp_path)) == 1


def test_tampering_is_detected(tmp_path):
    p = records.write_record(rec(), "r", root=tmp_path)
    os.chmod(p, 0o644)
    d = json.loads(p.read_text())
    d["historical_verdict"] = "Pass"
    p.write_text(json.dumps(d, indent=2, sort_keys=True))
    assert not records.verify(p)


def test_same_id_different_hash_refused(tmp_path):
    records.write_record(rec(h="a" * 64), "r", root=tmp_path)
    records.check_id_hash("x", "a" * 64, root=tmp_path)  # same hash ok
    with pytest.raises(records.RegistrationError):
        records.check_id_hash("x", "b" * 64, root=tmp_path)


def test_trial_number_counts_distinct_configs(tmp_path):
    assert records.trial_number(61, "a" * 64, root=tmp_path) == 62
    records.write_record(rec(h="a" * 64), "r", root=tmp_path)
    assert records.trial_number(61, "a" * 64, root=tmp_path) == 62  # re-run of same hash is not a new try
    assert records.trial_number(61, "b" * 64, root=tmp_path) == 63


def test_draft_config_refused_without_dry_run(cfg):
    assert cfg["status"] == "draft"
    with pytest.raises(runner.NotRegistered):
        runner.run(cfg, snaps=synthetic_snaps(n_days=3000))


def test_dry_run_writes_nothing_and_says_not_evidence(cfg, tmp_path):
    res = runner.run(cfg, dry_run=True, snaps=synthetic_snaps(n_days=3000, seed=9))
    assert res["path"] is None
    assert "not evidence" in res["report"]
    assert not (tmp_path / "runs" / "INDEX.csv").exists()
    for section in ("What would change this verdict?", "Engineering status", "Profitability status",
                    "Multiple testing", "Random-entry controls"):
        assert section in res["report"]
    assert res["record"]["historical_verdict"] in ("Pass", "Fail", "Insufficient evidence")
    assert "{{" not in res["report"]
