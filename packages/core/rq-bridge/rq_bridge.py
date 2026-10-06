"""米筐 rqdatac 行情桥：常驻进程，stdin 一行一个 JSON 请求，stdout 一行一个 JSON 应答。

请求：{"id": 1, "method": "kline", "params": {...}}
应答：{"id": 1, "ok": true, "data": ...} 或 {"id": 1, "ok": false, "error": "..."}

代码统一用 kansoku 的写法（600519.SH / 000001.SZ），进出桥时与米筐的 .XSHG / .XSHE 互转。
时间一律给上海本地时间字符串（"YYYY-MM-DD HH:MM:SS"），分钟线保持米筐的「收盘时刻」标签，
换算成 K 线起点的事交给 TypeScript 那边做（ricequantTime.ts），保证 K 线和实时拼线用同一套规则。

license 从 RQ_LICENSE_FILE（默认 ~/.config/kansoku/rq_license）读取，绝不写进日志或应答。
"""

from __future__ import annotations

import json
import math
import os
import sys
import traceback
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import rqdatac as rq

# 交易日按北京时间算，不跟着 Mac 的时区走
SHANGHAI = ZoneInfo("Asia/Shanghai")
SUFFIX_TO_RQ = {"SH": "XSHG", "SZ": "XSHE"}
SUFFIX_FROM_RQ = {v: k for k, v in SUFFIX_TO_RQ.items()}

# 每个交易日的 K 线根数，用来估算要往前取多少天
BARS_PER_DAY = {"1m": 240, "5m": 48, "15m": 16, "30m": 8, "60m": 4}
PERIODS = {
    "1m": "1m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "60m",
    "60m": "60m",
    "day": "1d",
    "week": "1w",
    "month": "1M",
}

_initialized = False


def log(message: str) -> None:
    print(f"[rq-bridge] {message}", file=sys.stderr, flush=True)


def ensure_init() -> None:
    global _initialized
    if _initialized:
        return
    path = Path(os.environ.get("RQ_LICENSE_FILE", "~/.config/kansoku/rq_license")).expanduser()
    try:
        key = path.read_text().strip()
    except OSError as exc:
        raise RuntimeError(f"读不到米筐 license 文件 {path}：{exc.strerror}") from None
    if not key:
        raise RuntimeError(f"米筐 license 文件 {path} 是空的")
    rq.init(username="license", password=key)
    _initialized = True
    log("rqdatac initialized")


def to_rq(symbol: str) -> str:
    code, _, suffix = symbol.upper().partition(".")
    mapped = SUFFIX_TO_RQ.get(suffix)
    if not mapped:
        raise ValueError(f"米筐只支持沪深 A 股代码（.SH / .SZ），收到 {symbol}")
    return f"{code}.{mapped}"


def from_rq(order_book_id: str) -> str:
    code, _, suffix = order_book_id.partition(".")
    return f"{code}.{SUFFIX_FROM_RQ.get(suffix, suffix)}"


def num(value) -> float | None:
    if value is None:
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if math.isfinite(out) else None


def stamp(value) -> str:
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, date):
        return value.strftime("%Y-%m-%d 00:00:00")
    return str(value)[:19]


def today_cn() -> date:
    return datetime.now(tz=SHANGHAI).date()


def latest_trading_day() -> date:
    today = today_cn()
    if rq.is_trading_date(today):
        return today
    return rq.get_previous_trading_date(today)


