"""MetaApi REST access.

`ReadOnlyMetaApi` can only send GET requests. Order placement lives in
`DemoExecutor`, which refuses to act unless MetaApi reports the account as a
DEMO account AND the account id equals QUANTLAB_DEMO_ACC_ID. There is no code
path, flag or setting that sends an order to a real account.
"""
import os
import urllib.parse

import requests

DEMO_MODE = "ACCOUNT_TRADE_MODE_DEMO"


class MetaApiError(RuntimeError):
    pass


class NotConfigured(MetaApiError):
    pass


class RealAccountRefused(MetaApiError):
    pass


def _env_creds():
    token, acc = os.environ.get("META_TOKEN"), os.environ.get("META_ACC_ID")
    if not token or not acc:
        raise NotConfigured("META_TOKEN and META_ACC_ID must be set (see .env.example)")
    return token, acc, os.environ.get("META_REGION", "new-york")


class ReadOnlyMetaApi:
    """GET-only client. Has no method that can change anything on the account."""

    def __init__(self, token=None, account_id=None, region=None, session=None, timeout=20):
        if token is None or account_id is None:
            token, account_id, region = _env_creds()
        self.token, self.account_id, self.region = token, account_id, region or "new-york"
        self.s = session or requests.Session()
        self.timeout = timeout

    def _url(self, path):
        return (f"https://mt-client-api-v1.{self.region}.agiliumtrade.ai/users/current/accounts/"
                f"{self.account_id}{path}")

    def get(self, path, params=None):
        r = self.s.get(self._url(path), headers={"auth-token": self.token, "Accept": "application/json"},
                       params=params, timeout=self.timeout)
        if r.status_code >= 400:
            raise MetaApiError(f"GET {path} -> {r.status_code}: {r.text[:200]}")
        return r.json()

    def account_information(self):
        return self.get("/account-information")

    def symbols(self):
        return self.get("/symbols")

    def specification(self, symbol):
        return self.get(f"/symbols/{urllib.parse.quote(symbol, safe='')}/specification")

    def price(self, symbol):
        return self.get(f"/symbols/{urllib.parse.quote(symbol, safe='')}/current-price")

    def positions(self):
        return self.get("/positions")

    def deals_by_position(self, position_id):
        return self.get(f"/history-deals/position/{urllib.parse.quote(str(position_id), safe='')}")

    def deals_by_time(self, start_iso, end_iso):
        return self.get(f"/history-deals/time/{start_iso}/{end_iso}")


class DemoExecutor:
    """Places market orders ONLY on a verified MetaApi demo account."""

    def __init__(self, ro: ReadOnlyMetaApi, demo_account_id: str = None):
        self.ro = ro
        self.demo_account_id = demo_account_id if demo_account_id is not None else os.environ.get("QUANTLAB_DEMO_ACC_ID")

    def verify_demo(self) -> dict:
        if not self.demo_account_id or self.demo_account_id != self.ro.account_id:
            raise RealAccountRefused("QUANTLAB_DEMO_ACC_ID must be set and equal META_ACC_ID; refusing to trade")
        info = self.ro.account_information()
        if info.get("type") != DEMO_MODE:
            raise RealAccountRefused(f"MetaApi reports account type {info.get('type')!r}, not {DEMO_MODE}; refusing to trade")
        return info

    def _post_trade(self, body):
        self.verify_demo()  # checked on every single order
        r = self.ro.s.post(self.ro._url("/trade"), headers={"auth-token": self.ro.token, "Content-Type": "application/json"},
                           json=body, timeout=self.ro.timeout)
        if r.status_code >= 400:
            raise MetaApiError(f"POST /trade -> {r.status_code}: {r.text[:200]}")
        j = r.json()
        if j.get("numericCode") not in (None, 10008, 10009, 10010):
            raise MetaApiError(f"broker rejected: {j.get('stringCode')} {j.get('message')}")
        return j

    def buy(self, symbol, volume, comment="quantlab-ibs-demo"):
        return self._post_trade({"actionType": "ORDER_TYPE_BUY", "symbol": symbol, "volume": volume, "comment": comment})

    def close(self, position_id, comment="quantlab-ibs-demo"):
        return self._post_trade({"actionType": "POSITION_CLOSE_ID", "positionId": str(position_id), "comment": comment})
