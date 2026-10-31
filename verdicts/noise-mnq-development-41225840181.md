# Noise-area momentum — noise-mnq (development) · MNQ (micro futures)

**FAIL** · 2015-01-01 → 2025-01-01 · real NSXUSD 1-minute prices

| | |
|---|---|
| Sessions | 2571 (traded on 1540, 59.9%) |
| Trades | 2570 · winners 37.1% |
| Points per trade | gross 4.46 · net 2.96 (cost 1.5 a round trip) |
| Mean daily return | 0.038%, t = 1.73 |
| Sharpe (annual) | 0.54 |
| Total / a year | 127.1% / 8.4% at up to 4× leverage, 2% daily vol target |
| Max drawdown | 42.2% |
| Positive months | 57.5% of 120 |
| Costs × 1.5 | mean daily 0.012%, t = 0.54 |
| Random direction (1000 runs) | median -0.051% a trade · rule 0.038% · rule beats 100.0% |

## Rules

- ✅ N1: at least 300 trades
- ❌ N2: mean daily return > 0 after costs, t ≥ 3
- ✅ N3: beats ≥ 95% of random-direction runs (same entry and exit times)
- ❌ N4: positive in ≥ 2/3 of years with 30+ trades
- ✅ N5: still positive with costs × 1.5
- ✅ N6: positive in ≥ 55% of months

## By year

| Year | Trades | Return | t |
|---|---|---|---|
| 2015 | 249 | -4.8% | -0.18 |
| 2016 | 290 | -25.1% | -1.27 |
| 2017 | 254 | -7.7% | -0.37 |
| 2018 | 245 | 66.8% | 2.54 |
| 2019 | 263 | -15.2% | -1.07 |
| 2020 | 251 | 17.1% | 0.98 |
| 2021 | 245 | 7.1% | 0.47 |
| 2022 | 272 | 30.1% | 1.69 |
| 2023 | 240 | 10.1% | 0.73 |
| 2024 | 261 | 35.8% | 1.74 |

Not modelled: overnight swap (none: flat every night), news, slippage beyond the fixed allowance, 
XM minimum lot size. HistData index files have no volume, so VWAP is a time-weighted average.