def fetch_bars(order_book_id: str, frequency: str, count: int):
    end = latest_trading_day()
    if frequency in BARS_PER_DAY:
        days = math.ceil(count / BARS_PER_DAY[frequency]) + 1
    elif frequency == "1d":
        days = count + 2
    elif frequency == "1w":
        days = count * 5 + 10
    else:  # 1M：拿日线自己按月合并
        days = count * 23 + 25
    start = rq.get_previous_trading_date(end, days)
    fetch_freq = "1d" if frequency == "1M" else frequency
    df = rq.get_price(
        order_book_id,
        start_date=start,
        end_date=end,
        frequency=fetch_freq,
        adjust_type="pre",
        expect_df=True,
    )
    if df is None or df.empty:
        return []
    df = df.droplevel(0) if df.index.nlevels > 1 else df
    if frequency == "1M":
        df = (
            df.groupby([df.index.year, df.index.month])
            .agg(
                {
                    "open": "first",
                    "high": "max",
                    "low": "min",
                    "close": "last",
                    "volume": "sum",
                    "total_turnover": "sum",
                }
            )
            .assign(label=df.index.to_series().groupby([df.index.year, df.index.month]).max().values)
            .set_index("label")
        )
    df = df.tail(count)
    rows = []
    for ts, row in df.iterrows():
        rows.append(
            {
                "t": stamp(ts.to_pydatetime() if hasattr(ts, "to_pydatetime") else ts),
                "open": num(row["open"]),
                "high": num(row["high"]),
                "low": num(row["low"]),
                "close": num(row["close"]),
                "volume": num(row["volume"]) or 0,
                "turnover": num(row.get("total_turnover")) or 0,
            }
        )
    return rows


def m_ping(_params):
    quota = rq.user.get_quota()
    return {
        "rqdatac": rq.__version__,
        "license_type": quota.get("license_type"),
        "remaining_days": quota.get("remaining_days"),
        "bytes_used": quota.get("bytes_used"),
        "bytes_limit": quota.get("bytes_limit"),
    }


def m_kline(params):
    period = str(params["period"])
    frequency = PERIODS.get(period)
    if not frequency:
        raise ValueError(f"米筐不支持的周期 {period}")
    count = max(1, min(int(params.get("count", 200)), 5000))
    return fetch_bars(to_rq(params["symbol"]), frequency, count)


def m_snapshot(params):
    symbols = list(params["symbols"])
    if not symbols:
        return []
    ids = [to_rq(s) for s in symbols]
    snaps = rq.current_snapshot(ids)
    if not isinstance(snaps, list):
        snaps = [snaps]
    out = []
    for snap in snaps:
        if snap is None:
            continue
        out.append(
            {
                "symbol": from_rq(snap.order_book_id),
                "datetime": stamp(snap.datetime),
                "last": num(snap.last),
                "prev_close": num(snap.prev_close),
                "open": num(snap.open),
                "high": num(snap.high),
                "low": num(snap.low),
                "volume": num(snap.volume) or 0,
                "turnover": num(snap.total_turnover) or 0,
                "limit_up": num(getattr(snap, "limit_up", None)),
                "limit_down": num(getattr(snap, "limit_down", None)),
                "bids": [num(x) for x in (snap.bids or [])],
                "bid_vols": [num(x) for x in (snap.bid_vols or [])],
                "asks": [num(x) for x in (snap.asks or [])],
                "ask_vols": [num(x) for x in (snap.ask_vols or [])],
            }
        )
    return out


def m_names(params):
    out = []
    for symbol in params["symbols"]:
        try:
            inst = rq.instruments(to_rq(symbol))
        except ValueError:
            inst = None
        if inst is not None:
            out.append({"symbol": symbol, "name": inst.symbol})
    return out


def m_flow(params):
    order_book_id = to_rq(params["symbol"])
    day = latest_trading_day()
    df = rq.get_capital_flow(order_book_id, start_date=day, end_date=day, frequency="1m")
    if df is None or df.empty:
        return []
    df = df.droplevel(0) if df.index.nlevels > 1 else df
    rows = []
    cumulative = 0.0
    for ts, row in df.iterrows():
        cumulative += (num(row["buy_value"]) or 0) - (num(row["sell_value"]) or 0)
        rows.append({"t": stamp(ts.to_pydatetime()), "inflow": round(cumulative, 2)})
    return rows



