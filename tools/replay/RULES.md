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

Optional: add the secret `BOT_URL` (your bot's Render address). The replay then prices trades with the spreads the live bot has actually measured on your XM account (`/api/v1/spreads`), instead of the built-in estimate.

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

## Trend mode (`V1_STRATEGY=trend`): rules written 24 Oct 2026, before its first run

**What it is.** A classic breakout trend-follower that replaces the ICT score. The rules were chosen in advance and are not tuned:
- **Trend:** the last completed 4-hour close is above (buys) or below (sells) the average of the last 200 completed 4-hour closes.
- **Entry:** that close breaks the highest high (buys) or lowest low (sells) of the 20 completed 4-hour candles before it.
- **Stop:** 2× the 20-candle 4-hour ATR, with no target.
- **Trailing exit:** the stop trails at the 10-candle 4-hour low (buys) or high (sells).
- **Limits:** one trade per breakout candle, and one trend trade open at a time.
- **Holding:** trades are held overnight and over weekends. v1's sizing, cost check and entry gate still apply.

**Swap.** Trend trades pay XM's overnight swap. The replay charges it at each rollover:
- 0.025% of the price a night for buys and 0.008% for sells, triple on Wednesday nights. Use `--swap-long` / `--swap-short` to change this.
- These are estimates. In a September 2026 sample of 32 broker accounts, every one charged gold buys, at $58–96 a lot a night. 0.025% is about $100 a lot at $4,000, the top of that range.
- They're charged for every year, although swaps were smaller when US rates were near zero, so the test is on the hard side.
- XM's actual rates are in MT5 (Market Watch → Specification), and the bot shows them in each trend trade's message.

**Development (2015–2024): all five must hold.**

| | Rule | Why |
|---|---|---|
| T1 | At least 300 trades (150 for a screen) | A 4-hour system trades far less than the 15-minute bot |
| T2 | Mean R > 0 after costs and swaps, with t ≥ 2.5 | One new idea, but trend payoffs are lumpy |
| T3 | Beats ≥ 95% of random-entry runs with the same exits and swaps | The breakouts must add something over random timing and direction |
| T4 | Positive in at least 60% of the years that have 15+ trades | Trend-following has flat years; most years must still pay |
| T5 | Still positive with costs and swaps both raised by 50% | Real swaps and spreads may be worse than modelled |

Trend tests run the bot every 15 minutes instead of 3, which saves GitHub minutes. For 4-hour signals that delays an entry by at most 15 minutes, and stops still fill minute by minute. There's no score rule, because trend mode has no score. The final period (2025–Oct 2026) runs once, and only after development passes. It needs at least 80 trades, a mean above 0R with t ≥ 1.5, and to beat 95% of random entries.

## ICT 2022 model (`V1_STRATEGY=ict2022`): rules written 30 Oct 2026, before its first run

**What it is.** The setup ICT teaches in his free 2022 Mentorship on YouTube (episodes 2 and 3, read from transcripts and summaries): stops get raided in a killzone, price shifts structure with a strong move that leaves a fair value gap, and the entry is a pullback into that gap. It replaces the ICT score, which isn't used. Where ICT leaves a choice to the trader, the choice made here is marked *(choice)*.

**Times (New York clock, daylight saving followed).**
- London killzone 02:00–05:00 and New York killzone 07:00–10:00.
- The raid must happen inside a killzone. The shift (step 2) must complete within an hour of the killzone's end.

**Liquidity: the stops that get raided.**
- The previous trading day's high and low (XM's day, which ends at 17:00 New York).
- The Asian range high and low (20:00–00:00 New York).
- In the New York killzone, also the London killzone's high and low.
- A level only counts while untouched: once price has traded beyond it, it's spent.
- *(choice)* Equal highs and lows and smaller intraday swings aren't used, so the pools are the ones ICT names most and every one is unambiguous.

**The setup, on completed candles.**
1. **Raid:** a candle in the killzone trades above an untouched high (for a sell) or below an untouched low (for a buy).
2. **Shift with displacement:**
   - Within 12 candles of the raid's extreme, a candle closes beyond the last short-term swing before that extreme. For a sell, that's the last candle whose low is lower than the candles on both sides of it; for a buy, the mirror. *(choice: a close; ICT says trading through the swing is enough.)*
   - The move from the extreme must leave a fair value gap: three candles where the first one's low is above the third one's high (mirror for buys).
   - If price makes a new extreme first, the count restarts from the new extreme.
3. **Entry:**
   - A limit order at the near edge of the latest untouched fair value gap in that move: the first price a pullback reaches. *(choice: the near edge, not the midpoint.)*
   - If price is already inside the gap when the bot sees the setup, it enters at market. If price has already gone through the gap, or already pulled back to the entry since the setup completed, there's no trade.
