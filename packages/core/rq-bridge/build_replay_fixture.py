"""生成回放测试用的 fixture：某个交易日的真实 3 秒快照 + 米筐官方 1 分钟线（packages/core/test/ricequantReplay.test.ts 用）。

Usage（仓库根目录，用米筐桥那个 venv 的 Python）:
  python -I packages/core/rq-bridge/build_replay_fixture.py \
    packages/core/test/fixtures/rq-replay-2026-09-30.json.gz 2026-09-30 2026-09-29 600519.SH 000001.SZ 688330.SH

  # 用 App 当天录下的快照（KANSOKU_RQ_RECORD_SYMBOLS 打开的录盘）代替米筐 tick 历史：
  python -I packages/core/rq-bridge/build_replay_fixture.py --recording ~/.cache/kansoku/rq-record/snapshots-2026-10-08.jsonl \
    /tmp/rq-replay-2026-10-08.json.gz 2026-10-08 2026-09-30 600519.SH 000001.SZ
  然后：RQ_REPLAY_FIXTURE=/tmp/rq-replay-2026-10-08.json.gz pnpm --filter @kansoku/core exec vitest run test/ricequantReplay.test.ts

米筐只保留最近一个交易日的 3 秒快照历史（实测 2026-10-07 查 09-28、09-29 都返回空），所以不带 --recording 时
DAY 只能是最近一个交易日。官方 1 分钟线、日线任何一天都能取。
输出是压缩过的 JSON，不含任何 license 内容。
"""
import gzip, json, math, os, sys
from pathlib import Path
import rqdatac as rq

rq.init(username="license", password=Path(os.path.expanduser("~/.config/kansoku/rq_license")).read_text().strip())
args = sys.argv[1:]
recording = None
if args and args[0] == "--recording":
    recording = Path(os.path.expanduser(args[1]))
    args = args[2:]
out_path, day, prev_day, *symbols = args


def to_rq(s):
    code, suffix = s.split(".")
    return f"{code}.{ {'SH': 'XSHG', 'SZ': 'XSHE'}[suffix] }"


def n(v):
    if v is None:
        return None
    v = float(v)
    return None if not math.isfinite(v) else round(v, 4)


TICK_COLS = ["last", "open", "high", "low", "volume", "total_turnover", "a1", "b1"]


def ticks_from_rq(ob):
    ticks = rq.get_ticks(ob, day, day).droplevel(0)
    first = ticks.iloc[0]
    rows = [[ts.strftime("%H:%M:%S")] + [n(row[c]) for c in TICK_COLS] for ts, row in ticks.iterrows()]
    return rows, n(first["prev_close"]), n(first["limit_up"]), n(first["limit_down"])


def ticks_from_recording(sym):
    """录盘里一行是一次轮询拿到的桥快照（BridgeSnapshot + polled_at），只记了有变化的行。"""
    rows, meta = [], None
    with recording.open() as fh:
        for line in fh:
            snap = json.loads(line)
            if snap["symbol"] != sym or not snap["datetime"].startswith(day):
                continue
            meta = meta or snap
            bid = (snap.get("bids") or [None])[0]
            ask = (snap.get("asks") or [None])[0]
            rows.append([snap["datetime"][11:19], n(snap["last"]), n(snap["open"]), n(snap["high"]), n(snap["low"]),
                         n(snap["volume"]), n(snap["turnover"]), n(ask), n(bid)])
    if meta is None:
        sys.exit(f"{sym}: 录盘里没有 {day} 的快照")
    return rows, n(meta["prev_close"]), n(meta.get("limit_up")), n(meta.get("limit_down"))


doc = {"day": day, "prev_day": prev_day, "tick_columns": ["t"] + TICK_COLS, "symbols": {},
       "source": "recording" if recording else "rq.get_ticks"}
for sym in symbols:
    ob = to_rq(sym)
    ticks, prev_close, limit_up, limit_down = ticks_from_recording(sym) if recording else ticks_from_rq(ob)
    # 前一天的「最后一个快照」用它的日线拼出来（前一天的 tick 历史已经取不到）
    prev = rq.get_price(ob, prev_day, prev_day, frequency="1d", adjust_type="none", expect_df=True).droplevel(0).iloc[0]
    bars = rq.get_price(ob, day, day, frequency="1m", adjust_type="none", expect_df=True).droplevel(0)
    daybar = rq.get_price(ob, day, day, frequency="1d", adjust_type="none", expect_df=True).droplevel(0).iloc[0]
    doc["symbols"][sym] = {
        "prev_close": prev_close,
        "limit_up": limit_up,
        "limit_down": limit_down,
        "prev_day_last_tick": {
            "t": f"{prev_day} 15:00:03",
            "last": n(prev["close"]),
            "volume": n(prev["volume"]),
            "total_turnover": n(prev["total_turnover"]),
        },
        "ticks": ticks,
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
