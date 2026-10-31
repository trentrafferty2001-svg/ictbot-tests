# Daily edges — ibs-ger (development) · GER40Cash#

**FAIL** · 2015-01-01 → 2025-01-01 · real 1-minute prices, XM-style costs

| | |
|---|---|
| Trades | 329 · winners 50.8% · average hold 1.2 sessions |
| Mean a trade after costs | -0.196%, t = -2.30 |
| Average win / loss | 0.82% / -1.24% · profit factor 0.68 |
| Total at 1× size | -49.7% (-6.6% a year) · worst drawdown 52.8% |
| Positive months | 48.7% of 117 |
| Costs × 1.5 | mean -0.237% a trade, t = -2.77 |
| Random benchmark (1,000 runs) | median -0.024% · rule -0.196% · rule beats 11.3% |

## Rules

- ✅ M1: at least 100 trades
- ❌ M2: mean return a trade > 0 after costs and swaps, t ≥ 2.5
- ❌ M3: beats ≥ 95% of random long entries (same year, same holding time, same costs)
- ❌ M4: positive in ≥ 60% of years with 5+ trades
- ❌ M5: still positive with costs and swaps × 1.5

## By year

| Year | Trades | Return at 1× | t |
|---|---|---|---|
| 2015 | 37 | -6.3% | -0.42 |
| 2016 | 39 | -8.2% | -0.68 |
| 2017 | 21 | -2.6% | -0.63 |
| 2018 | 32 | -4.3% | -0.60 |
| 2019 | 30 | -1.5% | -0.30 |
| 2020 | 37 | -17.0% | -1.41 |
| 2021 | 30 | -0.7% | -0.10 |
| 2022 | 42 | -18.3% | -1.61 |
| 2023 | 25 | -1.9% | -0.32 |
| 2024 | 36 | -3.6% | -0.56 |

Costs: spread at the decision minute (Nasdaq 1.5, DAX 1.8 points) + 0.5 points slippage a round trip, and 0.025% of price a night held (long swap). Prices are bid; buys pay the spread.
