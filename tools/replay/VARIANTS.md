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
| 2026-10-24 | development | trend-4h | `{"V1_STRATEGY":"trend"}` | 437 | -0.019 | — | — | FAIL (T2, T4) — the summary job didn't start (GitHub minutes used up); figures from the ten yearly results |
| 2026-10-30 | control | control-ict5 (local) | `{"V1_STRATEGY":"ict2022","V1_MAX_LOTS":"0.02"}` | 131 | -0.079 | -0.86 | 42.0% | PASS |
| 2026-10-30 | control | control-ict15 (local) | `{"V1_STRATEGY":"ict2022","V1_ICT_TF":"15m","V1_MAX_LOTS":"0.02"}` | 96 | +0.038 | 0.36 | 76.7% | PASS |
| 2026-10-30 | control | ea-trend-4h parity (local) | `{"V1_STRATEGY":"ea","V1_EA":"trend-4h"}` | 43 | +0.127 | 0.61 | 69.0% | PASS |
| 2026-10-30 | development | ict2022-5m | `{"V1_STRATEGY":"ict2022","V1_ICT_TF":"5m","V1_MAX_LOTS":"0.02"}` | 440 | +0.068 | 1.43 | 98.8% | FAIL |
| 2026-10-30 | development | ict2022-15m | `{"V1_STRATEGY":"ict2022","V1_ICT_TF":"15m","V1_MAX_LOTS":"0.02"}` | 389 | -0.033 | -0.69 | 60.9% | FAIL |
| 2026-10-30 | control | ote-control | `{"V1_STRATEGY":"ote","V1_MAX_LOTS":"0.02"}` | 298 | -0.055 | -0.74 | 38.9% | PASS |
