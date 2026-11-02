"""Render a run's verdict report from templates/verdict_template.md."""
import math

from .paths import REPO_ROOT

TEMPLATE = REPO_ROOT / "templates" / "verdict_template.md"


def _f(x, fmt="{:+.3f}", none="—"):
    if x is None or (isinstance(x, float) and math.isnan(x)):
        return none
    return fmt.format(x)


def render(context: dict) -> str:
    text = TEMPLATE.read_text(encoding="utf-8")
    for k, v in context.items():
        text = text.replace("{{" + k + "}}", str(v))
    return text


def checks_table(checks: list) -> str:
    rows = ["| ID | Rule | Pre-registered threshold | Result | Pass? |", "|---|---|---|---|---|"]
    for c in checks:
        rows.append(f"| {c['id']} | {c['rule']} | {c['threshold']} | {c['value']} | {'yes' if c['pass'] else '**no**'} |")
    return "\n".join(rows)


def forward_thresholds(th: dict) -> str:
    return "\n".join([
        f"- F1: at least {th['F1_min_closed_trades']} closed demo trades after the forward start (fewer: Insufficient evidence)",
        f"- F2: mean net return per demo trade > {th['F2_min_mean_net_pct']}%, using actual fills, swap and commission",
        f"- F3: actual cost per trade <= {th['F3_max_cost_ratio']}x the modelled cost",
        f"- F4: the config hash is unchanged for the whole forward period: {th['F4_config_unchanged']}",
    ])


def results_table(ev: dict) -> str:
    keys = [
        ("trades", "Trades", "{:d}"), ("win_rate_pct", "Win rate %", "{:.1f}"),
        ("avg_win_pct", "Average win %", "{:+.3f}"), ("avg_loss_pct", "Average loss %", "{:+.3f}"),
        ("mean_gross_pct", "Mean gross per trade %", "{:+.3f}"), ("mean_cost_pct", "Mean cost per trade %", "{:.3f}"),
        ("expectancy_net_pct", "Expectancy after costs %", "{:+.3f}"),
        ("expectancy_net_r", "Expectancy after costs (R)", "{:+.3f}"), ("t_stat", "t-stat (net)", "{:.2f}"),
        ("stressed_mean_net_pct", "Mean net, costs x stress %", "{:+.3f}"),
        ("total_return_pct", "Compounded return % (1x)", "{:+.1f}"), ("max_drawdown_pct", "Max drawdown %", "{:.1f}"),
        ("worst_trade_pct", "Worst trade %", "{:+.2f}"), ("exposure_pct_of_days", "Exposure % of days", "{:.1f}"),
        ("turnover_x_equity_per_year", "Turnover (x equity / year)", "{:.0f}"),
    ]
    P = ev["periods"]
    names = [("in_sample", "In-sample"), ("out_of_sample", "Out-of-sample"), ("full", "Full")]
    rows = ["| Metric | " + " | ".join(n for _, n in names) + " |", "|---|" + "---|" * len(names)]
    for k, label, fmt in keys:
        vals = []
        for p, _ in names:
            v = P[p]["strategy"].get(k)
            vals.append(_f(v, fmt) if v is not None else "—")
        rows.append(f"| {label} | " + " | ".join(vals) + " |")
    for k, label, fmt in [("index_return_pct", "Buy-and-hold index return %", "{:+.1f}"),
                          ("index_max_drawdown_pct", "Buy-and-hold index max DD %", "{:.1f}"),
                          ("cfd_return_pct", "Buy-and-hold CFD return % (with swap)", "{:+.1f}"),
                          ("cfd_max_drawdown_pct", "Buy-and-hold CFD max DD %", "{:.1f}")]:
        rows.append(f"| {label} | " + " | ".join(_f(P[p]["buy_and_hold"].get(k), fmt) for p, _ in names) + " |")
    rows.append("| Snapshot days / weekdays | " + " | ".join(
        f"{P[p]['snapshot_days']} / {P[p]['weekdays']}" for p, _ in names) + " |")
    return "\n".join(rows)


def yearly(m: dict) -> str:
    y = m.get("yearly") or {}
    if not y:
        return "No trades."
    rows = ["| Year | Trades | Net return % | Mean net per trade % |", "|---|---|---|---|"]
    for yr in sorted(y):
        v = y[yr]
        rows.append(f"| {yr} | {v['trades']} | {v['return_pct']:+.2f} | {v['mean_net_pct']:+.3f} |")
    return "\n".join(rows)


def controls(ev: dict) -> str:
    rows = ["| Period | Strategy mean net % | Controls mean % | Controls 5th–95th pct % | Strategy percentile |",
            "|---|---|---|---|---|"]
    for p, label in (("in_sample", "In-sample"), ("out_of_sample", "Out-of-sample")):
        c = ev["periods"][p].get("random_controls")
        s = ev["periods"][p]["strategy"]
        if not c:
            rows.append(f"| {label} | — | — | — | — |")
            continue
        rows.append(f"| {label} | {s['expectancy_net_pct']:+.3f} | {c['mean_of_means_pct']:+.3f} | "
                    f"{c['p5_pct']:+.3f} to {c['p95_pct']:+.3f} | {c['strategy_percentile']:.1f}% |"
                    + (" (overlap fallback)" if c["overlap_fallback"] else ""))
    return "\n".join(rows)


