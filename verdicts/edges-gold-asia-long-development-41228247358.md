# Daily edges — gold-asia-long (development) · GOLD (XAUUSD)

**FAIL** · 2015-01-01 → 2025-01-01 · real 1-minute prices, XM-style costs

| | |
|---|---|
| Trades | 2523 · winners 47.9% · average hold 7.7 hours |
| Mean a day after costs | -0.013%, t = -1.74 |
| Average win / loss | 0.27% / -0.27% · profit factor 0.91 |
| Total at 1× size | -29.5% (-3.4% a year) · worst drawdown 35.1% |
| Positive months | 35.8% of 120 |
| Costs × 1.5 | mean -0.026% a day, t = -3.40 |
| Random benchmark (1,000 runs) | median -0.023% · rule -0.013% · rule beats 86.6% |

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
| 2015 | 257 | -4.5% | -0.81 |
| 2016 | 258 | -0.3% | 0.01 |
| 2017 | 257 | -7.4% | -1.87 |
| 2018 | 258 | -13.8% | -3.44 |
| 2019 | 256 | -3.9% | -0.74 |
| 2020 | 257 | -5.6% | -0.67 |
| 2021 | 255 | 6.9% | 1.16 |
| 2022 | 257 | -6.3% | -1.13 |
| 2023 | 211 | -1.1% | -0.18 |
| 2024 | 257 | 3.2% | 0.54 |

Costs: the replay's XM gold spread at the minute the spread is paid (buys pay it on entry, sells on exit) + $0.10 slippage. No swap: every trade opens and closes inside one XM day.
