#!/usr/bin/env python3
"""Nasdaq IBS on QQQ's own daily bars (rules: tools/replay/RULES.md, `qqq-ibs`).

Check A  2011-Oct 2026: does QQQ's daily rule enter on the same days as `ibs-nas`
         (US100 minute prices, decided at 15:55)?  Diagnostic, not a strategy test.
Test B   1999-2010: the same rule on years no earlier test has seen.  PASS if the
         mean trade after 0.08% costs is above zero with t >= 2.0 and it beats at
         least 95% of 1,000 sets of random entries held just as long.
Control  Test B on shuffled days, before costs: must not pass.

python3 tools/daily/qqq_ibs.py --csv tools/daily/qqq/qqq-1day-twelvedata-20261031.csv \
    --index-trades verdicts/edges-ibs-nas-development-41228247358.json.gz \
                   verdicts/edges-ibs-nas-oos-41229214099.json.gz \
    --md verdicts/qqq-ibs-20261031.md --json verdicts/qqq-ibs-20261031.json [--log tools/replay/VARIANTS.md]
"""
import argparse, csv, gzip, json, math, random, statistics
from collections import defaultdict

TH = 0.20        # buy below this IBS, sell at the first close at or above it
COST = 0.0008    # flat cost a trade, about the XM-style average in 2011-2026
SETS = 1000      # random-entry sets


def load(path):
    days = []
    for r in csv.DictReader(open(path)):
        o, h, l, c = (float(r[k]) for k in ('open', 'high', 'low', 'close'))
        days.append({'day': r['date'], 'o': o, 'h': h, 'l': l, 'c': c})
    days.sort(key=lambda d: d['day'])
    for d in days:
        d['ibs'] = (d['c'] - d['l']) / (d['h'] - d['l']) if d['h'] > d['l'] else 0.5
    return days


def run(days, start, end, cost):
    """Entries on days in [start, end); an open trade exits at the first close with IBS >= TH."""
    trades, pos = [], -1
    for i, d in enumerate(days):
        if pos >= 0:
            if d['ibs'] >= TH:
                e, x = days[pos]['c'], d['c']
                trades.append({'entryDay': days[pos]['day'], 'exitDay': d['day'], 'i': pos, 'j': i,
                               'hold': i - pos, 'entry': e, 'exit': x, 'gross': x / e - 1, 'ret': x / e - 1 - cost})
                pos = -1
            continue
        if start <= d['day'] < end and d['ibs'] < TH:
            pos = i
    return trades


def stats(trades, key='ret'):
    r = [t[key] for t in trades]
    n = len(r)
    if n < 2:
        return {'n': n}
    m, sd = statistics.mean(r), statistics.stdev(r)
    wins, losses = [x for x in r if x > 0], [x for x in r if x <= 0]
    eq, peak, mdd = 1.0, 1.0, 0.0
    for x in r:
        eq *= 1 + x
        peak = max(peak, eq)
        mdd = max(mdd, 1 - eq / peak)
    return {'n': n, 'mean': m, 't': m / sd * math.sqrt(n), 'win': len(wins) / n,
            'avgWin': statistics.mean(wins) if wins else 0, 'avgLoss': statistics.mean(losses) if losses else 0,
            'worst': min(r), 'best': max(r), 'total': eq - 1, 'mdd': mdd}


def random_pct(days, trades, start, end, cost, seed):
    """Share of SETS random-entry sets (same hold lengths, entries in range) whose mean is below the rule's."""
    rng = random.Random(seed)
    idx = [i for i, d in enumerate(days) if start <= d['day'] < end]
    lo, hi = idx[0], idx[-1]
    actual = statistics.mean(t['ret'] for t in trades)
    below, means = 0, []
    for _ in range(SETS):
        s = 0.0
        for t in trades:
            i = rng.randint(lo, min(hi, len(days) - 1 - t['hold']))
            s += days[i + t['hold']]['c'] / days[i]['c'] - 1 - cost
        m = s / len(trades)
        means.append(m)
        below += m < actual
    return below / SETS, statistics.median(means)


