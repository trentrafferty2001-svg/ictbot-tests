# Variant log

Every replay run, in order. The number of rows is the number of tries — the more rows, the stronger a result has to be.

| Date | Period | Label | Settings | Trades | Mean R | t | Beats random | Verdict |
|---|---|---|---|---|---|---|---|---|
| 2026-10-24 | development | v1 | `{}` | 1870 | -0.016 | -0.62 | 99.8% | FAIL |
| 2026-10-24 | development | v1-tzfix | `{}` | 1855 | -0.043 | -1.73 | 87.4% | FAIL |
| 2026-10-24 | development | trail-2atr | `{"TRAIL_ATR_MULT":"2"}` | 1852 | -0.046 | -1.82 | 89.5% | FAIL |
| 2026-10-24 | development | min-stop-1.5atr | `{"V1_MIN_STOP_ATR":"1.5"}` | 3310 | -0.076 | -4.54 | 24.6% | FAIL |
| 2026-10-24 | screen | daily-trend | `{"V1_DAILY_TREND":"1"}` | 700 | -0.038 | -0.93 | 79.2% | SCREEN FAIL |
| 2026-10-24 | screen | sweep-0.25atr | `{"V1_SWEEP_ATR":"0.25"}` | 573 | -0.108 | -2.34 | 32.3% | SCREEN FAIL |
| 2026-10-24 | screen | setup-1h | `{"V1_SETUP_TF":"1h"}` | 1328 | -0.056 | -1.84 | 50.4% | SCREEN FAIL |
| 2026-10-30 | screen | cost-cap-5pct | `{"COST_MAX_FRAC":"0.05"}` | 269 | -0.062 | -1.07 | 39.0% | TOO FEW TRADES |
| 2026-10-30 | screen | v1-signal-study | `{}` | 1554 | -0.046 | -1.66 | 81.0% | SCREEN FAIL |
| 2026-10-30 | screen | vol-floor-0.33 | `{"V1_VOL_FLOOR":"0.33"}` | 1123 | -0.067 | -2.07 | 46.3% | SCREEN FAIL |
| 2026-10-30 | screen | sweep-mss | `{"V1_ENTRY":"sweep_mss"}` | 2373 | -0.062 | -2.73 | 63.4% | SCREEN FAIL |
