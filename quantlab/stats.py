"""Statistics used in reports. Percent in, percent out."""
import math
from statistics import NormalDist

import numpy as np


def t_stat(x) -> float:
    x = np.asarray(x, dtype=float)
    if len(x) < 2:
        return float("nan")
    sd = x.std(ddof=1)
    if sd == 0:
        return float("inf") if x.mean() > 0 else float("-inf") if x.mean() < 0 else 0.0
    return float(x.mean() / (sd / math.sqrt(len(x))))


def p_one_sided(t: float) -> float:
    """Normal approximation to the one-sided p-value (fine for n > ~50)."""
    if math.isnan(t):
        return float("nan")
    return 1 - NormalDist().cdf(t)


def equity_curve(returns_pct) -> np.ndarray:
    r = np.asarray(returns_pct, dtype=float) / 100
    return np.cumprod(1 + r)


def max_drawdown_pct(equity) -> float:
    e = np.concatenate([[1.0], np.asarray(equity, dtype=float)])
    peak = np.maximum.accumulate(e)
    return float(((peak - e) / peak).max() * 100)


def compounded_pct(returns_pct) -> float:
    r = np.asarray(returns_pct, dtype=float) / 100
    return float((np.prod(1 + r) - 1) * 100) if len(r) else 0.0


def bonferroni_t(n_trials: int, alpha: float = 0.05) -> float:
    """t (normal approx.) needed for one-sided family-wise `alpha` over n_trials tries."""
    n = max(1, int(n_trials))
    return NormalDist().inv_cdf(1 - alpha / n)


def multiple_testing_summary(t: float, n_trials: int, alpha: float = 0.05) -> dict:
    p = p_one_sided(t)
    return {
        "n_trials": int(n_trials),
        "alpha": alpha,
        "t": t,
        "p_one_sided": p,
        "p_bonferroni": None if math.isnan(p) else min(1.0, p * n_trials),
        "t_needed_bonferroni": bonferroni_t(n_trials, alpha),
        "warning": (
            f"This is try number {n_trials}. With that many tries, about {alpha * n_trials:.1f} would reach "
            f"p < {alpha} by luck alone, so a t-stat found after many tries is weaker than it looks. "
            f"The t needed for {alpha:.0%} family-wise significance over {n_trials} tries is "
            f"{bonferroni_t(n_trials, alpha):.2f}."
        ),
    }
