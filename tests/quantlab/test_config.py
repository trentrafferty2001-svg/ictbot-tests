import copy

import pytest
import yaml

from quantlab import config


def test_real_config_loads_with_all_required_fields(cfg):
    assert cfg.id == "ibs-nasdaq-v1"
    for k in ("market", "timeframe", "entry_rule", "exit_rule", "holding_period", "cost_model",
              "sample_split", "pass_thresholds", "random_controls"):
        assert k in cfg.data
    assert cfg["random_controls"]["count"] >= 1000
    assert len(cfg.sha256) == 64


def _write(tmp_path, d):
    p = tmp_path / "c.yaml"
    p.write_text(yaml.safe_dump(d))
    return p


@pytest.mark.parametrize("path", [("cost_model",), ("pass_thresholds",), ("entry_rule", "threshold"),
                                  ("sample_split", "out_of_sample"), ("random_controls", "count")])
def test_missing_field_is_rejected(cfg, tmp_path, path):
    d = copy.deepcopy(cfg.data)
    node = d
    for k in path[:-1]:
        node = node[k]
    del node[path[-1]]
    with pytest.raises(config.ConfigError):
        config.load(_write(tmp_path, d))


@pytest.mark.parametrize("key,value", [(("position", "leverage"), 2.0), (("entry_rule", "max_positions"), 3),
                                       (("random_controls", "count"), 100)])
def test_forbidden_settings_rejected(cfg, tmp_path, key, value):
    d = copy.deepcopy(cfg.data)
    d[key[0]][key[1]] = value
    with pytest.raises(config.ConfigError):
        config.load(_write(tmp_path, d))


def test_hash_changes_with_any_byte(cfg, tmp_path):
    p = tmp_path / "c.yaml"
    p.write_bytes(cfg.raw_bytes)
    h1 = config.load(p).sha256
    p.write_bytes(cfg.raw_bytes + b"\n# comment\n")
    assert config.load(p).sha256 != h1
