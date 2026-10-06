"""生成回放测试用的 fixture：某个交易日的真实 3 秒快照 + 米筐官方 1 分钟线（packages/core/test/ricequantReplay.test.ts 用）。

Usage（仓库根目录，用米筐桥那个 venv 的 Python）:
  python -I packages/core/rq-bridge/build_replay_fixture.py \
    packages/core/test/fixtures/rq-replay-2026-09-30.json.gz 2026-09-30 2026-09-29 600519.SH 000001.SZ 688330.SH
米筐只保留最近一个交易日的 3 秒快照历史，所以 DAY 只能是最近一个交易日。
输出是压缩过的 JSON，不含任何 license 内容。
"""
import gzip, json, math, os, sys
from pathlib import Path
import rqdatac as rq

rq.init(username="license", password=Path(os.path.expanduser("~/.config/kansoku/rq_license")).read_text().strip())
out_path, day, prev_day, *symbols = sys.argv[1:]


def to_rq(s):
    code, suffix = s.split(".")
    return f"{code}.{ {'SH': 'XSHG', 'SZ': 'XSHE'}[suffix] }"


def n(v):
    v = float(v)
    return None if not math.isfinite(v) else round(v, 4)


TICK_COLS = ["last", "open", "high", "low", "volume", "total_turnover", "a1", "b1"]
doc = {"day": day, "prev_day": prev_day, "tick_columns": ["t"] + TICK_COLS, "symbols": {}}
for sym in symbols:
    ob = to_rq(sym)
    ticks = rq.get_ticks(ob, day, day).droplevel(0)
    # 只有最近一个交易日有 tick 历史；前一天的「最后一个快照」用它的日线拼出来
    prev = rq.get_price(ob, prev_day, prev_day, frequency="1d", adjust_type="none", expect_df=True).droplevel(0).iloc[0]
    bars = rq.get_price(ob, day, day, frequency="1m", adjust_type="none", expect_df=True).droplevel(0)
    daybar = rq.get_price(ob, day, day, frequency="1d", adjust_type="none", expect_df=True).droplevel(0).iloc[0]
    first = ticks.iloc[0]
    doc["symbols"][sym] = {
        "prev_close": n(first["prev_close"]),
        "limit_up": n(first["limit_up"]),
        "limit_down": n(first["limit_down"]),
        "prev_day_last_tick": {
            "t": f"{prev_day} 15:00:03",
            "last": n(prev["close"]),
            "volume": n(prev["volume"]),
            "total_turnover": n(prev["total_turnover"]),
        },
        "ticks": [
            [ts.strftime("%H:%M:%S")] + [n(row[c]) for c in TICK_COLS] for ts, row in ticks.iterrows()
        ],
        "bars_1m_columns": ["t", "open", "high", "low", "close", "volume", "total_turnover"],
        "bars_1m": [
            [ts.strftime("%H:%M")] + [n(row[c]) for c in ["open", "high", "low", "close", "volume", "total_turnover"]]
            for ts, row in bars.iterrows()
        ],
        "day_bar": {c: n(daybar[c]) for c in ["open", "high", "low", "close", "volume", "total_turnover"]},
    }
    print(sym, len(ticks), "ticks", len(bars), "bars", file=sys.stderr)

with gzip.open(out_path, "wt", encoding="utf-8") as fh:
    json.dump(doc, fh, separators=(",", ":"))
print(out_path, os.path.getsize(out_path), "bytes", file=sys.stderr)