4. **Stop:** beyond the raid's extreme by the spread at the time.
5. **Targets:** one small lot at 1R (v1's TP1 lot, then breakeven and the trailing ladder), the rest at 2R. *(choice: ICT aims at the next liquidity pool and calls 2:1 the minimum; a fixed 2R keeps the test from being tuned.)*
6. **Order life:** cancelled if not filled within 12 candles, if price reaches the 2R target first, or 15 minutes before XM's daily break.
7. **Limits:** one setup per killzone (the first one), and one ICT trade or order at a time. A setup refused by the size or cost check uses up its killzone.

**What stays from v1.** Sizing, the cost check (spread + slippage at most 10% of the stop), the entry gate (news, daily stop, trading hours, data checks) and the exits (8-hour limit, flat before XM's daily break).

**Two runs, both reported.**
- 5-minute candles (`V1_ICT_TF=5m`): ICT's usual setup chart.
- 15-minute candles (`V1_ICT_TF=15m`): stops are wider there, so the spread costs a smaller share of each one.
- There are no other settings, and nothing is tuned after a run.
- Both use the live bot's lot cap (`V1_MAX_LOTS=0.02`, so the TP1 lot is half of most trades). Everything else is v1's default.

**Development (2015–2024): all five must hold, for either run.**

| | Rule | Why |
|---|---|---|
| I1 | At least 300 trades (150 for a screen) | Killzone setups are rarer than the 15-minute bot's |
| I2 | Mean R > 0 after costs, with t ≥ 3 | Same bar as the ICT bot: many variants have now been tried |
| I3 | Beats ≥ 95% of random-entry runs with the same exits | The setups must add something over random timing and direction |
| I4 | Positive in at least two-thirds of the years that have 30+ trades | One lucky year mustn't carry it |
| I5 | Still positive with costs raised by 50% | Real spreads and slippage are often worse than modelled |

**Control (random prices)** must show no edge, as for v1. **Final (2025–Oct 2026)** runs once, only after development passes: at least 80 trades, mean > 0 with t ≥ 2, and beats 95% of random entries.

**Where the price data comes from.** From 1 Nov 2026 the replay can also run on a computer, on the same HistData files GitHub's runners download (the `data` period of the workflow saves them to the `replay-data` branch). Results are judged by the same `verdict.js`, whichever machine runs them.

## EA strategies (`V1_STRATEGY=ea`, `V1_EA=<id>`): rules written 30 Oct 2026, before any EA run

**What it is.** Strategies written as formulas, the way MetaTrader Expert Advisors work (`src/ea/`). Each strategy is one file in `src/ea/strategies/` that names its indicators (MT5's own formulas: moving averages, RSI, ATR, MACD, Bollinger Bands, Stochastic, ADX, CCI, highest/lowest...) and writes its entry rule, stop, target, trailing stop, exit rule and limits as equations on finished candles. The same file is traded by the bot, tested here, and exported as an `.mq5` Expert Advisor (`node tools/ea/export.js <id>`). The ICT score isn't used. v1's sizing, cost check and entry gate apply; the exits are the strategy's own, plus the close before XM's daily break unless the file says the strategy holds overnight.

**How a strategy gets tested.**
- Its file is written and committed **before its first run**, from the source it names (a video, a book, a paper). Where the source leaves a choice open, the file's notes say which choice was made, before any run.
- It runs once on development (2015–2024) exactly as written. Nothing is tuned after a run: a changed file is a new strategy and a new row in the variant log.
- Run settings: `V1_STRATEGY=ea;V1_EA=<id>;V1_MAX_LOTS=0.02`. Cycle: 3 minutes for 5- and 15-minute strategies, 15 minutes for 1-hour and slower ones (the bot acts at most one cycle after a candle finishes).
- The random-entry test keeps the strategy's own exits: at a random time ±5 days from each trade (inside the bot's entry hours) and in a random direction, the stop and target come from the same formulas, then the same trail, exit rule, time limit, breakeven, daily-break close and swaps.

**Development (2015–2024): all five must hold.**

| | Rule | Why |
|---|---|---|
| E1 | At least 300 trades (150 for a screen) | Fewer can't separate a real edge from luck |
| E2 | Mean R > 0 after costs and swaps, with t ≥ 3 | Many strategies will be tried, so the bar stays high |
| E3 | Beats ≥ 95% of random-entry runs with the same exits | The entries must add something over random timing and direction |
| E4 | Positive in at least 60% of the years with 15+ trades | Most years must pay, not one lucky stretch |
| E5 | Still positive with costs and swaps raised by 50% | Real spreads, slippage and swaps may be worse than modelled |

**Final (2025–Oct 2026)** runs once, only after development passes: at least 80 trades, mean > 0 with t ≥ 2, and beats 95% of random entries. **Control (random prices)** must show no edge, as for the others.

**`trend-4h`** is trend mode rewritten as formulas, so the engine can be checked against a strategy that was already coded by hand. Its run is a check that it reproduces trend mode's result (437 trades, −0.019R), not a new try.
