# Replay verdict — trend-50d-control-v2 (control) · EA strategy trend-50d · AUDUSD

**PASS** · 2019-01-01 → 2021-01-01 · synthetic control data

| | |
|---|---|
| Trades | 73 (37 a year) |
| Mean R after costs | +0.138 (95% range -0.271 to +0.548), t = 0.66 |
| Winners | 35.6% · profit factor 1.24 |
| Cost | median 1.1% of the stop · mean R with costs × 1.5: -0.018 |
| Overnight swap | mean -0.289R a trade · 100% of trades held overnight |
| Random entries (same exits, 0 runs) | mean — · bot — · bot beats —% |
| Exit-model check | correlation with the replayed trades 0.76 (should be > 0.8) |

## Rules

- ✅ C1: no "edge" on random data (t < 2)
- ✅ C2: random-entry percentile not extreme (5–95)

## By market

| Market | Trades | Mean R | t | Winners |
|---|---|---|---|---|
| aud | 7 | +1.466 | 1.14 | 57% |
| btc | 8 | -0.903 | -3.93 | 13% |
| eur | 9 | -0.036 | -0.08 | 33% |
| gbp | 8 | +0.077 | 0.14 | 38% |
| gold | 7 | +0.330 | 0.60 | 43% |
| jpy | 10 | -0.149 | -0.30 | 20% |
| nas | 7 | +0.773 | 0.85 | 57% |
| spx | 9 | +0.014 | 0.03 | 33% |
| wti | 8 | +0.052 | 0.11 | 38% |
| xag | 0 | — | — | — |

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2019 | 38 | +0.268 | 1.06 |
| 2020 | 35 | -0.002 | -0.01 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 73 | +0.138 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| sydney | 64 | +0.056 | 34% |
| tokyo | 9 | +0.722 | 44% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 35 | +0.447 | 43% |
| sell | 38 | -0.146 | 29% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| ea | 73 | +0.138 | 36% |

Median stop: normal — · sniper — · all $2.78

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 57 | +0.297 | 39% |
| 4–6% | 5 | +0.692 | 60% |
| 6–8% | 3 | -1.016 | 0% |
| 8% or more | 8 | -0.903 | 13% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under $3 | 39 | +0.217 | 36% |
| $3–5 | 3 | +0.339 | 33% |
| $8 or more | 31 | +0.020 | 35% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.6× ATR or more | 73 | +0.138 | 36% |

## How trades ended

- Full stop-outs (−0.85R or worse): 45%
- Scratches (within ±0.15R, mostly breakeven exits): 7%
- Wins of 1R or more: 23% · average win +1.977R · average loss -0.879R
- Losers that first went 1R or more in your favour: 34% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 70% · +1R 56% · +1.5R 45% · +2R 32% · +3R 22%
- Winners closed at +1.977R on average; at their best they were +4.233R up (median +4.261R)
- Losers that never got more than +0.3R in profit: 34%
- Targets (median): TP1 —R, final target —R · final target within 1.5R on —% of trades · reached on —%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| 7.5h or more (time limit) | 73 | +0.138 | 36% |

## Signal study: do the entries point the right way?

Price move in the trade's direction after entry, in R, before costs and ignoring stops and exits. "Edge" is that move less the same move at the same time on nearby days. t is from daily totals.

| After | Trades | Move | Edge | t (daily) |
|---|---|---|---|---|
| 15 min | 73 | +0.000 | -0.000 | -0.17 |
| 30 min | 73 | +0.003 | +0.002 | 0.49 |
| 60 min | 73 | +0.003 | +0.001 | 0.10 |
| 120 min | 73 | -0.002 | -0.003 | -0.47 |

❌ S1: edge after 60 min (+0.001R) is bigger than the median cost (+0.011R) with t ≥ 2 (0.10). Not shown that the entries point the right way by more than they cost (it needs both), so changing the exits is unlikely to make them pay; change or simplify the entry.

Mean R with t from daily totals instead of single trades (overlapping trades aren't independent): t = 0.66 (the rules use the single-trade t above).

## Entries refused (cycles)

- costs #% of the stop: 40
- first hour after the weekly open: 18

Settings: {"market":"aud","symbol":"AUDUSD","cycleMin":60,"spreadMult":1,"slippage":0,"balance":1000000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ea","V1_EA":"trend-50d","V1_MAX_LOTS":"10"}}
