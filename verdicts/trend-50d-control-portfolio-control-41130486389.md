# Replay verdict — trend-50d-control (control) · EA strategy trend-50d · AUDUSD

**FAIL** · 2019-01-01 → 2021-01-01 · synthetic control data

| | |
|---|---|
| Trades | 70 (35 a year) |
| Mean R after costs | -0.325 (95% range -0.522 to -0.127), t = -3.22 |
| Winners | 27.1% · profit factor 0.40 |
| Cost | median 1.1% of the stop · mean R with costs × 1.5: -0.473 |
| Overnight swap | mean -0.271R a trade · 100% of trades held overnight |
| Random entries (same exits, 1000 runs) | mean -0.188 · bot -0.623 · bot beats 0.0% |
| Exit-model check | correlation with the replayed trades 0.84 (should be > 0.8) |

## Rules

- ✅ C1: no "edge" on random data (t < 2)
- ❌ C2: random-entry percentile not extreme (5–95)

## By market

| Market | Trades | Mean R | t | Winners |
|---|---|---|---|---|
| aud | 7 | -0.199 | -0.59 | 43% |
| btc | 7 | -0.901 | -4.20 | 14% |
| eur | 7 | -0.196 | -0.58 | 43% |
| gbp | 7 | -0.197 | -0.59 | 43% |
| gold | 7 | -0.314 | -0.91 | 14% |
| jpy | 7 | -0.196 | -0.58 | 43% |
| nas | 7 | -0.316 | -0.92 | 14% |
| spx | 7 | -0.251 | -0.71 | 29% |
| wti | 7 | -0.330 | -0.96 | 14% |
| xag | 7 | -0.349 | -1.00 | 14% |

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2019 | 40 | -0.101 | -0.66 |
| 2020 | 30 | -0.623 | -6.64 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 70 | -0.325 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| sydney | 50 | -0.737 | 8% |
| tokyo | 20 | +0.705 | 75% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 40 | -0.449 | 23% |
| sell | 30 | -0.160 | 33% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| ea | 70 | -0.325 | 27% |

Median stop: normal — · sniper — · all $3.04

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 49 | -0.238 | 33% |
| 4–6% | 7 | -0.330 | 14% |
| 6–8% | 10 | -0.598 | 20% |
| 8% or more | 4 | -0.693 | 0% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under $3 | 35 | -0.254 | 31% |
| $3–5 | 7 | -0.196 | 43% |
| $8 or more | 28 | -0.445 | 18% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.6× ATR or more | 70 | -0.325 | 27% |

## How trades ended

- Full stop-outs (−0.85R or worse): 26%
- Scratches (within ±0.15R, mostly breakeven exits): 17%
- Wins of 1R or more: 13% · average win +0.812R · average loss -0.748R
- Losers that first went 1R or more in your favour: 22% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 81% · +1R 43% · +1.5R 29% · +2R 29% · +3R 14%
- Winners closed at +0.812R on average; at their best they were +2.712R up (median +3.274R)
- Losers that never got more than +0.3R in profit: 0%
- Targets (median): TP1 —R, final target —R · final target within 1.5R on —% of trades · reached on —%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| 7.5h or more (time limit) | 70 | -0.325 | 27% |

## Signal study: do the entries point the right way?

Price move in the trade's direction after entry, in R, before costs and ignoring stops and exits. "Edge" is that move less the same move at the same time on nearby days. t is from daily totals.

| After | Trades | Move | Edge | t (daily) |
|---|---|---|---|---|
| 15 min | 70 | -0.003 | -0.005 | -0.69 |
| 30 min | 70 | -0.002 | -0.003 | -0.27 |
| 60 min | 70 | +0.007 | +0.005 | 0.27 |
| 120 min | 70 | +0.025 | +0.032 | 1.54 |

❌ S1: edge after 60 min (+0.005R) is bigger than the median cost (+0.011R) with t ≥ 2 (0.27). Not shown that the entries point the right way by more than they cost (it needs both), so changing the exits is unlikely to make them pay; change or simplify the entry.

Mean R with t from daily totals instead of single trades (overlapping trades aren't independent): t = -0.99 (the rules use the single-trade t above).

## Entries refused (cycles)

- first hour after the weekly open: 20

Settings: {"market":"aud","symbol":"AUDUSD","cycleMin":60,"spreadMult":1,"slippage":0,"balance":1000000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ea","V1_EA":"trend-50d","V1_MAX_LOTS":"10"}}
