# Replay verdict — silverbullet-control (control)

**PASS** · 2019-01-01 → 2024-01-01 · synthetic control data

| | |
|---|---|
| Trades | 55 (28 a year) |
| Mean R after costs | +0.144 (95% range -0.136 to +0.424), t = 1.01 |
| Winners | 56.4% · profit factor 1.34 |
| Cost | median 9.0% of the stop · mean R with costs × 1.5: +0.100 |
| Random entries (same exits, 1000 runs) | mean -0.066 · bot +0.171 · bot beats 94.7% |
| Exit-model check | correlation with the replayed trades 0.99 (should be > 0.8) |

## Rules

- ✅ C1: no "edge" on random data (t < 2)
- ✅ C2: random-entry percentile not extreme (5–95)

## By year

| Year | Trades | Mean R | t |
|---|---|---|---|
| 2019 | 30 | -0.038 | -0.21 |
| 2023 | 25 | +0.363 | 1.60 |

## By score

| Score | Trades | Mean R |
|---|---|---|
| 0 | 55 | +0.144 |

## By session

| | Trades | Mean R | Winners |
|---|---|---|---|
| london | 22 | +0.083 | 55% |
| ny | 33 | +0.185 | 58% |

## By direction

| | Trades | Mean R | Winners |
|---|---|---|---|
| buy | 26 | +0.020 | 54% |
| sell | 29 | +0.255 | 59% |

## By trade type

| | Trades | Mean R | Winners |
|---|---|---|---|
| normal | 55 | +0.144 | 56% |

Median stop: normal $3.35 · sniper — · all $3.35

## By trading cost

| | Trades | Mean R | Winners |
|---|---|---|---|
| 4–6% | 1 | +0.571 | 100% |
| 6–8% | 9 | +0.265 | 56% |
| 8% or more | 45 | +0.110 | 56% |

## By stop distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| $3–5 | 54 | +0.136 | 56% |
| $5–8 | 1 | +0.571 | 100% |

## By stop size in 15-minute ATRs

| | Trades | Mean R | Winners |
|---|---|---|---|
| stop under 0.8× ATR | 1 | -1.000 | 0% |
| 0.8–1.2× ATR | 23 | +0.091 | 57% |
| 1.2–1.6× ATR | 22 | +0.087 | 50% |
| 1.6× ATR or more | 9 | +0.547 | 78% |

## How trades ended

- Full stop-outs (−0.85R or worse): 42%
- Scratches (within ±0.15R, mostly breakeven exits): 0%
- Wins of 1R or more: 22% · average win +1.005R · average loss -0.968R
- Losers that first went 1R or more in your favour: 0% of losers

## How far trades went

- Share of trades that were at some point this far in profit: +0.5R 64% · +1R 47% · +1.5R 33% · +2R 22% · +3R 5%
- Winners closed at +1.005R on average; at their best they were +1.870R up (median +1.761R)
- Losers that never got more than +0.3R in profit: 63%
- Targets (median): TP1 +1.000R, final target +3.715R · final target within 1.5R on 0% of trades · reached on 0%

## By final target distance

| | Trades | Mean R | Winners |
|---|---|---|---|
| 2–3R | 18 | +0.163 | 56% |
| 3R or more | 37 | +0.135 | 57% |

## By holding time

| | Trades | Mean R | Winners |
|---|---|---|---|
| held under 1h | 31 | -0.338 | 35% |
| 1–3h | 18 | +0.815 | 89% |
| 3–7.5h | 6 | +0.620 | 67% |

## Entries refused (cycles)

- costs #% of the stop: 940
- price already went through the fair value gap: 51
- Silver Bullet setup missed: 46
- the New York morning high is only #R away with the: 10
- the London low is only #R away with the spread: 6
- the Asian high is only #R away with the spread: 6

Settings: {"cycleMin":3,"spreadMult":1,"slippage":0,"balance":90000,"currency":"ZAR","rate":18,"spreadTable":false,"env":{"V1_STRATEGY":"silverbullet","V1_MAX_LOTS":"0.02"}}
