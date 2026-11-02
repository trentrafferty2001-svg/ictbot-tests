# ictbot-tests

Public test copy of the ICT Gold Bot engine, used to run its replay tests on GitHub's free runners.
It holds the bot engine, `src/`, the test tools in `tools/` and the replay workflow. It has no keys,
account details or deployment settings, and it doesn't trade: the live bot runs elsewhere.

How the tests work and their pass rules: `tools/replay/RULES.md`. Every run is logged in `tools/replay/VARIANTS.md`.

## quantlab (Python): costs, pre-registered backtests, Nasdaq IBS demo mode

`quantlab/` is a separate Python framework that measures costs and tests rules against thresholds
written before each run. It covers the read-only `/costs` snapshot, the pre-registered backtest
harness with 1,000 random-entry controls, and the demo-only Nasdaq IBS mode with its forward log.
How to use it: `quantlab/README.md`. Current state: `research/STATUS.md`.

```
make install && make test
```
