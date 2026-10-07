"""用 StockSeller 自己的 live_view_web.snapshot_payload 生成 /api/snapshot 样本（真实格式），给 kansoku 的解析测试用。

不启动看板、不连任何服务器：只 import 它的模块，喂一份手造的 Snapshot，调用它把数据格式化成网页接口那份 JSON 的函数。
为了保险，运行期间禁止一切网络连接（socket.connect 直接抛错）。

用法（StockSeller 仓库在 ~/Projects/python/scripts）：
    ~/Projects/python/scripts/.venv/bin/python packages/core/test/fixtures/stockseller/gen_snapshot_fixture.py
    npx prettier --write packages/core/test/fixtures/stockseller/*.json
"""

import importlib.util
import json
import os
import socket
import sys
from pathlib import Path

ROOT = Path(os.environ.get("STOCKSELLER_ROOT", Path.home() / "Projects/python/scripts"))
SS = ROOT / "local_code" / "StockSeller"
OUT = Path(__file__).resolve().parent


def _no_network(*_args, **_kwargs):
    raise RuntimeError("fixture generator must not touch the network")


socket.socket.connect = _no_network  # type: ignore[method-assign]
socket.create_connection = _no_network  # type: ignore[assignment]
os.environ["RQDATAC_LICENSE_KEY"] = ""
os.environ["RQDATAC_LICENSE_KEY_FALLBACK"] = ""
sys.path.insert(0, str(SS))

for name in ["barneyStockSeller", "mdd_log_parser", "live_view", "live_view_web"]:
    spec = importlib.util.spec_from_file_location(name, str(SS / f"{name}.py"))
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)

lv = sys.modules["live_view"]
lvw = sys.modules["live_view_web"]
seller = sys.modules["barneyStockSeller"].BarneyStockSeller()

LABELS = ["OS-SH", "OS-SH3"]

# 今日买入：两台服务器各买一部分
BUY = [
    (
        0.0,
        "600487",
        {
            "name": "亨通光电",
            "lane": "LU",
            "per_server": {"OS-SH": 1000, "OS-SH3": 500},
            "notional": 30150.0,
            "avg": 20.1,
            "last": 20.5,
            "ret": 0.0199,
            "now": 0.03,
        },
    ),
    # ETF：三位小数；只在一台服务器上买
    (
        0.0,
        "510300",
        {
            "name": "沪深300ETF",
            "lane": None,
            "per_server": {"OS-SH": 20000},
            "notional": 92460.0,
            "avg": 4.623,
            "last": 4.611,
            "ret": -0.0026,
            "now": -0.004,
        },
    ),
]

# 清仓中：剩余/初始
SOLD = [
    (
        0.0,
        "600487",
        {
            "key": "a",
            "name": "亨通光电",
            "per_server": {"OS-SH": (200, 2000), "OS-SH3": (0, 0)},
            "notional": 4100.0,
            "avg": 19.0,
            "last": 20.5,
            "prev_flag": "U",
            "decision_review_cell": "-",
            "ret": 0.0789,
            "now": 0.03,
        },
    ),
]

# 可卖：看板不给均价
AVAILABLE = [
    (
        0.0,
        "000001",
        {
            "key": "b",
            "name": "平安银行",
            "per_server": {"OS-SH": (3000, 3000), "OS-SH3": (1000, 1000)},
            "notional": 46280.0,
            "prev_flag": "Z",
            "decision_review_cell": "-",
            "est_now": 0.001,
        },
    ),
]


def build(compact: bool, auction: bool) -> dict:
    lvw._is_call_auction = lambda: auction
    controller = lv.LiveController(seller=seller, refresh_interval=5.0, page_size=50, compact=compact)
    snap = lv.Snapshot(
        timestamp=1791945065.0,  # 2026-10-08 10:31:05 北京时间
        summary=None,
        available_entries=AVAILABLE,
        sold_entries=SOLD,
        buy_entries=BUY,
        intent_entries=[],
        server_labels=LABELS,
        key_mapping={},
        display_keys={},
        command_log=["(generator) command log must not leak"],
    )
    payload = lvw.snapshot_payload(snap, controller, 5.0, compact)
    # 生成时刻相关的字段固定下来，夹具才能稳定
    payload["updated_at"] = "10:31:05 CST"
    payload["data_age_seconds"] = None
    return payload


for name, compact, auction in [
    ("snapshot-full.json", False, False),
    ("snapshot-auction.json", False, True),
    ("snapshot-compact.json", True, False),
]:
    (OUT / name).write_text(json.dumps(build(compact, auction), ensure_ascii=False, indent=2) + "\n")
    print("wrote", name)