def m_flow_totals(params):
    """一批股票当天的主力净流入合计（买入额 − 卖出额），首页一次取完，不逐只排队。"""
    ids = [to_rq(s) for s in params["symbols"]]
    if not ids:
        return {}
    day = latest_trading_day()
    df = rq.get_capital_flow(ids, start_date=day, end_date=day, frequency="1m")
    if df is None or df.empty:
        return {}
    net = (df["buy_value"].fillna(0) - df["sell_value"].fillna(0)).groupby(level=0).sum()
    return {from_rq(order_book_id): round(float(value), 2) for order_book_id, value in net.items()}


def m_profiles(params):
    """名称 + 申万一级行业，首页全景按行业分组用。"""
    ids = [to_rq(s) for s in params["symbols"]]
    out: dict[str, dict] = {}
    if not ids:
        return out
    found = rq.instruments(ids) or []
    for inst in found if isinstance(found, list) else [found]:
        out.setdefault(from_rq(inst.order_book_id), {})["name"] = inst.symbol
    df = rq.get_instrument_industry(ids, source="sws", level=1)
    if df is not None and not df.empty:
        for order_book_id, row in df.iterrows():
            industry = row.get("first_industry_name")
            if isinstance(industry, str) and industry:
                out.setdefault(from_rq(order_book_id), {})["industry"] = industry
    return out


def m_news(params):
    order_book_id = to_rq(params["symbol"])
    limit = max(1, min(int(params.get("limit", 6)), 50))
    end = today_cn()
    df = rq.get_announcement(order_book_id, start_date=end - timedelta(days=120), end_date=end)
    if df is None or df.empty:
        return []
    df = df.sort_values("create_tm", ascending=False).head(limit)
    rows = []
    for _, row in df.iterrows():
        link = row.get("announcement_link") or ""
        created = row.get("create_tm")
        rows.append(
            {
                # 同一个链接会被多条公告复用（比如交易所的大宗交易汇总页），id 必须带上时间和标题
                "id": f"{order_book_id}:{stamp(created)}:{row.get('title')}",
                "title": row.get("title") or "",
                "t": stamp(created.to_pydatetime() if hasattr(created, "to_pydatetime") else created),
                "url": link,
            }
        )
    return rows


def m_market_caps(params):
    symbols = list(params["symbols"])
    if not symbols:
        return {}
    day = rq.get_previous_trading_date(today_cn() + timedelta(days=1))
    df = rq.get_factor([to_rq(s) for s in symbols], "market_cap_3", day, day)
    caps = {}
    if df is None or df.empty:
        return caps
    for (order_book_id, _), row in df.iterrows():
        value = num(row["market_cap_3"])
        if value and value > 0:
            caps[from_rq(order_book_id)] = value
    return caps


METHODS = {
    "ping": m_ping,
    "kline": m_kline,
    "snapshot": m_snapshot,
    "names": m_names,
    "flow": m_flow,
    "flow_totals": m_flow_totals,
    "profiles": m_profiles,
    "news": m_news,
    "market_caps": m_market_caps,
}


def handle(line: str) -> dict:
    try:
        request = json.loads(line)
    except json.JSONDecodeError as exc:
        return {"id": None, "ok": False, "error": f"bad request json: {exc}"}
    req_id = request.get("id")
    method = METHODS.get(request.get("method"))
    if method is None:
        return {"id": req_id, "ok": False, "error": f"unknown method {request.get('method')}"}
    try:
        ensure_init()
        return {"id": req_id, "ok": True, "data": method(request.get("params") or {})}
    except Exception as exc:  # noqa: BLE001 — 任何失败都要回给调用方，不能让进程退出
        log(f"{request.get('method')} failed: {traceback.format_exc(limit=3)}")
        return {"id": req_id, "ok": False, "error": f"{type(exc).__name__}: {exc}"}


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        response = handle(line)
        sys.stdout.write(json.dumps(response, ensure_ascii=False, allow_nan=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
