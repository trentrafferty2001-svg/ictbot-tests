#!/usr/bin/env python3
"""The Nasdaq dip rule on Bitcoin's daily bars (rules: tools/replay/RULES.md, `btc-ibs`).

python3 tools/daily/btc_ibs.py --csv tools/daily/btc/btcusd-1day-twelvedata-20261101.csv \
    --md verdicts/btc-ibs-20261101.md --json verdicts/btc-ibs-20261101.json [--log tools/replay/VARIANTS.md]
"""
import argparse, json, os, statistics, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qqq_ibs import load, run, stats, random_pct, shuffled, by_year, judge, pc, SETS   # same rule and benchmark code

COST = 0.0010
END = '2026-11-01'           # the 1 Nov bar was still forming when fetched, so the test stops before it
RECENT = '2023-11-01'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv', required=True)
    ap.add_argument('--md', required=True)
    ap.add_argument('--json', required=True)
    ap.add_argument('--log')
    a = ap.parse_args()
    days = [d for d in load(a.csv) if d['day'] < END]
    start = days[0]['day']
    tr = run(days, start, END, COST)
    s, sg = stats(tr), stats(tr, 'gross')
    pct, med = random_pct(days, tr, start, END, COST, seed=1)
    recent = [t for t in tr if t['entryDay'] >= RECENT]
    rs = stats(recent)
    verdict = 'PASS' if judge(s, pct) == 'PASS' and rs['n'] >= 2 and rs['mean'] > 0 else 'FAIL'
    sh = shuffled(days, start, END, seed=1)
    tc = run(sh, sh[0]['day'], END, 0.0)
    sc = stats(tc)
    pc_c, _ = random_pct(sh, tc, sh[0]['day'], END, 0.0, seed=2)
    control = judge(sc, pc_c)
    final = verdict if control == 'FAIL' else 'VOID (control passed)'
    years = by_year(tr)
    worst = min(tr, key=lambda t: t['ret'])
    json.dump({'test': 'btc-ibs', 'cost': COST, 'span': [start, END], 'summary': s, 'gross': sg, 'randomPct': pct,
               'randomMedian': med, 'recent': rs, 'years': years, 'control': {'summary': sc, 'randomPct': pc_c, 'verdict': control},
               'verdict': final, 'trades': tr}, open(a.json, 'w'), indent=1)
    span_years = (len(days)) / 365.25
    L = ['# The Nasdaq dip rule on Bitcoin (`btc-ibs`)\n',
         f'**{final}** · BTC/USD daily bars (UTC days) from Twelve Data, {start} to 31 Oct 2026 · flat cost {COST * 100:.2f}% a trade, no overnight fee · '
         'rules written before the data were fetched (`tools/replay/RULES.md`)\n',
         '| Trades | Trades a year | Winners | Mean a trade | t | Before costs | Beats random entries | Worst trade | Worst drawdown (1×) |',
         '|---|---|---|---|---|---|---|---|---|',
         f"| {s['n']} | {s['n'] / span_years:.0f} | {s['win'] * 100:.1f}% | {pc(s['mean'], 3)} | {s['t']:.2f} | {pc(sg['mean'], 3)} | {pct * 100:.1f}% | "
         f"{pc(worst['ret'], 1)} ({worst['entryDay']} → {worst['exitDay']}) | {s['mdd'] * 100:.1f}% |\n",
         f"Last three years (entries from {RECENT}): {rs['n']} trades, {pc(rs['mean'], 3)} a trade (t = {rs['t']:.2f}).\n",
         f"Pass mark: mean above zero with t ≥ 2.0, beating at least 95% of {SETS} sets of random entries held just as long "
         f"(their median {pc(med, 3)} a trade), and the last three years positive.\n",
         '| Year | Trades | Return at 1× |', '|---|---|---|']
    L += [f"| {y['y']} | {y['n']} | {pc(y['ret'], 1)} |" for y in years]
    L += ['', f"**Control** (shuffled days, before costs): {sc['n']} trades, mean {pc(sc['mean'], 3)}, t = {sc['t']:.2f}, "
          f"beats {pc_c * 100:.1f}% of random entries: {control}" + (' — as it should, so the test counts.' if control == 'FAIL' else ' — the test is broken.')]
    open(a.md, 'w').write('\n'.join(L) + '\n')
    if a.log:
        with open(a.log, 'a') as fh:
            fh.write(f"| 2026-11-01 | all | btc-ibs | `btc_ibs.py, BTC/USD daily, cost 0.10%` | {s['n']} | {pc(s['mean'], 3)}/trade | "
                     f"{s['t']:.2f} | {pct * 100:.1f}% | {final} |\n")
    print('\n'.join(L))


if __name__ == '__main__':
    main()
