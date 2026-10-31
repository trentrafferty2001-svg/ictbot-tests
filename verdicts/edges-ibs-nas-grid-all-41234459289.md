# Daily edges — Nasdaq IBS robustness grid (all) · US100Cash#

**BROAD** · 2010-01-01 → 2026-11-01 · real 1-minute prices, XM-style costs as tested

Rule written before the run: BROAD if at least 8 of the 10 cells make money after costs and the median cell makes at least half the tested cell's mean. 10 of 10 positive; median cell 0.169% a trade; tested cell (0.20, hold) 0.200%.

| IBS below | Exit | Trades | Winners | Mean a trade | t |
|---|---|---|---|---|---|
| 0.10 | first close with IBS above the threshold | 311 | 57.6% | 0.213% | 2.28 |
| 0.15 | first close with IBS above the threshold | 446 | 54.3% | 0.143% | 1.85 |
| 0.20 | first close with IBS above the threshold | 558 | 57.9% | 0.200% | 2.81 |
| 0.25 | first close with IBS above the threshold | 670 | 58.8% | 0.203% | 3.17 |
| 0.30 | first close with IBS above the threshold | 748 | 58.7% | 0.180% | 3.04 |
| 0.10 | next close | 347 | 54.5% | 0.187% | 2.25 |
| 0.15 | next close | 520 | 51.3% | 0.117% | 1.76 |
| 0.20 | next close | 676 | 54.0% | 0.159% | 2.68 |
| 0.25 | next close | 840 | 53.8% | 0.155% | 2.98 |
| 0.30 | next close | 983 | 53.9% | 0.129% | 2.75 |
