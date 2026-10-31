# Daily edges — ibs-spx (development) · US500Cash#

**FAIL** · 2015-01-01 → 2025-01-01 · real 1-minute prices, XM-style costs

| | |
|---|---|
| Trades | 350 · winners 56.9% · average hold 1.2 sessions |
| Mean a trade after costs | 0.091%, t = 1.21 |
| Average win / loss | 0.89% / -0.97% · profit factor 1.22 |
| Total at 1× size | 32.9% (2.9% a year) · worst drawdown 19.2% |
| Positive months | 54.4% of 114 |
| Costs × 1.5 | mean 0.055% a trade, t = 0.73 |
| Random benchmark (1,000 runs) | median -0.022% · rule 0.091% · rule beats 95.2% |

## Rules

- ✅ M1: at least 100 trades
- ❌ M2: mean return a trade > 0 after costs and swaps, t ≥ 2.5
- ✅ M3: beats ≥ 95% of random long entries (same year, same holding time, same costs)
- ❌ M4: positive in ≥ 60% of years with 5+ trades
- ✅ M5: still positive with costs and swaps × 1.5

## By year

| Year | Trades | Return at 1× | t |
|---|---|---|---|
| 2015 | 38 | -4.1% | -0.42 |
| 2016 | 35 | 8.1% | 1.65 |
| 2017 | 21 | 2.8% | 1.49 |
| 2018 | 40 | -4.7% | -0.72 |
| 2019 | 27 | -0.2% | -0.02 |
| 2020 | 44 | 30.9% | 1.90 |
| 2021 | 36 | -4.6% | -0.71 |
| 2022 | 49 | -2.7% | -0.16 |
| 2023 | 26 | 7.4% | 0.93 |
| 2024 | 33 | 0.8% | 0.17 |
| 2025 | 1 | -0.3% | 0.00 |

Costs: spread at the decision minute (US500Cash# 0.6 + 0.2 slippage points a round trip) and 0.025% of price a night held (long swap). Prices are bid; buys pay the spread. (Footer corrected after the run: the run used these S&P costs, but the old footer text named Nasdaq's.)
