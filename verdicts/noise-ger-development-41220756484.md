# Noise-area momentum — noise-ger (development) · GER40Cash#

**FAIL** · 2015-01-01 → 2025-01-01 · real GRXEUR 1-minute prices

| | |
|---|---|
| Sessions | 2553 (traded on 1695, 66.4%) |
| Trades | 3342 · winners 30.0% |
| Points per trade | gross 0.97 · net -1.33 (cost 2.3 a round trip) |
| Mean daily return | -0.072%, t = -2.92 |
| Sharpe (annual) | -0.92 |
| Total / a year | -86.9% / -18.2% at up to 4× leverage, 2% daily vol target |
| Max drawdown | 91.6% |
| Positive months | 43.3% of 120 |
| Costs × 1.5 | mean daily -0.130%, t = -5.18 |
| Random direction (1000 runs) | median -0.089% a trade · rule -0.055% · rule beats 97.2% |

## Rules

- ✅ N1: at least 300 trades
- ❌ N2: mean daily return > 0 after costs, t ≥ 3
- ✅ N3: beats ≥ 95% of random-direction runs (same entry and exit times)
- ❌ N4: positive in ≥ 2/3 of years with 30+ trades
- ❌ N5: still positive with costs × 1.5
- ❌ N6: positive in ≥ 55% of months

## By year

| Year | Trades | Return | t |
|---|---|---|---|
| 2015 | 345 | 25.6% | 1.18 |
| 2016 | 344 | -16.4% | -0.87 |
| 2017 | 276 | -13.6% | -0.80 |
| 2018 | 331 | 12.6% | 0.70 |
| 2019 | 332 | -13.6% | -0.61 |
| 2020 | 334 | -25.8% | -1.32 |
| 2021 | 349 | -54.0% | -3.46 |
| 2022 | 317 | -17.4% | -0.80 |
| 2023 | 343 | -52.5% | -3.55 |
| 2024 | 371 | 10.5% | 0.68 |

Not modelled: overnight swap (none: flat every night), news, slippage beyond the fixed allowance, 
XM minimum lot size. HistData index files have no volume, so VWAP is a time-weighted average.
