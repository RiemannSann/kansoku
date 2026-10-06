"""把同花顺 Mac 版的自选分组导出成 kansoku 的 A 股自选文件。

同花顺把云同步的自选分组存在
~/Library/Containers/cn.com.10jqka.macstock*/Data/Documents/cloud_store/blockstock_<用户号>/public/
每个分组一个 NSKeyedArchiver plist，里面是 protobuf：1=分组名（base64 后的 GBK），3="代码|代码|…,市场|市场|…"。
只读这些文件，不改同花顺的任何东西。

用法：
  python3 import_ths_watchlist.py --list                 # 看有哪些分组
  python3 import_ths_watchlist.py                        # 导出全部 A 股分组
  python3 import_ths_watchlist.py --group 今日涨停股      # 只导出指定分组（可重复）
  python3 import_ths_watchlist.py --out ~/x.txt --dry-run
"""

from __future__ import annotations

import argparse
import base64
import plistlib
import sys
from pathlib import Path

CONTAINERS = Path.home() / "Library" / "Containers"
DEFAULT_OUT = Path.home() / ".config" / "kansoku" / "cn-watchlist.txt"


def varint(buf: bytes, i: int) -> tuple[int, int]:
    shift = value = 0
    while True:
        byte = buf[i]
        i += 1
        value |= (byte & 0x7F) << shift
        if byte < 0x80:
            return value, i
        shift += 7


def protobuf_fields(buf: bytes) -> dict[int, bytes | int]:
    i, out = 0, {}
    while i < len(buf):
        tag, i = varint(buf, i)
        number, wire = tag >> 3, tag & 7
        if wire == 2:
            length, i = varint(buf, i)
            out[number] = buf[i : i + length]
            i += length
        elif wire == 0:
            out[number], i = varint(buf, i)
        else:
            raise ValueError(f"unsupported wire type {wire}")
    return out


def archived_payloads(path: Path) -> list[bytes]:
    objects = plistlib.loads(path.read_bytes()).get("$objects", [])
    payloads = [o["NS.data"] for o in objects if isinstance(o, dict) and isinstance(o.get("NS.data"), bytes)]
    payloads += [o for o in objects if isinstance(o, bytes)]
    return payloads


def symbol_of(code: str) -> str | None:
    if len(code) != 6 or not code.isdigit():
        return None  # 期货、指数代码等
    if code.startswith("6"):
        return f"{code}.SH"
    if code.startswith(("0", "3")):
        return f"{code}.SZ"
    return None  # 北交所等，米筐这边不接


def group_id(path: Path) -> str | None:
    key = path.name.split("__public__", 1)[-1].removesuffix(".dat")
    try:
        raw = base64.b64decode(key)
    except ValueError:
        return None
    if len(raw) < 2 or raw[0] != 0x08:
        return None
    value, _ = varint(raw, 1)
    return f"{value:x}"


def read_groups(folder: Path) -> list[tuple[str, list[str]]]:
    order: list[str] = []
    groups: dict[str, tuple[str, list[str]]] = {}
    for path in sorted(folder.glob("*.dat")):
        gid = group_id(path)
        if gid is None:
            continue
        for payload in archived_payloads(path):
            try:
                fields = protobuf_fields(payload)
            except (ValueError, IndexError):
                continue
            if gid == "0":
                # 分组顺序：字段 1 形如 "23,ed,ea,eb"
                raw_order = fields.get(1)
                if isinstance(raw_order, bytes):
                    order = [p.strip() for p in raw_order.decode("latin1").split(",") if p.strip()]
                continue
            body = fields.get(3)
            if not isinstance(body, bytes) or b"," not in body:
                continue
            name_raw = fields.get(1, b"")
            try:
                name = base64.b64decode(name_raw).decode("gbk") if name_raw else gid
            except (ValueError, UnicodeDecodeError):
                name = gid
            codes = [c for c in body.decode("latin1").partition(",")[0].split("|") if c]
            if not codes:
                continue  # 空分组（删掉的分组会留下空壳）
            symbols = [s for s in (symbol_of(c) for c in codes) if s]
            groups[gid] = (name, list(dict.fromkeys(symbols)))
    ordered = [groups[g] for g in order if g in groups]
    ordered += [v for k, v in groups.items() if k not in order]
    return ordered


def find_folder() -> Path:
    candidates = sorted(
        CONTAINERS.glob("cn.com.10jqka.macstock*/Data/Documents/cloud_store/blockstock_*/public"),
        key=lambda p: max((f.stat().st_mtime for f in p.glob("*.dat")), default=0),
        reverse=True,
    )
    if not candidates:
        sys.exit("没找到同花顺 Mac 版的自选数据（~/Library/Containers/cn.com.10jqka.macstock*）")
    return candidates[0]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--list", action="store_true", help="只列出分组和只数")
    parser.add_argument("--group", action="append", default=[], help="只导出这些分组（可重复）")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help=f"输出文件，默认 {DEFAULT_OUT}")
    parser.add_argument("--source", type=Path, help="同花顺 blockstock_*/public 目录，默认自动找最新的")
    parser.add_argument("--dry-run", action="store_true", help="只打印，不写文件")
    args = parser.parse_args()

    folder = args.source or find_folder()
    groups = read_groups(folder)
    if args.list:
        for name, symbols in groups:
            print(f"{name}\t{len(symbols)} 只 A 股")
        return

    wanted = set(args.group)
    chosen = [(n, s) for n, s in groups if not wanted or n in wanted]
    missing = wanted - {n for n, _ in groups}
    if missing:
        sys.exit(f"同花顺里没有这些分组：{'、'.join(sorted(missing))}（用 --list 看看名字）")

    lines = [f"# 由同花顺自选导出（{folder}）", "# 一行一只；# 后面是注释；可以手动增删", ""]
    seen: set[str] = set()
    for name, symbols in chosen:
        fresh = [s for s in symbols if s not in seen]
        seen.update(fresh)
        if not fresh:
            continue
        lines.append(f"# {name}")
        lines.extend(fresh)
        lines.append("")
    text = "\n".join(lines)

    if args.dry_run:
        print(text)
        return
    out = args.out.expanduser()
    out.parent.mkdir(parents=True, exist_ok=True)
    if out.exists():
        backup = out.with_suffix(out.suffix + ".bak")
        backup.write_text(out.read_text())
        print(f"原文件已备份到 {backup}")
    out.write_text(text)
    print(f"已写入 {out}：{len(chosen)} 个分组，共 {len(seen)} 只")


if __name__ == "__main__":
    main()
