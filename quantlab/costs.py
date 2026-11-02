"""Cost model: what one trade pays, in % of notional and in R.

All percentages are percent (0.10 means 0.10%), per unit of notional at 1x.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class CostModel:
    spread_points: float
    slippage_points_per_side: float
    commission_pct_per_side: float
    swap_long_annual_pct: float
    swap_day_count: int = 360
    multiplier: float = 1.0

    @classmethod
    def from_config(cls, cm: dict, multiplier: float = 1.0) -> "CostModel":
        return cls(
            spread_points=float(cm["spread_points"]),
            slippage_points_per_side=float(cm["slippage_points_per_side"]),
            commission_pct_per_side=float(cm["commission_pct_per_side"]),
            swap_long_annual_pct=float(cm["swap_long_annual_pct"]),
            swap_day_count=int(cm.get("swap_day_count", 360)),
            multiplier=multiplier,
        )

    def stressed(self, m: float) -> "CostModel":
        return CostModel(self.spread_points, self.slippage_points_per_side, self.commission_pct_per_side,
                         self.swap_long_annual_pct, self.swap_day_count, self.multiplier * m)

    def breakdown_pct(self, entry_price: float, nights: int) -> dict:
        """Cost of one round trip held `nights` calendar nights, in % of notional.

        Spread: bought at mid + spread/2, sold at mid - spread/2 -> one full spread.
        Slippage: adverse, on both sides. Swap: per calendar night (Fri->Mon = 3).
        """
        m = self.multiplier
        spread = self.spread_points / entry_price * 100 * m
        slip = 2 * self.slippage_points_per_side / entry_price * 100 * m
        comm = 2 * self.commission_pct_per_side * m
        swap = nights * self.swap_long_annual_pct / self.swap_day_count * m
        return {"spread_pct": spread, "slippage_pct": slip, "commission_pct": comm, "swap_pct": swap,
                "total_pct": spread + slip + comm + swap}

    def total_pct(self, entry_price: float, nights: int) -> float:
        return self.breakdown_pct(entry_price, nights)["total_pct"]


def pct_to_r(pct: float, r_unit_pct: float):
    """Express a % return in R, where 1R = r_unit_pct (e.g. ATR14 range in %)."""
    if not r_unit_pct or r_unit_pct <= 0:
        return None
    return pct / r_unit_pct


def cost_share_of_gross(mean_gross_pct: float, mean_cost_pct: float):
    """Share of the gross edge that costs take. >1 means costs exceed the edge.

    Returns None when the gross edge is <= 0 (costs then take 'all of nothing').
    """
    if mean_gross_pct is None or mean_gross_pct <= 0:
        return None
    return mean_cost_pct / mean_gross_pct


def swap_to_pct_per_night(swap_value, swap_mode: str, price: float, contract_size: float,
                          tick_size: float = None, day_count: int = 360):
    """Convert an MT5 swap figure to % of notional per night (negative = you pay).

    Handles the common MT5 swap modes. Returns (pct, note). pct is None when the
    mode can't be converted without more information (e.g. account currency rate).
    """
    if swap_value is None:
        return None, "no swap value"
    mode = (swap_mode or "").upper().replace("SWAP_MODE_", "")
    notional = price * contract_size if price and contract_size else None
    if mode in ("POINTS",):
        if not tick_size or not price:
            return None, "need tick size and price for points"
        return swap_value * tick_size / price * 100, "points x tick size / price"
    if mode in ("CURRENCY_SYMBOL", "CURRENCY_MARGIN"):
        if not notional:
            return None, "need price and contract size"
        return swap_value / notional * 100, "money per lot / notional per lot (symbol currency)"
    if mode in ("CURRENCY_DEPOSIT",):
        if not notional:
            return None, "need price and contract size"
        return swap_value / notional * 100, "money per lot in deposit currency / notional (assumes deposit currency = symbol currency; check)"
    if mode in ("INTEREST_CURRENT", "INTEREST_OPEN"):
        return swap_value / day_count, f"annual % / {day_count}"
    if mode == "DISABLED":
        return 0.0, "swap disabled"
    return None, f"unhandled swap mode {swap_mode!r}"
