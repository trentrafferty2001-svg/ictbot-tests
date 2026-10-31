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

**Written 30 Oct 2026, after the setup-1h screen failed and before running any of these.** They come from two research reports (papers and articles; books on systematic trading) that agreed costs are the main problem and that the entries may have no edge at all:
- **Signal study (rule S1), a diagnostic, not a variant.** Every replay now records how far price went the trade's way 15, 30, 60 and 120 minutes after entry, before costs and ignoring the stop and exits, less the same move at the same clock time on the 5 trading days either side (drift). The verdict shows it under "Signal study". **S1 holds when the 60-minute edge is bigger than the median cost (both in R) with t ≥ 2 from daily totals.** It isn't one of the pass rules: it says where a failure comes from. If S1 fails on v1's development run, no exit change can rescue the entries, so stop tuning exits. It costs nothing new: re-run development (or screen) for v1 and read the section.
- **The cost cap at 5% of the stop is `COST_MAX_FRAC=0.05`** (was 10%). No code change. It may leave fewer than 1,000 trades; then the run reads TOO FEW TRADES and the idea fails as tested.
- **Skipping quiet markets is `V1_VOL_FLOOR=0.33`.** No new trades while the last completed day's ATR(14) ranks in the bottom third of the up to 60 days before it. With fewer than 30 earlier days (the first weeks of each replay year, which loads 75 days of history) it doesn't block. Tested at 0.33 only, and not together with the cost cap.
- **`V1_ENTRY=sweep_mss` is the ICT core alone:** a confirmed structure shift (CHoCH or confirmed BOS) on the 15-minute chart plus a liquidity sweep the same way in the last 5 candles (a wick past an earlier swing that closed back, any depth). No fair value gap, order block, top-down bias, score, quality gate or conflict-flag skip; every exit, cost check, size, hour and news gate as in v1.
- **`V1_ENTRY=asian_breakout` is a plain benchmark, not a candidate to trade:** the Asian range is the high and low of the 15-minute candles from 19:00 to 03:00 New York time; from 03:00 to 06:00 New York, the first completed candle to close outside it trades that way, at most one trade per candle; same exits and gates as v1. If v1's entries don't beat this, the ICT entries add nothing over a naive rule.
- For both `V1_ENTRY` rules, D6 (higher scores do better) is meaningless, because the score no longer picks trades; judge them on D1–D5 and say so.
- Each runs as a screen first. A screen pass runs rest, and a development pass runs final, as before.

**Written 30 Oct 2026, after the five screens above (v1-signal, cost-5pct, vol-floor, sweep-mss, asian-bench), before running these:**
- What those screens showed: v1's entries point the right way by about +0.09R an hour after entry (t 1.63), about the median cost (0.08R), and the edge is gone by two hours (−0.01R), while trades are held up to 8 hours. The ICT core alone (sweep-mss) has no edge (+0.02R), skipping quiet markets and the 5% cost cap didn't help, and buying the Asian-range breakout lost −0.345R a trade (beat 0.1% of random entries).
- **One-hour time limit, `V1_MAX_HOLD_HOURS=1`** (was 8): closes each trade where the entries' edge peaked. Screen first, development rules as for every v1 variant. Expected at best about break-even, since that edge is about the size of the cost.
- **Fading the Asian breakout, `V1_ENTRY=asian_fade`:** the asian_breakout rule traded the other way. It was found on 2020–2024, so those years don't count for it: it runs on **rest (2015–2019) only**. It passes there if: at least 80 trades, mean R > 0 after costs with t ≥ 2, and it beats 95% of random-entry runs. A pass earns a full test on other years and markets, not live money. The breakout rule had only 122 trades in five years (the cost check refused 979 entry attempts), so this is a long shot for a thin sample.
- **ICT 2022 on 5-minute candles on Nasdaq and DAX:** two of the twelve runs already written under "Nasdaq, DAX and bitcoin" above, unchanged (development, `V1_STRATEGY=ict2022;V1_ICT_TF=5m;V1_MAX_LOTS=0.02`, cycle 3). Run now because the gold run (+0.068R, beat 98.8% of random entries, 440 trades) was the closest of every test so far. Judged by I1–I5; a pass counts only for its own market.

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