def shuffled(days, start, end, seed):
    """Days in range with their bars (relative to the previous close) in random order."""
    rng = random.Random(seed)
    idx = [i for i, d in enumerate(days) if start <= d['day'] < end and i > 0]
    rel = [tuple(days[i][k] / days[i - 1]['c'] for k in ('o', 'h', 'l', 'c')) for i in idx]
    rng.shuffle(rel)
    out, prev = [], days[idx[0] - 1]['c']
    for n, (o, h, l, c) in enumerate(rel):
        d = {'day': days[idx[n]]['day'], 'o': o * prev, 'h': h * prev, 'l': l * prev, 'c': c * prev}
        d['ibs'] = (d['c'] - d['l']) / (d['h'] - d['l']) if d['h'] > d['l'] else 0.5
        out.append(d)
        prev = d['c']
    return out


def by_year(trades):
    y = defaultdict(list)
    for t in trades:
        y[t['exitDay'][:4]].append(t['ret'])
    out = []
    for k in sorted(y):
        eq = 1.0
        for x in y[k]:
            eq *= 1 + x
        out.append({'y': k, 'n': len(y[k]), 'ret': eq - 1})
    return out


def judge(s, pct):
    return 'PASS' if s['n'] >= 2 and s['mean'] > 0 and s['t'] >= 2.0 and pct >= 0.95 else 'FAIL'


