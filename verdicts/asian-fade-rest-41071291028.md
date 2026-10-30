# Replay verdict — asian-fade (rest) · XAUUSD

**PART OF DEVELOPMENT — judge it together with its screen run** · 2015-01-01 → 2020-01-01 · real XAUUSD M1 prices

| | |
|---|---|
| Trades | 13 (4 a year) |
| Mean R after costs | +0.392 (95% range -0.427 to +1.211), t = 0.94 |
| Winners | 53.8% · profit factor 1.85 |
| Cost | median 7.6% of the stop · mean R with costs × 1.5: +0.355 |
| Random entries (same exits, 0 runs) | mean — · bot — · bot beats —% |
| Exit-model check | correlation with the replayed trades 1.00 (should be > 0.8) |

## Rules

- ❌ D1: at least 250 trades
- ❌ D2: mean R > 0 after costs with t ≥ 3
- ❌ D3: beats ≥ 95% of random-entry runs (same exits)
- ❌ D4: positive in ≥ 2/3 of years (years with ≥ 30 trades)
- ✅ D5: still positive with costs × 1.5
- ❌ D6: higher scores do better (top third > bottom third)

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2015 | 2 | +0.180 | 0.15 |
| 2016 | 4 | +0.256 | 0.35 |
| 2019 | 7 | +0.530 | 0.81 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 8 | +0.479 |
| 6 | 4 | +0.565 |
| 7 | 1 | -1.000 |

## Same trades with the lot cap at 0.02

Half of each trade closes at TP1 instead of a fifth. Mean +0.358R (t = 0.89) vs +0.392R as replayed · winners 53.8% · average win +1.522R · average loss -1.000R · mean with costs × 1.5 +0.321R

Re-weighted 13 trades (13 exact, 0 estimated from how far they went); 0 were already at 0.02 lots or less.

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 11 | +0.431 | 55% |
| london_mid | 2 | +0.180 | 50% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 8 | +0.634 | 63% |
| sell | 5 | +0.005 | 40% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| sniper | 13 | +0.392 | 54% |

Median stop: normal — · sniper $3.93 · all $3.93

## By daily trend at entry

| | Trades | Mean R | Winners |
|---|---|---|---|
| with the daily trend | 7 | +0.889 | 71% |
| daily trend neutral | 3 | -1.000 | 0% |
| against the daily trend | 3 | +0.624 | 67% |

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| 4–6% | 1 | +1.411 | 100% |
| 6–8% | 6 | +0.397 | 50% |
| 8% or more | 6 | +0.217 | 50% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $3–5 | 12 | +0.307 | 50% |
| $5–8 | 1 | +1.411 | 100% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| 0.8–1.2× ATR | 1 | +1.433 | 100% |
| 1.2–1.6× ATR | 6 | -0.582 | 17% |
| 1.6× ATR or more | 6 | +1.192 | 83% |

## How trades ended

- Full stop-outs (−0.85R or worse): 46%
- Scratches (within ±0.15R, mostly breakeven exits): 0%
- Wins of 1R or more: 46% · average win +1.585R · average loss -1.000R
- Losers that first went 1R or more in your favour: 0% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 54% · +1R 54% · +1.5R 15% · +2R 8% · +3R 0%
- Winners closed at +1.585R on average; at their best they were +1.543R up (median +1.379R)
- Losers that never got more than +0.3R in profit: 100%
- Targets (median): TP1 +1.112R, final target +1.607R · final target within 1.5R on 8% of trades · reached on 0%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 1.25–2R | 9 | +0.367 | 56% |
| 2–3R | 1 | +0.260 | 100% |
| 3R or more | 3 | +0.510 | 33% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 6 | -0.371 | 33% |
| 1–3h | 5 | +0.472 | 60% |
| 3–7.5h | 2 | +2.482 | 100% |

## Signal study: do the entries point the right way?

Price move in the trade's direction after entry, in R, before costs and ignoring stops and exits. "Edge" is that move less the same move at the same time on nearby days. t is from daily totals.

| After | Trades | Move | Edge | t (daily) |
|---|---|---|---|---|
| 15 min | 13 | +0.086 | +0.112 | 0.89 |
| 30 min | 13 | +0.127 | +0.185 | 1.38 |
| 60 min | 13 | +0.351 | +0.407 | 1.89 |
| 120 min | 13 | +0.079 | +0.268 | 0.80 |

❌ S1: edge after 60 min (+0.407R) is bigger than the median cost (+0.076R) with t ≥ 2 (1.89). Not shown that the entries point the right way by more than they cost (it needs both), so changing the exits is unlikely to make them pay; change or simplify the entry.

Mean R with t from daily totals instead of single trades (overlapping trades aren't independent): t = 0.91 (the rules use the single-trade t above).

## Entries refused (cycles)

- costs #% of the stop: 1028

Settings: {"market":"gold","symbol":"XAUUSD","cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_ENTRY":"asian_fade"}}
