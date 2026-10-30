# Replay verdict — smoke-btc (smoke) · BTCUSD#

**SMOKE TEST: PROBLEM (no trades)** · 2024-03-01 → 2024-04-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 0 (0 a year) |
| Mean R after costs | — (95% range — to —), t = — |
| Winners | —% · profit factor — |
| Cost | median —% of the stop · mean R with costs × 1.5: — |
| Random entries (same exits, 0 runs) | mean — · bot — · bot beats —% |
| Exit-model check | correlation with the replayed trades — (should be > 0.8) |

## Rules

- ❌ I1: at least 300 trades
- ❌ I2: mean R > 0 after costs with t ≥ 3
- ❌ I3: beats ≥ 95% of random-entry runs (same exits)
- ❌ I4: positive in ≥ 2/3 of years (years with ≥ 30 trades)
- ❌ I5: still positive with costs × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|

## By score

| Score | Trades | Mean R |
|---|---|---|

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|

## Entries refused (cycles)

- costs #% of the stop: 5

Settings: {"market":"btc","symbol":"BTCUSD#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ict2022","V1_MAX_LOTS":"0.02"}}
