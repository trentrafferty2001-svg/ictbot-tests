# quantlab commands. Python only; the JS replay in tools/replay is separate.
PY ?= python3
CONFIG ?= configs/ibs_nasdaq_v1.yaml

.PHONY: install test data backtest backtest-dry costs ibs-on ibs-off ibs-status ibs-tick forward gap daemon

install:
	$(PY) -m pip install -r requirements.txt

test:
	$(PY) -m pytest -q

# Nasdaq 100 1-minute prices (HistData/Dukascopy) for the IBS backtest.
data:
	$(PY) tools/replay/fetch_data.py --instrument nsxusd --from 2014-11-01 --to 2026-10-31 --name ibs

backtest:
	$(PY) -m quantlab backtest $(CONFIG)

backtest-dry:
	$(PY) -m quantlab backtest $(CONFIG) --dry-run

costs:
	$(PY) -m quantlab costs

ibs-on:
	$(PY) -m quantlab ibs on

ibs-off:
	$(PY) -m quantlab ibs off

ibs-status:
	$(PY) -m quantlab ibs status

ibs-tick:
	$(PY) -m quantlab ibs tick

forward:
	$(PY) -m quantlab forward

gap:
	$(PY) -m quantlab gap

daemon:
	$(PY) -m quantlab daemon
