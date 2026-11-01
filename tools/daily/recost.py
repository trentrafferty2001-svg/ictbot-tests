#!/usr/bin/env python3
"""Re-price the 558 Nasdaq IBS trades (`ibs-nas`, US100 minute prices) under any broker's costs.

    python3 tools/daily/recost.py --spread 1.8 --slip 0.5 --swap-night 0.00025 --price 29000

--spread / --slip  round-trip points (spread paid once, slippage once in total)
--swap-night       long overnight fee as a share of price per night (0.00025 = 0.025%)
--price            today's Nasdaq-100 level, to cost every trade as a share of today's price

Prints the mean trade and t for 2015-24 and the held-back years, both with costs as a share of
today's price (the better guide from now on) and in fixed points every year (as in the report).
The swap per night comes from /costs: for MT5 swap mode POINTS, swap-night = |swapLong| x tickSize / price.
This is a check made after the results, never a pass.
"""
import argparse, gzip, json, math, os, statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = {'2015-24': 'verdicts/edges-ibs-nas-development-41228247358.json.gz',
         'held back': 'verdicts/edges-ibs-nas-oos-41229214099.json.gz'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--spread', type=float, required=True)
    ap.add_argument('--slip', type=float, default=0.5)
    ap.add_argument('--swap-night', type=float, required=True)
    ap.add_argument('--price', type=float, default=29000)
    a = ap.parse_args()
    root = os.path.normpath(os.path.join(HERE, '..', '..'))
    trades = {k: json.load(gzip.open(os.path.join(root, f)))['trades'] for k, f in FILES.items()}
    pts = a.spread + a.slip

    def today(t):
        return t['exit'] / t['entry'] - 1 - pts / a.price - a.swap_night * t['nights']

    def fixed(t):
        return (t['exit'] - t['entry'] - pts) / t['entry'] - a.swap_night * t['nights']

    print(f'Costs: {a.spread} + {a.slip} points, {a.swap_night * 100:.4f}% a night; Nasdaq-100 at {a.price:,.0f}')
    for name, f in (("as a share of today's price", today), ('in fixed points every year', fixed)):
        parts = []
        for k, ts in trades.items():
            r = [f(t) for t in ts]
            m, sd = st.mean(r), st.stdev(r)
            parts.append(f'{k}: {m * 100:+.3f}% (t {m / sd * math.sqrt(len(r)):.2f}, {len(r)} trades)')
        allr = [f(t) for ts in trades.values() for t in ts]
        print(f"{name:30s} all {st.mean(allr) * 100:+.3f}% · " + ' · '.join(parts))


if __name__ == '__main__':
    main()
