# 米筐（RiceQuant）行情桥

让 A 股（`.SH` / `.SZ`）的 K 线、实时报价、资金流、公告、市值改走米筐 `rqdatac`，美股和港股继续走长桥。
只用米筐看 A 股时，本机不装长桥也能通过首次启动的「连接数据」检查。

## 怎么接上

1. 准备一个装了 `rqdatac` 的 Python：

   ```bash
   uv venv ~/.local/share/kansoku-rq/venv
   uv pip install --python ~/.local/share/kansoku-rq/venv/bin/python rqdatac
   ```

2. 把米筐 license key 单独存成一个文件，权限设成只有自己能读：

   ```bash
   mkdir -p ~/.config/kansoku && chmod 700 ~/.config/kansoku
   # 把 key 写进 ~/.config/kansoku/rq_license，然后
   chmod 600 ~/.config/kansoku/rq_license
   ```

3. 在 `~/.config/kansoku/kansoku.env` 里写（打包后的 Mac App、`pnpm dev`、`pnpm dev:desktop` 都会读）：

   ```bash
   MARKET_PROVIDER_CN=ricequant
   RQ_PYTHON=~/.local/share/kansoku-rq/venv/bin/python
   RQ_LICENSE_FILE=~/.config/kansoku/rq_license
   ```

   开发时也可以写在仓库根目录的 `.env`（已被 git 忽略），两边都有的键以仓库 `.env` 为准。
   `KANSOKU_ENV_FILE` 可以改这个配置文件的位置。改完要重启 App。

   `RQ_BRIDGE_PATH` 可以改桥脚本的位置：开发时默认是本目录的 `rq_bridge.py`，
   打包后的 App 默认用随 App 打包的 `Kansoku.app/Contents/Resources/rq-bridge/rq_bridge.py`。
   Python 和 `rqdatac` 不随 App 打包，用的是上面 `RQ_PYTHON` 指定的那个。

## 工作方式

- `rq_bridge.py` 是一个常驻子进程，只 `rq.init` 一次，之后 stdin/stdout 一行一个 JSON 请求/应答。
  第一次请求要等米筐初始化，大约 10 秒；之后单次 K 线约 1 秒内，快照约 0.2 秒。
- 实时：米筐没有推送，`RicequantStream` 每 3 秒（盘中 09:15–11:31、12:59–15:01）或 60 秒（其它时间）
  批量拉一次 `current_snapshot`。盘中 K 线用累计成交量做差分拼出来，图表每分钟重拉 K 线时会校正成交易所口径。
- K 线时间：米筐分钟线按收盘时刻打标签，这里统一换成开盘时刻（与长桥一致）；
  60 分钟线是 09:30 / 10:30 / 13:00 / 14:00 四根；日、周、月线记在上海时间 0 点。
- 价格是前复权。「消息」页签显示的是上市公司公告，不是新闻。

## A 股自选股

米筐没有「自选股」，A 股自选放在本机文本文件 `~/.config/kansoku/cn-watchlist.txt`
（`.env` 里的 `RQ_WATCHLIST_FILE` 可以改位置）。一行一只，`#` 后面是注释；
`600519`、`600519.SH`、`SH600519` 这几种写法都认，北交所代码会被跳过。
首页的「自选 + 持仓」和行情订阅会把它和长桥自选合在一起；改完文件最多 10 分钟内生效（或重启 dev）。

同花顺 Mac 版的自选分组可以一键导出（只读同花顺的数据，不会改它）：

```bash
python3 packages/core/rq-bridge/import_ths_watchlist.py --list        # 看有哪些分组
python3 packages/core/rq-bridge/import_ths_watchlist.py --group 今日涨停股 # 只导出某几个分组（可重复）
python3 packages/core/rq-bridge/import_ths_watchlist.py               # 导出全部分组
```

已有的文件会先备份成 `cn-watchlist.txt.bak`。加 `--dry-run` 只打印不写。

在「设置 → 显示 → 关注市场」里打开 A 股后，首页顶栏会显示上证指数、深证成指、创业板指、沪深 300。

## 目前没有的

资金分布（大/中/小单）、持仓、财报日历、宏观日历、市场温度、行业排行——米筐这边没接，相关面板对 A 股会自动隐藏或留空。