def costs_section(ev: dict, cm: dict) -> str:
    s = ev["periods"]["out_of_sample"]["strategy"]
    if not s.get("trades"):
        return "No out-of-sample trades."
    b = s["cost_breakdown_pct"]
    share = s.get("cost_share_of_gross")
    return "\n".join([
        f"Cost model `{cm['name']}`: spread {cm['spread_points']} pts, slippage {cm['slippage_points_per_side']} pts a side, "
        f"commission {cm['commission_pct_per_side']}% a side, long swap {cm['swap_long_annual_pct']}% a year "
        f"(/{cm['swap_day_count']} per calendar night). These are estimates until `quantlab costs` measures them.",
        "",
        "| Out-of-sample, per trade | % of notional |", "|---|---|",
        f"| Spread | {b['spread_pct']:.4f} |", f"| Slippage | {b['slippage_pct']:.4f} |",
        f"| Commission | {b['commission_pct']:.4f} |", f"| Swap | {b['swap_pct']:.4f} |",
        f"| **Total cost** | **{s['mean_cost_pct']:.4f}** ({_f(s.get('mean_cost_r'), '{:.3f}')} R) |",
        f"| Gross edge (mean gross) | {s['mean_gross_pct']:+.4f} |",
        f"| Share of gross edge taken by costs | {_f(share, '{:.0%}', 'n/a (gross edge <= 0)')} |",
    ])


def multiple_testing(mt: dict) -> str:
    return "\n".join([
        f"- Tries counted so far, including this one: **{mt['n_trials']}**",
        f"- Out-of-sample t-stat: {_f(mt['t'], '{:.2f}')}; one-sided p (normal approx.): {_f(mt['p_one_sided'], '{:.4f}')}",
        f"- Bonferroni-adjusted p: {_f(mt['p_bonferroni'], '{:.4f}')}; t needed for {mt['alpha']:.0%} family-wise: "
        f"{mt['t_needed_bonferroni']:.2f}",
        f"- **Warning:** {mt['warning']}",
        "- The pass rule uses the pre-registered t threshold, not the Bonferroni one; both are shown so the reader can weigh it.",
    ])


LIMITS = """- The 2015–2026 history was already examined by earlier IBS work, and IBS on US indices is published. Its "out-of-sample" split is not clean; only the forward log and demo fills after the config commit are.
- Prices are NSXUSD 1-minute bars (index/CFD-like quotes, treated as mid), not XM's own US100Cash# feed.
- Drawdown is measured at trade exits; intraday and overnight drawdown inside a trade is larger.
- The t-stat and p-values use a normal approximation and assume independent trades.
- Costs are a fixed model; the swap rate is applied to every year although financing was near zero in 2015–2021 (harsher than history).
- No partial fills, gaps through stops (there is no stop), broker outages or requotes are modelled."""


def what_would_change(historical: str, cfg: dict) -> str:
    th, fw = cfg["pass_thresholds"]["historical"], cfg["pass_thresholds"]["forward"]
    lines = []
    if historical == "Fail":
        lines += [
            "- Nothing done to this config can change a Fail: re-running with altered settings is a new config, a new trial, and counts against the multiple-testing bar.",
            "- A different, pre-registered rule tested on data it has not seen (forward data) could produce new evidence; it would not rescue this one.",
        ]
    elif historical == "Insufficient evidence":
        lines += [
            f"- More data in the same pre-registered rule: at least {th['H1_min_trades']} out-of-sample trades, "
            f">= {th['min_day_coverage']:.0%} snapshot coverage, and >= 3 years with {th['H4_min_trades_per_year']}+ trades.",
            f"- Or forward data: {fw['F1_min_closed_trades']}+ closed demo trades judged by F1–F4.",
        ]
    else:
        lines += ["- Historical pass is in place. To move the real-money verdict:"]
    lines += [
        f"- Forward evidence (required for any real-money Pass): >= {fw['F1_min_closed_trades']} closed demo trades on "
        f"`{cfg['market']['execution_symbol']}` after {cfg['sample_split']['forward_start']}, mean net > {fw['F2_min_mean_net_pct']}% "
        f"from actual fills, swap and commission, actual cost <= {fw['F3_max_cost_ratio']}x modelled, and no config change.",
        "- Measured costs (`quantlab costs` at 15:55 New York over >= 20 sessions) that differ from the model: a re-run with the measured cost model is a new config id, reported next to this one, never replacing it.",
        "- Evidence that would turn a Pass into a Fail: forward mean net <= 0, actual costs above 1.5x the model, or any rule change during the forward period.",
    ]
    return "\n".join(lines)


def engineering_status(preregistered: bool) -> str:
    first = ("- Pre-registered config validated, hashed, and confirmed committed and unmodified in git before the run."
             if preregistered else
             "- DRY RUN: config validated and hashed, but NOT confirmed as committed/registered. Nothing was recorded; not evidence.")
    rest = _ENGINEERING_REST if preregistered else "\n".join(
        l for l in _ENGINEERING_REST.splitlines() if not l.startswith("- Record written"))
    return first + "\n" + rest


_ENGINEERING_REST = """- Rule, costs, metrics, random controls and buy-and-hold computed by `quantlab.backtest` (unit-tested on synthetic data).
- Record written once (`open(..., 'x')`), read-only, with a SHA-256 sidecar; INDEX.csv appended.
- This section says whether the machinery works. It says nothing about whether the strategy makes money."""


def profitability_status(historical: str, real: str) -> str:
    return (f"- Historical: **{historical}**. Real money: **{real}**.\n"
            "- No claim of profitability is made unless both are Pass, and even then only for the tested rule, "
            "market, cost model and period.")
