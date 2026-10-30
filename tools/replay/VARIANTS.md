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
| 2026-10-30 | control | silverbullet-control | `{"V1_STRATEGY":"silverbullet","V1_MAX_LOTS":"0.02"}` | 55 | +0.144 | 1.01 | 94.7% | PASS |
| 2026-10-30 | development | silverbullet-development | `{"V1_STRATEGY":"silverbullet","V1_MAX_LOTS":"0.02"}` | 348 | -0.101 | -1.78 | 24.2% | FAIL |
| 2026-10-30 | development | ote-development | `{"V1_STRATEGY":"ote","V1_MAX_LOTS":"0.02"}` | 814 | +0.001 | 0.02 | 91.3% | FAIL |
| 2026-10-30 | control | control-ict5-nas | `{"V1_STRATEGY":"ict2022","V1_ICT_TF":"5m","V1_MAX_LOTS":"0.02"}` | 80 | -0.011 | -0.09 | 72.0% | PASS |
| 2026-10-30 | control | control-ict5-btc | `{"V1_STRATEGY":"ict2022","V1_ICT_TF":"5m","V1_MAX_LOTS":"0.02"}` | 0 | — | — | — | TOO FEW TRADES |
| 2026-10-30 | control | control-ict5-ger | `{"V1_STRATEGY":"ict2022","V1_ICT_TF":"5m","V1_MAX_LOTS":"0.02"}` | 123 | -0.116 | -1.31 | 22.0% | PASS |
| 2026-10-30 | development | ict2022-5m-nas | `{"V1_STRATEGY":"ict2022","V1_ICT_TF":"5m","V1_MAX_LOTS":"0.02"}` | 358 | -0.027 | -0.48 | 58.4% | FAIL |
| 2026-10-30 | development | ict2022-15m-nas | `{"V1_STRATEGY":"ict2022","V1_ICT_TF":"15m","V1_MAX_LOTS":"0.02"}` | 228 | -0.087 | -1.33 | 22.6% | TOO FEW TRADES |
| 2026-10-30 | development | silverbullet-nas | `{"V1_STRATEGY":"silverbullet","V1_MAX_LOTS":"0.02"}` | 789 | -0.012 | -0.29 | 77.5% | FAIL |
| 2026-10-30 | development | ict2022-5m-ger | `{"V1_STRATEGY":"ict2022","V1_ICT_TF":"5m","V1_MAX_LOTS":"0.02"}` | 309 | +0.023 | 0.40 | 81.7% | FAIL |
| 2026-10-30 | development | ote-nas | `{"V1_STRATEGY":"ote","V1_MAX_LOTS":"0.02"}` | 638 | -0.119 | -2.41 | 20.6% | FAIL |
| 2026-10-30 | development | ict2022-15m-ger | `{"V1_STRATEGY":"ict2022","V1_ICT_TF":"15m","V1_MAX_LOTS":"0.02"}` | 210 | +0.066 | 1.02 | 96.2% | TOO FEW TRADES |
| 2026-10-30 | development | ote-ger | `{"V1_STRATEGY":"ote","V1_MAX_LOTS":"0.02"}` | 534 | -0.047 | -0.91 | 79.9% | FAIL |
| 2026-10-30 | development | silverbullet-ger | `{"V1_STRATEGY":"silverbullet","V1_MAX_LOTS":"0.02"}` | 508 | -0.066 | -1.35 | — | FAIL |
| 2026-10-30 | development | ict2022-15m-btc | `{"V1_STRATEGY":"ict2022","V1_ICT_TF":"15m","V1_MAX_LOTS":"0.02"}` | 21 | +0.128 | 0.56 | — | TOO FEW TRADES |
| 2026-10-30 | development | ict2022-5m-btc | `{"V1_STRATEGY":"ict2022","V1_ICT_TF":"5m","V1_MAX_LOTS":"0.02"}` | 21 | +0.314 | 1.25 | — | TOO FEW TRADES |
| 2026-10-30 | development | silverbullet-btc | `{"V1_STRATEGY":"silverbullet","V1_MAX_LOTS":"0.02"}` | 11 | +0.231 | 0.73 | — | TOO FEW TRADES |
| 2026-10-30 | development | ote-btc | `{"V1_STRATEGY":"ote","V1_MAX_LOTS":"0.02"}` | 102 | -0.199 | -2.03 | — | TOO FEW TRADES |
| 2026-10-30 | decade | turtle-55d-ger | `{"V1_STRATEGY":"ea","V1_EA":"turtle-55d","V1_MAX_LOTS":"0.02"}` | 48 | +1.888 | 0.76 | 53.0% | TOO FEW TRADES |
| 2026-10-30 | decade | turtle-55d-btc | `{"V1_STRATEGY":"ea","V1_EA":"turtle-55d","V1_MAX_LOTS":"0.02"}` | 32 | +1.227 | 1.14 | 37.6% | TOO FEW TRADES |
| 2026-10-30 | decade | turtle-55d-gold | `{"V1_STRATEGY":"ea","V1_EA":"turtle-55d","V1_MAX_LOTS":"0.02"}` | 44 | -0.122 | -0.56 | 30.9% | TOO FEW TRADES |
| 2026-10-30 | decade | turtle-55d-nas | `{"V1_STRATEGY":"ea","V1_EA":"turtle-55d","V1_MAX_LOTS":"0.02"}` | 46 | -0.111 | -0.51 | 10.9% | TOO FEW TRADES |
| 2026-10-30 | screen | cost-5pct | `{"COST_MAX_FRAC":"0.05"}` | 269 | -0.062 | -1.07 | 39.0% | TOO FEW TRADES |
| 2026-10-30 | screen | vol-floor | `{"V1_VOL_FLOOR":"0.33"}` | 1123 | -0.067 | -2.07 | 46.3% | SCREEN FAIL |
| 2026-10-30 | screen | v1-signal | `{}` | 1554 | -0.046 | -1.66 | 81.0% | SCREEN FAIL |
| 2026-10-30 | screen | sweep-mss | `{"V1_ENTRY":"sweep_mss"}` | 2374 | -0.061 | -2.73 | 65.1% | SCREEN FAIL |
| 2026-10-30 | screen | asian-bench | `{"V1_ENTRY":"asian_breakout"}` | 122 | -0.345 | -3.62 | 0.1% | TOO FEW TRADES |
