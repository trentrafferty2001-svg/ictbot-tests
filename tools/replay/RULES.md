# Real-data replay and edge test

Added 24 Oct 2026. This folder answers one question with years of real gold prices instead of months of live trading: **do the bot's entries beat random entries once costs are paid?**

`replay.js` runs the real `bot-engine.js` (the same file Render runs) on a virtual clock over Dukascopy XAUUSD one-minute prices. A fake MetaAPI broker fills stops and targets minute by minute. When one minute touches both, the stop counts first. It keeps XM's hours and daily break (server time GMT+3 while New York is on summer time, GMT+2 otherwise). It runs the MetaAPI server-side stop ladder and charges a spread for every hour of the week. `verdict.js` then compares the bot with about 1,000 sets of random entries that use exactly the same exits, and applies the rules below.

## How to run it from your phone

1. Upload this folder and `.github/workflows/replay.yml` to GitHub (once).
2. GitHub → your repo → **Actions** → **Replay on real gold data** → **Run workflow**.
3. Pick a **period**:
   - **smoke** (about 10 minutes): one month (March 2024). Do this first, to check that the data downloads and the replay runs.
   - **development**: 2015–2024, one job per year, all at the same time (about an hour). This is the main test.
   - **screen**: 2020–2024 only. It costs about half the GitHub minutes of development (each year's job takes 15–55 minutes, and the free plan has 2,000 minutes a month), yet holds 84% of v1's development trades. The development rules apply with D1 at 500 trades. A screen pass is **not** a pass: the variant must then run **rest**.
   - **rest**: 2015–2019, the other half of development. Judge it together with its screen: run period *development* with *reuse_run* = the screen run's ID and *reuse_run_2* = the rest run's ID (about 2 minutes). The full development rules then apply.
   - **control**: random-walk prices instead of real ones. The bot must show **no** edge here; if it does, the test itself is biased.
   - **final**: 2025–Oct 2026. Run it **once**, only after development passes, and never tune anything after looking at it.
4. The result appears on the run's page (Summary). It is also sent to Telegram if you add the repo secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` (Settings → Secrets and variables → Actions).

Optional: add the secret `BOT_URL` (your Render address, e.g. `https://ictgoldbot.onrender.com`). The replay then prices trades with the spreads the live bot has actually measured on your XM account (`/api/v1/spreads`), instead of the built-in estimate.

To test a **variant**, put its settings in the *settings* box, e.g. `TRAIL_ATR_MULT=1.5` or `COST_MAX_FRAC=0.08`, and give it a *label*. Every run (except smoke) is added to `VARIANTS.md` automatically. That file is the count of how many things were tried, and the more rows it has, the stronger a result needs to be.

## The pass rules, written before any run

**Development period (2015–2024): all six must hold.**

| | Rule | Why |
|---|---|---|
| D1 | At least 1,000 trades | Fewer can't separate a +0.1R edge from luck |
| D2 | Mean result per trade > 0R after costs, with t ≥ 3 | t ≥ 3, not 2, because several variants will be tried |
| D3 | The bot's entries beat at least 95% of the random-entry runs | Same exits, same times of day (±5 days), random direction: what's left is the entries' own skill |
| D4 | Positive in at least two-thirds of the years that have 30+ trades | One lucky year mustn't carry the result |
| D5 | Still positive with costs raised by 50% | Real spreads and slippage are often worse than modelled |
| D6 | The top third of scores does better than the bottom third | If not, the 0–12 score is decoration |

**Final period (2025–2026), run once:** at least 300 trades, mean > 0R with t ≥ 2, and beats 95% of random entries.

**Control (random prices):** t < 2 and the random-entry percentile between 5% and 95%.

**If development fails**, simplify or change the strategy; don't fine-tune it until it passes. That would be fitting noise, and the variant log would show it. Variants the research suggested testing one at a time: deeper liquidity sweeps, a one-day trend filter, stops sized from the 1-hour chart, and session bias.

**Written 24 Oct 2026, before running them:**
- The one-day trend filter is `V1_DAILY_TREND=1`. It uses the bot's own daily trend reading (`detectTrend` on daily candles), and a neutral day blocks.
- Deeper liquidity sweeps is `V1_SWEEP_ATR=0.25`: a wick at least 0.25× the 15-minute ATR past an earlier M15 swing, in the last 5 candles. Each is tested at that one setting only.
- Both run as a screen first. A screen pass then runs rest, and a development pass runs final.
- Session bias is not run: the v1 tables by session already show the killzones mixed (London −0.11R, New York open +0.07R), and choosing sessions from those tables would be fitting noise.
- 1-hour stops were covered by the 1.5× ATR stop test.

**Written 24 Oct 2026, after both screens above failed and before running this one:**
- `V1_SETUP_TF=1h` moves the bot's own analysis up one timeframe:
  - The setup (fair value gap, order block, structure shift, sweep), the ATR and the structure targets come from the 1-hour chart.
  - The quality gate's bias comes from the daily chart, and the top-down alignment reads daily / 4-hour / 1-hour.
  - The 8-hour time limit scales to 32 hours; the daily-break flatten still applies.
  - The fixed dollar ceilings on stops and targets double.
  - At most one new trade is opened per 1-hour candle, because the 1-hour setup stays the same for the whole hour.
- The reason for testing it: costs are a median 8% of a 15-minute stop, more than the entries' edge over random entries, and a 1-hour ATR is about twice as big.
- It runs as a screen first, like the others, at this one definition.

**Written 30 Oct 2026, after the setup-1h screen failed and before running any of these.** They come from two research reports (papers and articles; books on systematic trading) that agreed costs are the main problem and that the entries may have no edge at all:
- **Signal study (rule S1), a diagnostic, not a variant.** Every replay now records how far price went the trade's way 15, 30, 60 and 120 minutes after entry, before costs and ignoring the stop and exits, less the same move at the same clock time on the 5 trading days either side (drift). The verdict shows it under "Signal study". **S1 holds when the 60-minute edge is bigger than the median cost (both in R) with t ≥ 2 from daily totals.** It isn't one of the pass rules: it says where a failure comes from. If S1 fails on v1's development run, no exit change can rescue the entries, so stop tuning exits. It costs nothing new: re-run development (or screen) for v1 and read the section.
- **The cost cap at 5% of the stop is `COST_MAX_FRAC=0.05`** (was 10%). No code change. It may leave fewer than 1,000 trades; then the run reads TOO FEW TRADES and the idea fails as tested.
- **Skipping quiet markets is `V1_VOL_FLOOR=0.33`.** No new trades while the last completed day's ATR(14) ranks in the bottom third of the up to 60 days before it. With fewer than 30 earlier days (the first weeks of each replay year, which loads 75 days of history) it doesn't block. Tested at 0.33 only, and not together with the cost cap.
- **`V1_ENTRY=sweep_mss` is the ICT core alone:** a confirmed structure shift (CHoCH or confirmed BOS) on the 15-minute chart plus a liquidity sweep the same way in the last 5 candles (a wick past an earlier swing that closed back, any depth). No fair value gap, order block, top-down bias, score, quality gate or conflict-flag skip; every exit, cost check, size, hour and news gate as in v1.
- **`V1_ENTRY=asian_breakout` is a plain benchmark, not a candidate to trade:** the Asian range is the high and low of the 15-minute candles from 19:00 to 03:00 New York time; from 03:00 to 06:00 New York, the first completed candle to close outside it trades that way, at most one trade per candle; same exits and gates as v1. If v1's entries don't beat this, the ICT entries add nothing over a naive rule.
- For both `V1_ENTRY` rules, D6 (higher scores do better) is meaningless, because the score no longer picks trades; judge them on D1–D5 and say so.
- Each runs as a screen first. A screen pass runs rest, and a development pass runs final, as before.

## What the replay does not model

- News: only US payrolls (first Friday, 08:30 New York) are known to the replay, so it may take a few trades the live bot would skip around CPI or FOMC.
- Spreads: the built-in table is an estimate for an XM Ultra Low account (about $0.20 in London/New York hours, wider in Asia and around the daily break). Use `spread_mult 2.2` to see a Standard account, or `BOT_URL` for measured spreads.
- Slippage: none by default (the bot's cost check still budgets $0.10). Add `--slippage` to `replay.js` to test it.
- Overnight swap: none, because v1 is flat before every daily break.
- Volume: Dukascopy volume is not XM tick volume. The bot only compares volume with its own recent average.

## Running it on a computer

```
npm install
python3 tools/replay/fetch_data.py --from 2023-10-18 --to 2025-01-03 --name 2024
node tools/replay/replay.js --data tools/replay/data/xauusd-2024.csv.gz --from 2024-01-01 --to 2025-01-01 --out results/2024.json
node tools/replay/verdict.js --dir results --period development --label v1
```

A year takes about 40 minutes on one core (the live bot's 3-minute cycle, about 120,000 cycles a year). `--cycle 15` is five times faster but less faithful.
