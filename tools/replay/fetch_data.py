#!/usr/bin/env python3
"""Download XAUUSD 1-minute bid bars for the replay.

Writes tools/replay/data/xauusd-<name>.csv.gz with the header
timestamp,open,high,low,close,volume (timestamp in ms, UTC).

Sources, tried in this order:
  1. Dukascopy's public datafeed: one LZMA file of minute candles per day.
  2. HistData.com's free 1-minute files (New York time, converted to UTC
     here; see ny_utc_offset).

Added 2026-10-24: the dukascopy-node package now needs a browser token from
Dukascopy's web firewall, which GitHub's runners can't get ("WafTokenError ...
HTTP 503"). Only the Python standard library is used, so nothing has to be
installed. Every outcome is also printed as a GitHub annotation, because plain
log lines can't be read outside GitHub's own pages.

Usage: python3 tools/replay/fetch_data.py --from 2023-12-17 --to 2024-04-03 --name 2024-03
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import gzip
import http.cookiejar
import io
import lzma
import os
import re
import struct
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

# Markets (added 2026-10-30): Dukascopy's name, HistData's name, the range a
# typical price must fall in (to pick Dukascopy's price scale), and whether the
# gold-style daily-break time-zone check applies.
INSTRUMENTS = {
    'xauusd': {'duka': 'XAUUSD', 'hd': 'xauusd', 'px': (600, 8000), 'tzcheck': True},
    'nsxusd': {'duka': 'USATECHIDXUSD', 'hd': 'nsxusd', 'px': (1000, 40000), 'tzcheck': True},   # Nasdaq 100
    'grxeur': {'duka': 'DEUIDXEUR', 'hd': 'grxeur', 'px': (4000, 40000), 'tzcheck': False},      # DAX
    'btcusd': {'duka': 'BTCUSD', 'hd': None, 'px': (100, 400000), 'tzcheck': False},             # Bitcoin (HistData has none)
    # Daily trend portfolio (2026-10-30)
    'xagusd': {'duka': 'XAGUSD', 'hd': 'xagusd', 'px': (5, 150), 'tzcheck': False},              # silver
    'wtiusd': {'duka': 'LIGHTCMDUSD', 'hd': 'wtiusd', 'px': (5, 200), 'tzcheck': False},         # US (WTI) oil
    'spxusd': {'duka': 'USA500IDXUSD', 'hd': 'spxusd', 'px': (500, 12000), 'tzcheck': False},    # S&P 500
    'eurusd': {'duka': 'EURUSD', 'hd': 'eurusd', 'px': (0.8, 1.8), 'tzcheck': False},
    'gbpusd': {'duka': 'GBPUSD', 'hd': 'gbpusd', 'px': (1.0, 2.3), 'tzcheck': False},
    'usdjpy': {'duka': 'USDJPY', 'hd': 'usdjpy', 'px': (60, 200), 'tzcheck': False},
    'audusd': {'duka': 'AUDUSD', 'hd': 'audusd', 'px': (0.4, 1.2), 'tzcheck': False},
}
INST = INSTRUMENTS['xauusd']

UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
UTC = dt.timezone.utc


def annot(level, title, msg):
    msg = str(msg).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')[:900]
    print(f'::{level} title={title}::{msg}', flush=True)


def fetch(url, data=None, headers=None, opener=None, timeout=60):
    req = urllib.request.Request(url, data=data, headers={'User-Agent': UA, **(headers or {})})
    with (opener or urllib.request.build_opener()).open(req, timeout=timeout) as r:
        return r.read(), r.headers.get('Content-Type', '')


# ── 1. Dukascopy datafeed ──────────────────────────────────────────────────
# Day file: /datafeed/XAUUSD/<year>/<month-1, 2 digits>/<day>/BID_candles_min_1.bi5
# LZMA-compressed records of 24 bytes: seconds into the day, then four prices
# as integers in thousandths of a dollar, then volume as a float.
def dukascopy_day(day):
    url = f'https://datafeed.dukascopy.com/datafeed/{INST["duka"]}/{day.year}/{day.month - 1:02d}/{day.day:02d}/BID_candles_min_1.bi5'
    err = None
    for attempt in range(4):
        try:
            body, ctype = fetch(url, timeout=40)
            if not body:
                return []
            if body[:1] == b'<' or 'html' in ctype:
                raise RuntimeError('got a web page instead of data (blocked?): ' + body[:120].decode('utf-8', 'replace'))
            raw = lzma.decompress(body)
            base = int(dt.datetime(day.year, day.month, day.day, tzinfo=UTC).timestamp())
            return [(base + rec[0],) + rec[1:] for rec in struct.iter_unpack('>IIIIIf', raw[: len(raw) - len(raw) % 24])]
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return []
            err = f'HTTP {e.code}'
        except Exception as e:  # noqa: BLE001 — every failure is reported below
            err = f'{type(e).__name__}: {e}'
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'{url} → {err}')


def from_dukascopy(start, end):
    days = [start + dt.timedelta(days=i) for i in range((end - start).days)]
    if INST['duka'] != 'BTCUSD':
        days = [d for d in days if d.weekday() != 5]  # no trading on Saturdays (bitcoin trades every day)
    raw = {}
    with cf.ThreadPoolExecutor(max_workers=4) as pool:
        for d, recs in zip(days, pool.map(dukascopy_day, days)):
            raw[d] = recs
    recs = [r for d in days for r in raw[d]]
    if not recs:
        raise RuntimeError('no bars at all')
    # The four price fields are documented as open, close, low, high. Check
    # against the data itself rather than trusting that: high must be the top
    # and low the bottom of every bar.
    def consistent(order):
        ok = 0
        for r in recs[:5000]:
            o, h, l, c = (r[1 + i] for i in order)
            ok += h >= max(o, c) and l <= min(o, c)
        return ok / min(len(recs), 5000)
    best = max([(0, 3, 2, 1), (0, 1, 2, 3)], key=consistent)  # (o,c,l,h) as stored, or (o,h,l,c)
    share = consistent(best)
    if share < 0.98:
        raise RuntimeError(f'bars look inconsistent (high/low fit only {share:.0%})')
    # Prices are stored as integers; gold is expected in thousandths of a
    # dollar. Pick the scale that puts the typical price where gold has
    # actually traded since 2010 ($1,000-$6,000) instead of assuming it.
    closes = sorted(r[1 + best[3]] for r in recs[:: max(1, len(recs) // 2000)])
    median = closes[len(closes) // 2]
    lo_px, hi_px = INST['px']
    scale = next((s for s in (1000, 100000, 100, 10000, 10, 1) if lo_px <= median / s <= hi_px), None)
    if scale is None:
        raise RuntimeError(f'cannot tell the price scale (typical raw close {median})')
    out = []
    for r in recs:
        o, h, l, c = (r[1 + i] / scale for i in best)
        out.append((r[0] * 1000, o, h, l, c, round(r[5], 4)))
    return out


# ── 2. HistData.com ────────────────────────────────────────────────────────
# One zip per past year, or per month for the current year. The download
# form carries a token, so read the page first (with its cookies), then post.
def histdata_file(year, month=None):
    err = None
    for attempt in range(4):
        try:
            return _histdata_file(year, month)
        except Exception as e:  # noqa: BLE001 — retried, then reported
            err = e
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f'HistData {year}{"-%02d" % month if month else ""}: {type(err).__name__}: {err}')


def _histdata_file(year, month=None):
    if not INST['hd']:
        raise RuntimeError('HistData has no files for this market')
    page = 'https://www.histdata.com/download-free-forex-historical-data/?/ascii/1-minute-bar-quotes/' + INST['hd'] + '/' + (f'{year}/{month}' if month else f'{year}')
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    html = fetch(page, opener=opener)[0].decode('utf-8', 'replace')
    form = {}
    for tag in re.findall(r'<input[^>]+>', html):
        name = re.search(r'name="([^"]+)"', tag)
        value = re.search(r'value="([^"]*)"', tag)
        if name:
            form[name.group(1)] = value.group(1) if value else ''
    if not form.get('tk'):
        raise RuntimeError(f'no download token on {page}')
    body, _ = fetch('https://www.histdata.com/get.php', data=urllib.parse.urlencode(form).encode(), opener=opener, timeout=180,
                    headers={'Referer': page, 'Content-Type': 'application/x-www-form-urlencoded'})
    z = zipfile.ZipFile(io.BytesIO(body))
    name = next(n for n in z.namelist() if n.lower().endswith('.csv'))
    out = []
    for line in z.read(name).decode('utf-8', 'replace').splitlines():
        p = line.strip().split(';')  # 20230102 180000;open;high;low;close;volume
        if len(p) < 5 or not p[0][:1].isdigit():
            continue
        local = dt.datetime.strptime(p[0], '%Y%m%d %H%M%S')
        t = (local + dt.timedelta(hours=ny_utc_offset(local))).replace(tzinfo=UTC)
        out.append((int(t.timestamp() * 1000), float(p[1]), float(p[2]), float(p[3]), float(p[4]), float(p[5]) if len(p) > 5 and p[5] else 0.0))
    return out


def ny_utc_offset(local):
    """Hours to add to New York wall-clock time to get UTC: 4 in daylight
    saving (2nd Sunday of March 02:00 to 1st Sunday of November 02:00), else 5.

    HistData says its times are EST without daylight saving, but in its XAUUSD
    files gold's daily break (17:00-18:00 New York) sits at 17:00 on its clock
    in summer as well as winter, which only happens if the clock follows New
    York daylight saving. Converting with a fixed 5 hours put every summer bar
    an hour late (seen in the 2015-2024 run on 2026-10-24).
    """
    y = local.year
    mar1, nov1 = dt.datetime(y, 3, 1), dt.datetime(y, 11, 1)
    dst_start = mar1 + dt.timedelta(days=(6 - mar1.weekday()) % 7 + 7, hours=2)
    dst_end = nov1 + dt.timedelta(days=(6 - nov1.weekday()) % 7, hours=2)
    return 4 if dst_start <= local < dst_end else 5


def from_histdata(start, end):
    this_year = dt.datetime.now(UTC).year
    rows = []
    for y in range(start.year, end.year + 1):
        if y < this_year:
            rows += histdata_file(y)
        else:
            for m in range(1, 13):
                if dt.datetime(y, m, 1, tzinfo=UTC) >= end:
                    break
                if dt.datetime(y, m, 1, tzinfo=UTC) + dt.timedelta(days=31) < start:
                    continue
                rows += histdata_file(y, m)
        time.sleep(1)
    lo, hi = start.timestamp() * 1000, end.timestamp() * 1000
    return [r for r in rows if lo <= r[0] < hi]


# ── 3. Bitstamp BTC/USD minutes, from a public GitHub dataset ─────────────
# (github.com/ff137/bitstamp-btcusd-minute-data: 1-minute OHLCV since 2012,
# one history file plus a file of recent updates). Columns are read from the
# header; timestamps in seconds or milliseconds, UTC.
BITSTAMP = ['https://raw.githubusercontent.com/ff137/bitstamp-btcusd-minute-data/main/data/historical/btcusd_bitstamp_1min_2012-2025.csv.gz',
            'https://raw.githubusercontent.com/ff137/bitstamp-btcusd-minute-data/main/data/updates/btcusd_bitstamp_1min_latest.csv']


def from_bitstamp(start, end):
    lo, hi = start.timestamp() * 1000, end.timestamp() * 1000
    rows, errs = [], []
    for url in BITSTAMP:
        try:
            body, _ = fetch(url, timeout=600)
        except Exception as e:  # noqa: BLE001
            errs.append(f'{url.rsplit("/", 1)[-1]}: {type(e).__name__}: {e}')
            continue
        if url.endswith('.gz'):
            body = gzip.decompress(body)
        lines = body.decode('utf-8', 'replace').splitlines()
        head = [h.strip().lower() for h in lines[0].split(',')] if lines else []
        col = {k: next((i for i, h in enumerate(head) if h == k or h.startswith(k)), None) for k in ('timestamp', 'open', 'high', 'low', 'close', 'volume')}
        if col['timestamp'] is None:
            col['timestamp'] = next((i for i, h in enumerate(head) if h in ('time', 'unix', 'date')), 0)
        if None in (col['open'], col['high'], col['low'], col['close']):
            errs.append(f'unexpected columns {head[:8]}')
            continue
        for line in lines[1:]:
            p = line.split(',')
            try:
                t = float(p[col['timestamp']])
                t = t if t > 1e12 else t * 1000
                if lo <= t < hi:
                    rows.append((int(t), float(p[col['open']]), float(p[col['high']]), float(p[col['low']]), float(p[col['close']]),
                                 float(p[col['volume']]) if col['volume'] is not None and p[col['volume']] else 0.0))
            except (ValueError, IndexError):
                continue
    if not rows:
        raise RuntimeError('no bars: ' + ' | '.join(errs))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from', dest='start', required=True)
    ap.add_argument('--to', dest='end', required=True)
    ap.add_argument('--name', required=True)
    ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data'))
    ap.add_argument('--source', choices=['auto', 'dukascopy', 'histdata', 'bitstamp'], default='auto')
    ap.add_argument('--instrument', choices=sorted(INSTRUMENTS), default='xauusd')
    a = ap.parse_args()
    global INST
    INST = INSTRUMENTS[a.instrument]
    start = dt.datetime.strptime(a.start, '%Y-%m-%d').replace(tzinfo=UTC)
    end = min(dt.datetime.strptime(a.end, '%Y-%m-%d').replace(tzinfo=UTC), dt.datetime.now(UTC) - dt.timedelta(days=1))
    out_file = os.path.join(a.out, f'{a.instrument}-{a.name}.csv.gz')
    if os.path.exists(out_file) and os.path.getsize(out_file) > 100000:
        print('cached:', out_file)
        return 0
    os.makedirs(a.out, exist_ok=True)
    need = 20000 if (end - start).days < 200 else 50000
    tried = []
    sources = (('Bitstamp', from_bitstamp), ('Dukascopy', from_dukascopy)) if a.instrument == 'btcusd' else (('Dukascopy', from_dukascopy), ('HistData', from_histdata))
    for source, fn in sources:
        if a.source != 'auto' and a.source != source.lower():
            continue
        t0 = time.time()
        try:
            rows = sorted(set(fn(start, end)))
        except Exception as e:  # noqa: BLE001
            tried.append(f'{source}: {type(e).__name__}: {str(e)[:300]}')
            annot('warning', f'{source} failed', tried[-1])
            continue
        if len(rows) < need:
            tried.append(f'{source}: only {len(rows)} bars')
            annot('warning', f'{source} too little data', tried[-1])
            continue
        per_month = {}
        for r in rows:
            k = dt.datetime.fromtimestamp(r[0] / 1000, UTC).strftime('%Y-%m')
            per_month[k] = per_month.get(k, 0) + 1
        mid = rows[len(rows) // 2]
        # Time-zone check: gold's daily break is 17:00-18:00 New York time, so
        # on weekdays the emptiest UTC hour should be 22 in New York winter
        # and 21 in summer. A wrong conversion shows up as another hour.
        def emptiest(months):
            counts = [0] * 24
            for r in rows:
                t = dt.datetime.fromtimestamp(r[0] / 1000, UTC)
                if t.month in months and t.weekday() < 4:
                    counts[t.hour] += 1
            return (min(range(24), key=lambda h: counts[h]), sum(counts)) if sum(counts) else (None, 0)
        (win_h, win_n), (sum_h, sum_n) = emptiest({12, 1, 2}), emptiest({6, 7, 8})
        tz_ok = not INST['tzcheck'] or ((win_n == 0 or win_h == 22) and (sum_n == 0 or sum_h == 21))
        annot('notice' if tz_ok else 'warning', 'Time-zone check',
              f'daily break found at {win_h if win_n else "-"}:00 UTC in winter (expected 22) and {sum_h if sum_n else "-"}:00 UTC in summer (expected 21)'
              + ('' if tz_ok else ': the timestamps may be shifted, so session and daily-break rules would be tested at the wrong times'))
        # Bars per UTC hour on weekdays (Jan and Jul): shows each market's
        # session and daily break, to check the time zone by eye.
        for mon in (1, 7):
            hc = [0] * 24
            for r in rows:
                t = dt.datetime.fromtimestamp(r[0] / 1000, UTC)
                if t.month == mon and t.weekday() < 5:
                    hc[t.hour] += 1
            if sum(hc):
                annot('notice', f'Bars per UTC hour, month {mon}', ' '.join(f'{h}:{n}' for h, n in enumerate(hc)))
        with gzip.open(out_file, 'wt') as f:
            f.write('timestamp,open,high,low,close,volume\n')
            for r in rows:
                f.write('%d,%.3f,%.3f,%.3f,%.3f,%s\n' % r)
        annot('notice', 'Price data', f'{len(rows)} M1 bars from {source} in {time.time() - t0:.0f}s; mid-period bar '
              f'{dt.datetime.fromtimestamp(mid[0] / 1000, UTC):%Y-%m-%d %H:%M} close {mid[4]:.2f}. Per month: '
              + ', '.join(f'{k} {v}' for k, v in sorted(per_month.items())))
        print('wrote', out_file, len(rows), 'bars')
        return 0
    annot('error', 'Price download failed', ' || '.join(tried) or 'no source tried')
    return 1


if __name__ == '__main__':
    sys.exit(main())
