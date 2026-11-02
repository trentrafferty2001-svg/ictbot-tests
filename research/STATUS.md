# Status

Last updated 2026-11-02.

## Engineering status

| Component | State |
|---|---|
| Pre-registered config format + validation + git registration check | Built, tested |
| Backtest harness (rule, costs, metrics, 1,000 random controls, buy-and-hold) | Built, tested on synthetic data only |
| Immutable run records + trial count + id/hash lock | Built, tested |
| `costs` (read-only MetaApi snapshot, logged) | Built, tested against a fake MetaApi. **Not yet run on the XM account** |
| IBS demo mode (`ibs on/off/status/tick`), paper + MetaApi-demo execution | Built, tested against a fake MetaApi. **Not yet run live** |
| Forward log (QQQ 5-minute, morning) | Built, tested with fake bars. **Needs `TWELVEDATA_API_KEY`** |
| Fill-gap report + forward verdict F1–F4 | Built, tested |
| Telegram commands `/costs`, `/ibs on|off|status`, `/gap` | Built (separate bot token). **Not wired into the live bot's `server.js`**, which isn't in this repo |

## Profitability status

| Rule | Historical | Forward | Real money |
|---|---|---|---|
| ICT (all 43 variants in `tools/replay/VARIANTS.md`) | Fail / too few trades | — | **Fail**. Not to be optimised further |
| Nasdaq IBS, earlier work (outside this repo) | Failed its confirmation bar (~+0.20%/trade after modelled costs) | — | **Fail** for that test |
| Nasdaq IBS, `configs/ibs_nasdaq_v1.yaml` | **Not run** (config is `draft`) | **Not started** (begins 2026-11-03) | **Insufficient evidence** |

No rule in this repository is shown to be profitable after costs.
