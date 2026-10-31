# Replay verdict — trend-50d (portfolio) · EA strategy trend-50d · AUDUSD

**FAIL** · 2015-01-01 → 2025-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 335 (34 a year) |
| Mean R after costs | -0.072 (95% range -0.319 to +0.174), t = -0.57 |
| Winners | 29.3% · profit factor 0.89 |
| Cost | median 1.5% of the stop · mean R with costs × 1.5: -0.207 |
| Overnight swap | mean -0.249R a trade · 98% of trades held overnight |
| Random entries (same exits, 1000 runs) | mean +0.099 · bot -0.431 · bot beats 0.0% |
| Exit-model check | correlation with the replayed trades 0.66 (should be > 0.8) |

## Rules

- ✅ Q1: at least 300 trades (all markets)
- ❌ Q2: mean R > 0 after costs and swaps with t ≥ 2.5
- ❌ Q3: beats ≥ 95% of random-entry runs (same exits)
- ❌ Q4: positive in ≥ 60% of years (years with ≥ 20 trades)
- ❌ Q5: still positive with costs and swaps × 1.5
- ❌ Q6: positive mean in ≥ half the markets with ≥ 20 trades

## By market

| Market | Trades | Mean R | t | Winners |
|---|---|---|---|---|
| aud | 48 | -0.382 | -2.38 | 21% |
| btc | 27 | +1.605 | 1.29 | 37% |
| eur | 50 | -0.404 | -2.03 | 20% |
| gold | 37 | -0.006 | -0.02 | 35% |
| jpy | 47 | -0.195 | -0.92 | 28% |
| nas | 40 | +0.012 | 0.05 | 38% |
| spx | 43 | -0.092 | -0.45 | 37% |
| xag | 43 | -0.376 | -1.65 | 26% |

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2015 | 25 | -0.496 | -2.04 |
| 2016 | 37 | -0.177 | -0.84 |
| 2017 | 25 | +0.092 | 0.19 |
| 2018 | 36 | -0.430 | -2.48 |
| 2019 | 28 | -0.328 | -1.18 |
| 2020 | 36 | +1.223 | 1.31 |
| 2021 | 36 | -0.375 | -2.50 |
| 2022 | 39 | -0.202 | -1.00 |
| 2023 | 38 | -0.258 | -1.11 |
| 2024 | 35 | +0.124 | 0.43 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 335 | -0.072 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london_mid | 1 | +0.006 | 100% |
| ny | 2 | +1.939 | 50% |
| sydney | 262 | -0.001 | 31% |
| tokyo | 70 | -0.396 | 21% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 184 | +0.241 | 35% |
| sell | 151 | -0.453 | 22% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| ea | 335 | -0.072 | 29% |

Median stop: normal — · sniper — · all $1.83

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| cost under 4% of the stop | 286 | -0.182 | 29% |
| 4–6% | 23 | -0.437 | 22% |
| 6–8% | 14 | +2.434 | 43% |
| 8% or more | 12 | +0.322 | 25% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under $3 | 183 | -0.344 | 23% |
| $3–5 | 5 | -0.182 | 40% |
| $8 or more | 147 | +0.270 | 37% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.6× ATR or more | 329 | -0.060 | 29% |

## How trades ended

- Full stop-outs (−0.85R or worse): 53%
- Scratches (within ±0.15R, mostly breakeven exits): 6%
- Wins of 1R or more: 14% · average win +1.949R · average loss -0.908R
- Losers that first went 1R or more in your favour: 26% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 67% · +1R 47% · +1.5R 36% · +2R 30% · +3R 19%
- Winners closed at +1.949R on average; at their best they were +4.788R up (median +3.619R)
- Losers that never got more than +0.3R in profit: 34%
- Targets (median): TP1 —R, final target —R · final target within 1.5R on —% of trades · reached on —%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| 3–7.5h | 1 | -1.000 | 0% |
| 7.5h or more (time limit) | 334 | -0.069 | 29% |

## Signal study: do the entries point the right way?

Price move in the trade's direction after entry, in R, before costs and ignoring stops and exits. "Edge" is that move less the same move at the same time on nearby days. t is from daily totals.

| After | Trades | Move | Edge | t (daily) |
|---|---|---|---|---|
| 15 min | 335 | +0.003 | +0.003 | 0.95 |
| 30 min | 335 | +0.004 | +0.002 | 0.50 |
| 60 min | 335 | +0.008 | +0.003 | 0.77 |
| 120 min | 335 | +0.012 | +0.005 | 0.86 |

❌ S1: edge after 60 min (+0.003R) is bigger than the median cost (+0.015R) with t ≥ 2 (0.77). Not shown that the entries point the right way by more than they cost (it needs both), so changing the exits is unlikely to make them pay; change or simplify the entry.

Mean R with t from daily totals instead of single trades (overlapping trades aren't independent): t = -0.58 (the rules use the single-trade t above).

## Entries refused (cycles)

- data check: 961
- first hour after the weekly open: 85
- costs #% of the stop: 45
- last hour before the weekend close: 7

Settings: {"market":"aud","symbol":"AUDUSD","cycleMin":60,"spreadMult":1,"slippage":0,"balance":1000000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"ea","V1_EA":"trend-50d","V1_MAX_LOTS":"10"}}
