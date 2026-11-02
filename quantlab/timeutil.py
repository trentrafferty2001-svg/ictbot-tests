"""New York clock helpers."""
import datetime as dt
from zoneinfo import ZoneInfo

NY = ZoneInfo("America/New_York")
UTC = dt.timezone.utc


def parse_hhmm(s: str) -> dt.time:
    h, m = s.split(":")
    return dt.time(int(h), int(m))


def now_ny() -> dt.datetime:
    return dt.datetime.now(NY)


def ny_datetime(day: dt.date, t: dt.time) -> dt.datetime:
    return dt.datetime.combine(day, t, tzinfo=NY)


def is_weekday(day: dt.date) -> bool:
    return day.weekday() < 5


def previous_weekday(day: dt.date) -> dt.date:
    d = day - dt.timedelta(days=1)
    while not is_weekday(d):
        d -= dt.timedelta(days=1)
    return d
