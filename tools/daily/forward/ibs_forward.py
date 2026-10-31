#!/usr/bin/env python3
"""Forward test of Nasdaq IBS on QQQ, decided at 15:55 New York (rules: `ibs-nas` in tools/replay/RULES.md).

    python3 tools/daily/forward/ibs_forward.py BARS_FILE tools/daily/forward/qqq-ibs-forward.csv

BARS_FILE is Twelve Data's time_series output for QQQ at 5min: 'datetime;open;high;low;close;volume',
times in New York, any order. Days after the last logged day are decided and appended to the log:

  * the day's bar runs from 09:30 to 15:55 (5-minute bars starting 09:30 to 15:50);
  * IBS = (close - low) / (high - low) of that bar;
  * flat and IBS < 0.20: BUY at the 15:55 price; long and IBS >= 0.20: SELL at the 15:55 price;
  * a day with under 47 of its 77 bars (a half day, or a gap in the data) is SKIPPED, as in the backtest;
  * the newest day is only decided once it has its 15:50 bar.

Prints a line per new day, then 'SIGNALS: ...' (BUY/SELL days, or 'none') and a running summary.
Nothing here trades; it only keeps the record.
"""
import csv, os, sys
from collections import defaultdict

TH, COST, NEED = 0.20, 0.0008, 47
FIELDS = ['date', 'ibs_1555', 'close_1555', 'action', 'position', 'entry_date', 'entry_price',
          'trade_return', 'trade_return_after_costs', 'source']


def read_bars(path):
    days = defaultdict(list)
    for line in open(path):
        p = line.strip().split(';')
        if len(p) < 5 or not p[0][:4].isdigit():
            continue
        t = p[0][11:16]
        if '09:30' <= t < '15:55':
            days[p[0][:10]].append((t, float(p[2]), float(p[3]), float(p[4])))
    return {d: sorted(b) for d, b in days.items()}


def main(bars_path, log_path):
    bars = read_bars(bars_path)
    rows = list(csv.DictReader(open(log_path))) if os.path.exists(log_path) else []
    last = rows[-1] if rows else None
    pos = last['position'] if last else 'FLAT'
    entry_date = last['entry_date'] if last and pos == 'LONG' else ''
    entry_price = float(last['entry_price']) if last and pos == 'LONG' else 0.0
    newest = max(bars) if bars else ''
    added, signals = [], []
    for d in sorted(bars):
        if last and d <= last['date']:
            continue
        b = bars[d]
        if d == newest and b[-1][0] != '15:50':
            break                                   # today's 15:55 bar isn't complete yet
        row = {k: '' for k in FIELDS}
        row.update(date=d, source='live', position=pos, entry_date=entry_date,
                   entry_price=f'{entry_price:.2f}' if pos == 'LONG' else '')
        if len(b) < NEED:
            row['action'] = 'SKIP'
        else:
            h, l, c = max(x[1] for x in b), min(x[2] for x in b), b[-1][3]
            ibs = (c - l) / (h - l) if h > l else 0.5
            row.update(ibs_1555=f'{ibs:.3f}', close_1555=f'{c:.2f}')
            if pos == 'FLAT' and ibs < TH:
                pos, entry_date, entry_price = 'LONG', d, c
                row.update(action='BUY', position='LONG', entry_date=d, entry_price=f'{c:.2f}')
                signals.append(f'{d} BUY at {c:.2f} (IBS {ibs:.2f})')
            elif pos == 'LONG' and ibs >= TH:
                r = c / entry_price - 1
                row.update(action='SELL', position='FLAT', trade_return=f'{r:.5f}', trade_return_after_costs=f'{r - COST:.5f}')
                signals.append(f'{d} SELL at {c:.2f} (IBS {ibs:.2f}), trade {r * 100:+.2f}% from {entry_date}')
                pos, entry_date, entry_price = 'FLAT', '', 0.0
            else:
                row['action'] = 'HOLD' if pos == 'LONG' else 'NONE'
        added.append(row)
        print(f"{d}: IBS {row['ibs_1555'] or '-'} at 15:55, QQQ {row['close_1555'] or '-'}: {row['action']} (now {row['position']})")
    if added:
        new = not os.path.exists(log_path)
        with open(log_path, 'a', newline='') as fh:
            w = csv.DictWriter(fh, FIELDS)
            if new:
                w.writeheader()
            w.writerows(added)
    print('SIGNALS: ' + ('; '.join(signals) if signals else 'none'))
    closed = [float(r['trade_return_after_costs']) for r in rows + added
              if r['action'] == 'SELL' and r['source'] == 'live']
    status = f"open since {entry_date} at {entry_price:.2f}" if pos == 'LONG' else 'flat'
    if closed:
        m = sum(closed) / len(closed)
        wins = sum(1 for x in closed if x > 0) / len(closed)
        print(f'FORWARD TEST: {len(closed)} closed trades, mean {m * 100:+.3f}% after 0.08% costs, '
              f'{wins * 100:.0f}% winners; {status}')
    else:
        print(f'FORWARD TEST: no closed trades yet; {status}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