def pc(x, d=2):
    return f"{x * 100:+.{d}f}%"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--csv', required=True)
    ap.add_argument('--index-trades', nargs='+', required=True)
    ap.add_argument('--md', required=True)
    ap.add_argument('--json', required=True)
    ap.add_argument('--log')
    a = ap.parse_args()
    days = load(a.csv)

    # ---- Check A: QQQ daily vs the US100 minute-price entries ----
    idx_tr = []
    for f in a.index_trades:
        idx_tr += json.load(gzip.open(f))['trades']
    idx_entries = sorted(t['entryDay'] for t in idx_tr)
    a_start, a_end = idx_entries[0][:7] + '-01', '2026-11-01'     # same span as the index data
    qa = run(days, a_start, a_end, COST)
    q_entries = {t['entryDay'] for t in qa}
    match = sum(1 for d in idx_entries if d in q_entries) / len(idx_entries)
    extra = sum(1 for d in q_entries if d not in set(idx_entries))
    idx_gross = statistics.mean(t['ret'] for t in idx_tr)   # index trades after XM-style costs
    sA, sAg = stats(qa), stats(qa, 'gross')
    checkA = 'USABLE' if match >= 0.80 else 'NOT USABLE'

    # ---- Test B: 1999-2010 ----
    b_start, b_end = days[0]['day'], '2011-01-01'
    tb = run(days, b_start, b_end, COST)
    sB, sBg = stats(tb), stats(tb, 'gross')
    pctB, medB = random_pct(days, tb, b_start, b_end, COST, seed=1)
    verdictB = judge(sB, pctB)

    # ---- Control: shuffled days, before costs ----
    sh = shuffled(days, b_start, b_end, seed=1)
    tc = run(sh, sh[0]['day'], b_end, 0.0)
    sC = stats(tc)
    pctC, _ = random_pct(sh, tc, sh[0]['day'], b_end, 0.0, seed=2)
    verdictC = judge(sC, pctC)
    trusted = verdictC == 'FAIL'
    extra_seeds = []
    for seed in range(2, 6):     # for information only; the judged control is seed 1
        shs = shuffled(days, b_start, b_end, seed)
        ts = run(shs, shs[0]['day'], b_end, 0.0)
        ss = stats(ts)
        extra_seeds.append({'seed': seed, 'n': ss['n'], 'mean': ss['mean'], 't': ss['t']})

    yB = by_year(tb)
    worstB = min(tb, key=lambda t: t['ret'])
    out = {'test': 'qqq-ibs', 'data': a.csv, 'cost': COST,
           'checkA': {'span': [a_start, a_end], 'indexEntries': len(idx_entries), 'match': match,
                      'qqqOnlyEntries': extra, 'qqq': sA, 'qqqGross': sAg, 'indexMeanAfterXM': idx_gross,
                      'verdict': checkA},
           'testB': {'span': [b_start, b_end], 'summary': sB, 'gross': sBg, 'randomPct': pctB,
                     'randomMedian': medB, 'years': yB, 'worst': worstB, 'verdict': verdictB, 'trades': tb},
           'control': {'summary': sC, 'randomPct': pctC, 'verdict': verdictC, 'otherSeeds': extra_seeds},
           'trusted': trusted}
    json.dump(out, open(a.json, 'w'), indent=1)

    final = verdictB if trusted else 'VOID (control passed)'
    L = []
    L.append('# Nasdaq IBS on QQQ\'s daily history (`qqq-ibs`)\n')
    L.append(f'**Test B, 1999–2010: {final}** · QQQ daily bars from Twelve Data · flat cost {COST * 100:.2f}% a trade · '
             'rules written before the data were fetched (`tools/replay/RULES.md`)\n')
    L.append('## Test B: 1999–2010, years no earlier test saw\n')
    L.append('| Trades | Winners | Mean a trade | t | Before costs | Beats random entries | Worst trade | Worst drawdown (1×) |')
    L.append('|---|---|---|---|---|---|---|---|')
    L.append(f"| {sB['n']} | {sB['win'] * 100:.1f}% | {pc(sB['mean'], 3)} | {sB['t']:.2f} | {pc(sBg['mean'], 3)} | "
             f"{pctB * 100:.1f}% | {pc(worstB['ret'], 1)} ({worstB['entryDay']} → {worstB['exitDay']}) | {sB['mdd'] * 100:.1f}% |\n")
    L.append(f"Pass mark: mean above zero with t ≥ 2.0, and beating at least 95% of {SETS} sets of random entries held "
             f"just as long (their median: {pc(medB, 3)} a trade).\n")
    L.append('| Year | Trades | Return at 1× |')
    L.append('|---|---|---|')
    for y in yB:
        L.append(f"| {y['y']} | {y['n']} | {pc(y['ret'], 1)} |")
    L.append('')
    L.append('## Control: the same test on shuffled days, before costs\n')
    L.append(f"{sC['n']} trades, mean {pc(sC['mean'], 3)}, t = {sC['t']:.2f}, beats {pctC * 100:.1f}% of random entries: "
             f"**{verdictC}** ({'as it should; Test B counts' if trusted else 'the test is broken; Test B does not count'}). "
             'Other seeds, for information: ' +
             ', '.join(f"{s['seed']}: {pc(s['mean'], 3)} (t {s['t']:.2f})" for s in extra_seeds) + '.\n')
    L.append('## Check A: does QQQ reproduce the index rule? (diagnostic)\n')
    L.append(f"Of the {len(idx_entries)} `ibs-nas` entries (US100 minute prices, decided at 15:55, {a_start} to Oct 2026), "
             f"**{match * 100:.1f}%** were also QQQ daily-rule entries on the same day: **{checkA}** (needed 80%). "
             f"QQQ took {extra} entries the index rule didn't.\n")
    L.append(f"Over the same span the QQQ daily rule made {sA['n']} trades, {pc(sAg['mean'], 3)} a trade before costs and "
             f"{pc(sA['mean'], 3)} after the flat {COST * 100:.2f}% (t = {sA['t']:.2f}); the index rule made "
             f"{pc(idx_gross, 3)} after XM-style costs.\n")
    open(a.md, 'w').write('\n'.join(L))
    if a.log:
        with open(a.log, 'a') as fh:
            fh.write(f"| 2026-10-31 | 1999-2010 | qqq-ibs | `qqq_ibs.py, QQQ daily, cost 0.08%` | {sB['n']} | "
                     f"{pc(sB['mean'], 3)}/trade | {sB['t']:.2f} | {pctB * 100:.1f}% | {final} |\n")
    print('\n'.join(L))


if __name__ == '__main__':
    main()
