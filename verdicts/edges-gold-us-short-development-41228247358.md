# Daily edges — gold-us-short (development) · GOLD (XAUUSD)

**FAIL** · 2015-01-01 → 2025-01-01 · real 1-minute prices, XM-style costs

| | |
|---|---|
| Trades | 2440 · winners 47.7% · average hold 5.2 hours |
| Mean a day after costs | -0.018%, t = -1.43 |
| Average win / loss | 0.44% / -0.44% · profit factor 0.92 |
| Total at 1× size | -37.8% (-4.6% a year) · worst drawdown 47.7% |
| Positive months | 38.3% of 120 |
| Costs × 1.5 | mean -0.030% a day, t = -2.45 |
| Random benchmark (1,000 runs) | median -0.024% · rule -0.018% · rule beats 79.0% |

## Rules

- ✅ G1: at least 300 trades
- ❌ G2: mean return a day > 0 after costs, t ≥ 3
- ❌ G3: beats ≥ 95% of same-length windows at random times of the same days
- ❌ G4: positive in ≥ 2/3 of years with 30+ trades
- ❌ G5: still positive with costs × 1.5
- ❌ G6: positive in ≥ 55% of months

## By year

| Year | Trades | Return at 1× | t |
|---|---|---|---|
| 2015 | 252 | 0.6% | 0.11 |
| 2016 | 253 | 1.5% | 0.20 |
| 2017 | 251 | -11.7% | -1.84 |
| 2018 | 252 | -5.8% | -0.84 |
| 2019 | 252 | -8.8% | -1.12 |
| 2020 | 251 | -6.8% | -0.47 |
| 2021 | 252 | -1.4% | -0.09 |
| 2022 | 257 | -11.2% | -1.10 |
| 2023 | 162 | -1.2% | -0.12 |
| 2024 | 258 | -0.3% | 0.02 |

Costs: the replay's XM gold spread at the minute the spread is paid (buys pay it on entry, sells on exit) + $0.10 slippage. No swap: every trade opens and closes inside one XM day.
