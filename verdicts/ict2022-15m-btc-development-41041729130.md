# Replay verdict — ict2022-15m-btc (development) · BTCUSD#

**TOO FEW TRADES** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 21 (7 a year) |
| Mean R after costs | +0.128 (95% range -0.318 to +0.574), t = 0.56 |
| Winners | 52.4% · profit factor 1.32 |
| Cost | median 8.5% of the stop · mean R with costs × 1.5: +0.087 |
| Random entries (same exits, 0 runs) | mean — · bot — · bot beats —% |
| Exit-model check | correlation with the replayed trades 1.00 (should be > 0.8) |

## Rules

- ❌ I1: at least 300 trades
- ❌ I2: mean R > 0 after costs with t ≥ 3
- ❌ I3: beats ≥ 95% of random-entry runs (same exits)
- ❌ I4: positive in ≥ 2/3 of years (years with ≥ 30 trades)
- ✅ I5: still positive with costs × 1.5

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2021 | 12 | +0.330 | 1.08 |
| 2022 | 1 | -0.703 | — |
| 2024 | 8 | -0.070 | -0.19 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 21 | +0.128 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 3 | +1.165 | 100% |
| london_mid | 2 | +0.000 | 50% |
| ny | 15 | +0.013 | 47% |
| ny_open | 1 | -1.000 | 0% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 10 | -0.092 | 40% |
| sell | 11 | +0.329 | 64% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 21 | +0.128 | 52% |

Median stop: normal $820.74 · sniper — · all $820.74

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| 4–6% | 1 | +2.000 | 100% |
| 6–8% | 4 | -0.145 | 50% |
| 8% or more | 16 | +0.079 | 50% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $8 or more | 21 | +0.128 | 52% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.2–1.6× ATR | 1 | -1.000 | 0% |
| 1.6× ATR or more | 20 | +0.185 | 55% |

## How trades ended

- Full stop-outs (−0.85R or worse): 33%
- Scratches (within ±0.15R, mostly breakeven exits): 5%
- Wins of 1R or more: 29% · average win +1.019R · average loss -0.851R
- Losers that first went 1R or more in your favour: 0% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 48% · +1R 43% · +1.5R 10% · +2R 0% · +3R 0%
- Winners closed at +1.019R on average; at their best they were +1.148R up (median +1.157R)
- Losers that never got more than +0.3R in profit: 100%
- Targets (median): TP1 +1.000R, final target +1.644R · final target within 1.5R on 0% of trades · reached on 0%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 19 | +0.212 | 58% |
| 2–3R | 2 | -0.671 | 0% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 3 | -1.000 | 0% |
| 1–3h | 5 | -0.071 | 40% |
| 3–7.5h | 12 | +0.440 | 67% |
| 7.5h or more (time limit) | 1 | +0.767 | 100% |

## Entries refused (cycles)

- data check: 2247
- costs #% of the stop: 342
- the stop beyond the raid: 124
- ICT # setup missed: 69
- price already went through the fair value gap: 6
- news: 6

Settings: {"market":"btc","symbol":"BTCUSD#","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ict2022","V1_ICT_TF":"15m","V1_MAX_LOTS":"0.02"}}