## Silver Bullet (`V1_STRATEGY=silverbullet`) and OTE (`V1_STRATEGY=ote`): rules written 30 Oct 2026, before their first runs

**Where they come from.** ICT's own lessons, read as text summaries and transcripts (his videos can't be watched from here): the 2023 Mentorship lecture *ICT Silver Bullet Time Based Trading Model* and his *OTE Primer – Intro To ICT Optimal Trade Entry*, checked against independent write-ups of each. Where ICT leaves a choice to the trader, the choice made here is marked *(choice)*. Summaries can be wrong, so every rule below appears in at least two sources, or is marked as a choice.

### Silver Bullet: a fair value gap in a one-hour window, aimed at liquidity

What differs from the ICT 2022 model: **no raid or structure shift is required**, only the hour, a gap and room to a liquidity target; the target is that liquidity, not a fixed 2R; and the stop sits at the gap's first candle, not beyond a raid.

- **Windows (New York clock):** 03:00–04:00, 10:00–11:00 and 14:00–15:00.
- **The gap:** three completed 5-minute candles, the third closing inside the window. Buy: the first candle's high is below the third's low; sell: the mirror. Every size counts *(choice: ICT gives no minimum for gold)*.
- **Liquidity (the target):** untouched highs for a buy, untouched lows for a sell, from: the previous trading day's high and low; the Asian range (20:00–00:00); for the 10:00 and 14:00 windows also the London killzone (02:00–05:00); for the 14:00 window also the New York morning (07:00–12:00). A level is untouched if no candle since it formed, up to the gap's third candle, has traded beyond it.
- **Entry:** a limit order at the gap's near edge (the third candle's low for a buy) *(choice, as for the 2022 model)*. At market if price is already inside the gap; no trade if price is already through it or already came back to the entry.
- **Stop:** beyond the gap's first candle (its low for a buy) by the spread *(choice: the usual reading; ICT's lecture doesn't fix it)*.
- **Room:** the nearest untouched level in the trade's direction must be at least **2R** from the entry *(choice: ICT says the move must justify the risk and uses 2:1 as the minimum elsewhere)*. If the nearest one is closer, that gap is skipped and the next gap in the window is checked.
- **Targets:** one small lot at 1R (v1's TP1 lot, breakeven and ladder), the rest at that liquidity level.
- **Order life:** cancelled if not filled by the window's end (ICT: the entry happens inside the hour; the trade may run after it), if price reaches the target first, or before XM's daily break.
- **Limits:** the first qualifying gap per window, so at most three setups a day; one Silver Bullet trade or order at a time.

### OTE: buy the 62–79% pullback of a move that broke structure

- **Candles:** 1-hour (ICT: hourly setups are cleaner than lower timeframes).
- **Swings:** a swing high is a candle whose high is above both neighbours' highs; a swing low is the mirror.
- **The move (buy; sell is the mirror):** from a swing low L, a candle closes above the last swing high that formed before L (the break in structure). The move's high H is the highest high since L. It is fixed once a later candle confirms H as a swing high (the pullback has begun).
- **Size:** H − L must be at least 2× the 1-hour ATR(14) at the break *(choice: ICT asks for an impulse but gives no size)*.
- **Entry:** a limit at the **70.5%** retracement, H − 0.705 × (H − L): ICT's "sweet spot" inside the 62–79% zone.
- **Stop:** L, beyond by the spread (ICT: the stop goes exactly at the swing low).
- **Targets:** one small lot at H, the old high (ICT's first profit, ≈2.4R), then breakeven and v1's ladder; the rest at the −27% extension, H + 0.27 × (H − L) (ICT's first extension target, ≈3.3R) *(choice: the 1st of his extension targets, not the 2nd)*.
- **Order life:** cancelled if not filled within 12 hourly candles, if price trades beyond H first (a new high starts a new move), or before XM's daily break.
- **Limits:** one setup per move; one OTE trade or order at a time. No killzone or higher-timeframe filter *(choice: the OTE Primer gives none)*.

**What stays from v1, for both.** Sizing, the cost check (spread + slippage at most 10% of the stop), the entry gate (news, daily stop, trading hours, data checks) and the exits (8-hour limit, flat before XM's daily break). Live lot cap `V1_MAX_LOTS=0.02`. Cycle 3 minutes. Nothing is tuned after a run.

**Development (2015–2024): all five must hold, for each.** The same rules as the 2022 model (I1–I5): at least 300 trades; mean R > 0 after costs with t ≥ 3; beats ≥ 95% of random entries with the same exits; positive in at least two-thirds of the years that have **15+** trades *(15 rather than 30, because the OTE takes fewer trades a year)*; still positive with costs raised by 50%. **Control (random prices)** must show no edge. **Final (2025–Oct 2026)** runs once, only after development passes: at least 80 trades, mean > 0 with t ≥ 2, beats 95% of random entries.

## Nasdaq, DAX and bitcoin: rules written 30 Oct 2026, before any run on them

**Markets.** XM's `US100Cash#` (Nasdaq 100), `GER40Cash#` (DAX 40, formerly GER30) and `BTCUSD#`, the names on this account's MT5. Prices: HistData's 1-minute NSXUSD and GRXEUR files, and Bitstamp's 1-minute BTC/USD (a public dataset on GitHub). Replay option `--market nas|ger|btc`.

**What runs.** The four ICT setups already written above, **unchanged**: ICT 2022 on 5-minute and on 15-minute candles, Silver Bullet and OTE. Each runs once on each market: 12 runs. Same New York clock, same rules, same targets, same lot cap (`V1_MAX_LOTS=0.02`), cycle 3 minutes. Nothing is tuned for a market, and nothing is changed after a run.

**Costs and hours (estimates, written before any run):**
- Nasdaq: spread 1.5 points in the New York cash session (09:30–16:00), 2.5 in Europe's hours, 3.5 overnight (XM's 24-hour average is about 2.9). Gold's hours, 01:10–23:50 server time.
- DAX: 1.8 points in Xetra hours (09:00–17:30 Frankfurt), 3.5 either side, 6 overnight (XM's 24-hour average is about 3.8). Hours 02:15–23:00 server time (the DAX futures day) *(choice: XM's exact GER40Cash hours aren't published where this could read them)*.
- Bitcoin: $60 *(weak evidence: one comparison site gives XM $50–80)*. Weekdays only, gold's hours *(choice: ICT's sessions are weekday ones)*.
- Spreads widen ×2.5 within 30 minutes of the daily close and open, ×1.5 more in the first hour of the week.
- The cost check's slippage allowance is in the market's own units: 0.5 index points, $10 for bitcoin (gold: $0.10).
- These are estimates. I5 (costs raised by half) is the safeguard; check live spreads in MT5 before trading any market.

**Pass rules.** The same as each setup's on gold: I1–I5, with I4 over years with 30+ trades for the 2022 model and 15+ for Silver Bullet and OTE. A pass counts only for the market it happened on. **Control:** one random-price run per market (ICT 2022, 5-minute), because the market code in the replay is new. **Final (2025–Oct 2026):** once, only for a setup and market that passed development.

**Counting the tries.** These are 12 more rows in the variant log. With t ≥ 3 required, the chance that any one of them passes by luck alone is about 1 in 700, and about 1 in 60 that at least one of the 12 does. A single pass is still a reason for its final test, not for live money.

## Turtle System 2 on four markets (`V1_STRATEGY=ea`, `V1_EA=turtle-55d`): rules written 30 Oct 2026, before any run

**Why this one.** Trend-following is the strategy family with the longest published record across many markets (Hurst, Ooi and Pedersen, *A Century of Evidence on Trend-Following Investing*, AQR 2017). Its case rests on spreading one simple rule over several markets, so a bad year in one is covered by others. The Turtle traders' System 2 is its best-known fully published rule set. On daily candles its stops are wide, so the spread costs a small share of each trade, which is where every intraday ICT test lost.

**The strategy** is the file `src/ea/strategies/turtle-55d.json`: buy when the daily close is above the highest high of the 55 days before; sell when it closes below the lowest low. Stop 2N (N = ATR(20)). Exit at the 20-day low for buys and the 20-day high for sells. No target. One position per market, held overnight. Its notes list where it differs from the original Turtle rules and why.

**Runs.** Gold, Nasdaq (`US100Cash#`), DAX (`GER40Cash#`) and bitcoin (`BTCUSD#`), 2015–2024, each in **one** job (period `decade`), so trades lasting months aren't cut at year ends. Cycle 60 minutes (it acts within an hour of each daily close). Lot cap 0.02. Test account R1,000,000 (`balance` input), so the minimum lot never decides whether a trade is taken: on daily stops (2N ≈ $100–160 on gold) one 0.01 lot risks about R2,000–3,000, more than v1's 1% limit allows on smaller accounts. A live account would need to be big enough for the same reason. Swaps charged at the replay's estimates (0.025% of the price a night for buys, 0.008% for sells, triple on Wednesdays). These come from a gold sample, so check each market's real swaps in MT5 before trading it.

**Judged on all four markets together: all five must hold.**

| | Rule | Why |
|---|---|---|
| P1 | At least 100 trades in total | A daily system trades a few times a year per market |
| P2 | Mean R > 0 after costs and swaps, with t ≥ 2.5 | Fewer, longer trades; still a high bar after many tries |
| P3 | Beats ≥ 95% of random-entry runs with the same exits | The breakouts must add something over random timing and direction |
| P4 | Positive in at least 60% of the years with 10+ trades | Trend-following has bad years, but most must pay |
| P5 | Still positive with costs and swaps raised by 50% | Real swaps on CFDs may be worse than modelled |

Each market's own result is reported but not required to pass. **Final (2025–Oct 2026)** runs once, only if the four together pass. Nothing is tuned after a run: other lookbacks (20/10, 100/50...) would be new strategies and new rows in the variant log.

## Noise-area momentum on Nasdaq and DAX (`tools/noise/`): rules written 31 Oct 2026, before any run on real prices

**Why this one.** Trent wants a fully automatic system that trades most days, not a long-term trend system. The only published day-trading rule found with a long, cost-aware record is the noise-area intraday momentum of Zarattini, Aziz and Barbon, *Beat the Market: An Effective Intraday Momentum Strategy for S&P500 ETF (SPY)* (Swiss Finance Institute 24-97, 2024): 2007 to early 2024, 19.6% a year net of costs, Sharpe 1.33. The authors' own result on GLD was a Sharpe of 0.28, so gold isn't tested. Caution written in advance: a 2026 replication of the same authors' opening-range breakout on index CFDs reproduced the gross result but found it net zero after spread (mql5.com blog post 776235). CFD spreads are the main risk here too.

**The strategy** is `tools/noise/noise-momentum.js`, as in the paper, with no settings tried:
- Cash session only: Nasdaq (`US100Cash#`) 09:30–16:00 New York, DAX (`GER40Cash#`) 09:00–17:30 Frankfurt.
- Noise area at minute *m* of the session = the average of |close at *m* ÷ open − 1| over the previous 14 sessions. Upper = max(today's open, yesterday's close) × (1 + that); lower = min(open, yesterday's close) × (1 − that).
- Decisions only on the :00/:30 marks after the open, on that minute's close: above upper → buy, below lower → sell.
- Exit on the same marks: a buy closes when price is below max(upper, VWAP); a sell when above min(lower, VWAP). A new entry is allowed on a later mark. Everything closes at the session's last minute, so there are no swaps.
- Size: leverage = min(4, 2% ÷ the standard deviation of the last 14 open-to-close daily returns).
- HistData's index files have no volume, so VWAP is a time-weighted average *(choice, forced by the data)*.

**Costs (estimates, the same as the ICT runs on these markets):** a round trip costs the cash-session spread plus 0.5 points slippage: Nasdaq 1.5 + 0.5 = 2.0 points, DAX 1.8 + 0.5 = 2.3 points.

**Not the full replay.** This doesn't run `bot-engine.js`: the strategy is a few lines and needs no broker model, so `tools/noise/judge.js` runs it straight on the replay's own price files. Its random benchmark is simpler than `verdict.js`'s: each trade keeps its entry and exit times, size and cost, and gets a random direction (1,000 runs). What's left is the direction's skill.

**Development (2015–2024), judged for each market on its own: all six must hold.**

| | Rule | Why |
|---|---|---|
| N1 | At least 300 trades | It should trade most days, so ten years give well over 1,000 |
| N2 | Mean daily return > 0 after costs, with t ≥ 3 (from daily returns, including days without a trade) | Many strategies have been tried in this repo |
| N3 | Beats ≥ 95% of random-direction runs | The breakouts must pick the direction better than a coin |
| N4 | Positive in at least two-thirds of the years with 30+ trades | One lucky year mustn't carry it |
| N5 | Still positive with costs raised by 50% | Real spreads and slippage are often worse than modelled |
| N6 | Positive in at least 55% of months | Trent asked for consistency; this is the honest version of it |

**Control (random-walk prices), run with each development run:** judged before costs, because on random prices costs alone make any active rule lose: |t| < 2 and the random-direction percentile between 5% and 95%. On three seeds per market run here before any real run, five of six passed and one DAX seed fell just outside (3.5%), about what chance gives; no bias found.

**Final (2025–Oct 2026)** runs once, only for a market that passed development: at least 100 trades, mean > 0 with t ≥ 1.5, beats 95% of random-direction runs. Nothing is tuned after any run: a different lookback, check interval or stop is a new strategy and a new row in the variant log.

**Counting the tries.** Two rows (Nasdaq, DAX). A pass is a reason to run final and then trade the demo account, not live money.

### Written 31 Oct 2026, after the Nasdaq and DAX runs failed, before this one: Nasdaq at micro-futures costs (`mnq`)

- What failed: on XM's estimated CFD costs, Nasdaq made 4.46 points a trade before costs and beat 100% of random-direction runs, but 2.46 after a 2-point round trip was too little (t 0.93, Sharpe 0.29, 53% drawdown). DAX made under a point before costs.
- **The question here is only the cost.** The same strategy, the same Nasdaq prices, nothing else changed. A round trip in Micro E-mini Nasdaq futures (MNQ, $2 a point) is charged **1.5 points**: one tick of spread (0.25, the usual US-session spread), about $1.82 of round-trip fees and commission (0.91 points; a broker list of all-in micro costs), and about one tick of slippage, rounded up. Costs × 1.5 (N5) is then 2.25 points, about XM's.
- **This is not a blind test**: the gross result is already known from the `nas` run, so the outcome is partly arithmetic. It answers "would the signal pay at the cheapest realistic costs", not "is there a signal". Judged by N1–N6 as written above. A pass would also need a futures broker the bot can reach through MT5, and an account big enough that one micro contract isn't oversized: neither is checked here.
- One more row in the variant log.

## Daily edges (`tools/daily/edges.js`): rules written 31 Oct 2026, before any run on real prices

**Why these.** Trent wants a fully automatic system that trades most days and wins more often than it loses. After every intraday test above failed on costs, a research pass (sources in the report linked from the PR) found two families with a structural reason to exist and a cost small enough to test on XM:
- **Short-term mean reversion in stock indices.** Daily and weekly index returns have reversed since about 2000 (Baltussen, van Bekkum and Da, *Indexing and stock market serial dependence around the world*, JFE 2019). Two published, fully specified rules are tested, each exactly as published: internal bar strength (Pagonidis, *The IBS effect*, 2013) and Connors' RSI(2) (*Short Term Trading Strategies That Work*, 2008). Both win 60–75% of trades in published tests, which is the win rate Trent asked for.
- **Gold's session pattern.** Gold has tended to rise in Asian hours and fall in US hours: the World Gold Council's H1 2026 review measured +13% in Asian hours and −15% in US hours; London fix data show the same split back to 1970 (part of it blamed on fix manipulation before 2015). Both legs trade every day and close inside one XM day, so they pay no swap.
- **Not tested, with reasons:** the US-futures overnight drift (Boyarchenko, Larsen and Whelan, RFS 2023) earned about 1.5 basis points a day before costs, its authors found it unprofitable after futures spreads, and it has been flat since 2021 (NY Fed, July 2026). Turn-of-the-month has been insignificant in US ETFs since about 2015 in recent replications.

**The five tests.** Each is run once on development (2015–2024) exactly as written. Nothing is tuned after a run; a changed rule is a new test and a new row in the variant log.

1. **`ibs-nas`, `ibs-ger`: IBS < 0.2, long only.** Daily bar = the cash session up to 5 minutes before its close (Nasdaq 09:30–15:55 New York, DAX 09:00–17:25 Frankfurt). IBS = (close − low) ÷ (high − low). If IBS < 0.2, buy at that close. Hold while each later close still has IBS < 0.2; sell at the first close with IBS ≥ 0.2 *(choice: Pagonidis measures the next day's close; holding on through further low-IBS days avoids paying the spread twice for one position)*. No stop.
2. **`rsi2`: Connors RSI(2), long only, Nasdaq and DAX judged together.** Same daily bars. Buy at the close when the close is above its 200-day average and the 2-period RSI (Wilder's smoothing) is below 5. Sell at the first close above the 5-day average. No stop.
3. **`gold-asia-long`.** Buy gold at 19:15 New York, Sunday to Thursday evenings, and sell at 03:00 New York the next morning (08:00 in London: the London open). *(choice: 19:15 rather than the 18:05 reopen, to stay clear of the post-break and Monday-open spreads.)*
4. **`gold-us-short`.** Sell gold at 08:20 New York (COMEX day-session open) and buy it back at 13:30 New York (COMEX day-session close), Monday to Friday.

**Costs.**
- Index tests: the spread at the decision minute (Nasdaq 1.5 points, DAX 1.8 points: the replay's estimates for XM's cash session), plus 0.5 points slippage a round trip, plus a long swap of 0.025% of price a night held (about 9% a year; a comparable broker's US 500 Cash CFD charges 8.6% a year). Fridays to Mondays count as three nights.
- Gold tests: the replay's XM gold spread at the minute it is paid (buys pay on entry, sells on exit: $0.28 at both 19:15 and 13:30 New York in that model) plus $0.10 slippage. No swap.
- Prices are bid (HistData 1-minute), so buys pay the spread.

**Random benchmarks.**
- Index tests: each trade is matched by a long entry on a random session of the same calendar year, held for the same number of sessions, with the same costs and swaps; 1,000 runs. Indices rose over the decade, so this asks whether the signal adds anything to simply being long that often.
- Gold tests: each day's trade is matched by a window of the same length and direction starting at a random minute of the same XM day (18:05–16:55 New York); 1,000 runs. This asks whether the hours matter, not just being long or short gold.

**Development (2015–2024): all must hold.**

| | Index tests (M) | Gold tests (G) |
|---|---|---|
| 1 | At least 100 trades | At least 300 trades |
| 2 | Mean return a trade > 0 after costs and swaps, t ≥ 2.5 | Mean return a day > 0 after costs, t ≥ 3 |
| 3 | Beats ≥ 95% of the random benchmark | Beats ≥ 95% of the random benchmark |
| 4 | Positive in ≥ 60% of years with 5+ trades | Positive in ≥ 2/3 of years with 30+ trades |
| 5 | Still positive with costs and swaps × 1.5 | Still positive with costs × 1.5 |
| 6 | — | Positive in ≥ 55% of months |

Win rate, average win and loss, profit factor, worst drawdown and return at 1× size are reported for all, but don't decide a pass: a high win rate with a negative mean is a loss.

**Control (random-walk prices, judged before costs), run with each development run:** a long-only rule on one random path inherits that path's trend, so the control asks whether the rule beats its own random benchmark: |z| < 2 against the benchmark's median, and the benchmark percentile between 5% and 95%. Run here on three seeds per test before any real run: 13 of 15 passed; the two misses (Nasdaq IBS at 98.0%, RSI(2) at 3.2%) point opposite ways, about what chance gives for 15 two-sided checks.

**Final (2025–Oct 2026)** runs once, only for a test that passed development: at least 30 trades for an index test or 200 for a gold test, mean > 0 after costs with t ≥ 1.5, and beats ≥ 90% of its random benchmark.

**Counting the tries.** Five more rows. With the thresholds above the chance that at least one passes by luck is roughly 1 in 20; a pass is a reason for its final test, then demo trading, not live money.

### Written 31 Oct 2026, after the five development runs above and before this one: Nasdaq mean reversion on data it has not been judged on (`oos`)

- **What development showed.** IBS on Nasdaq made +0.207% a trade after costs and swaps over 354 trades, won 57.9%, beat 99.2% of random entries and was positive in 8 of 10 years, but its t of 2.25 missed M2's 2.5, so it failed. RSI(2) had too few trades (83); its Nasdaq line made +0.68% a trade over 51 trades (t 2.89, 78% winners) and its DAX line +0.23% over 32 (t 0.61). IBS on the DAX lost even before costs. Both gold legs lost.
- **So two Nasdaq rules are promising, not proven, and Nasdaq-only RSI(2) was picked after seeing the per-market lines.** The honest check is data neither has been judged on: Nasdaq before 2015 (2010–2014, or as far back as HistData goes) and after 2024 (January 2025 to October 2026). The 2025–26 period was reserved for tests that passed development; using it here for two that didn't is decided now, before looking, and it is then used up.
- **Tests:** `ibs-nas` and `rsi2-nas` (RSI(2) on Nasdaq alone), with the development rules and costs unchanged. Period `oos`: entries in 2010–2014 and in 2025–Oct 2026, judged together.
- **Pass, for each:** O1 at least 60 trades (IBS) or 25 (RSI(2)); O2 mean > 0 after costs and swaps with t ≥ 2; O3 beats ≥ 95% of random long entries (same year, same holding time, same costs).
- **What a pass earns:** forward testing on the demo account, unchanged, for at least 3 months and 30 trades before any real money. **A fail:** the rule is dropped. If HistData has no Nasdaq data before 2015, the 2025–26 part is judged alone, with O1 halved.

### Written 31 Oct 2026, before running them: the Nasdaq dip rules on the S&P 500 (`ibs-spx`, `rsi2-spx`)

- **Why.** Trent asked whether the Nasdaq IBS result is broad or a fluke, and for more trades. He also asked for the Dow, but no free 1-minute Dow data reaches GitHub's runners (HistData has none, and Dukascopy blocks them), so the Dow is not tested.
- **`ibs-spx`:** the IBS rule exactly as `ibs-nas`, on the S&P 500's cash session (09:30–15:55 New York). Costs: XM's published average `US500Cash` spread of 0.6 points, slippage 0.2 points (about the same share of price as Nasdaq's 0.5), and the same 0.025% a night swap as every index test here, so the results compare. Judged on development (2015–2024) by M1–M5. A pass then runs `oos` (2010–2014 and 2025–Oct 2026) by O1–O3, as Nasdaq did.
- **`rsi2-spx`:** RSI(2) exactly as `rsi2`, on the S&P 500 alone. It fires too rarely to split, so it is judged once on every year the data has (period `all`, entries from 2010, or once 200 days of history exist, to October 2026): A1 at least 60 trades; A2 mean > 0 after costs and swaps with t ≥ 2; A3 beats ≥ 95% of random long entries. Context read before writing this: Backtrex found 71% winners but only +1.7% a year for this rule on the S&P 500 in 2016–2026.
- **Caution, written now:** the S&P 500 and Nasdaq-100 move closely together, so a pass on the S&P supports the Nasdaq result without proving it independently, and a bot trading both would often hold both at once.
- Two more rows in the variant log.

### Written 31 Oct 2026, before running it: is Nasdaq IBS robust to its settings? (`ibs-nas-grid`)

- **Why.** Nasdaq IBS made about +0.2% a trade in both samples, but at one setting: buy below an IBS of 0.20, hold until the first close at or above it. If only that exact setting works, the result is probably luck. If nearby settings also work, the effect is more likely real. This is a diagnostic, not a new strategy: nothing here will be picked for trading.
- **Grid:** IBS thresholds 0.10, 0.15, 0.20, 0.25 and 0.30, each with two exits: the first close with IBS at or above the threshold (as tested), or simply the next close (Pagonidis' one-day hold). Ten cells, all on every year of Nasdaq data (period `all`, 2011–Oct 2026), with the same XM-style costs as `ibs-nas`.
- **Judged:** BROAD if at least 8 of the 10 cells make money after costs, and the median cell makes at least half the tested cell's mean. Otherwise NARROW. On random prices before costs the grid reads NARROW (2 of 10 positive), as it should.
- One more row in the variant log.
