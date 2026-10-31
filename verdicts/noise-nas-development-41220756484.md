# Noise-area momentum — noise-nas (development) · US100Cash#

**FAIL** · 2015-01-01 → 2025-01-01 · real NSXUSD 1-minute prices

| | |
|---|---|
| Sessions | 2571 (traded on 1540, 59.9%) |
| Trades | 2570 · winners 36.1% |
| Points per trade | gross 4.46 · net 2.46 (cost 2 a round trip) |
| Mean daily return | 0.021%, t = 0.93 |
| Sharpe (annual) | 0.29 |
| Total / a year | 44.9% / 3.7% at up to 4× leverage, 2% daily vol target |
| Max drawdown | 53.4% |
| Positive months | 57.5% of 120 |
| Costs × 1.5 | mean daily -0.014%, t = -0.63 |
| Random direction (1000 runs) | median -0.069% a trade · rule 0.021% · rule beats 100.0% |

## Rules

- ✅ N1: at least 300 trades
- ❌ N2: mean daily return > 0 after costs, t ≥ 3
- ✅ N3: beats ≥ 95% of random-direction runs (same entry and exit times)
- ❌ N4: positive in ≥ 2/3 of years with 30+ trades
- ❌ N5: still positive with costs × 1.5
- ✅ N6: positive in ≥ 55% of months

## By year

| Year | Trades | Return | t |
|---|---|---|---|
| 2015 | 249 | -11.9% | -0.61 |
| 2016 | 290 | -32.2% | -1.72 |
| 2017 | 254 | -14.8% | -0.81 |
| 2018 | 245 | 60.0% | 2.35 |
| 2019 | 263 | -19.5% | -1.42 |
| 2020 | 251 | 14.6% | 0.85 |
| 2021 | 245 | 4.7% | 0.34 |
| 2022 | 272 | 28.3% | 1.60 |
| 2023 | 240 | 7.7% | 0.59 |
| 2024 | 261 | 33.2% | 1.64 |

Not modelled: overnight swap (none: flat every night), news, slippage beyond the fixed allowance, 
XM minimum lot size. HistData index files have no volume, so VWAP is a time-weighted average.
