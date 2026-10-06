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

3. 在仓库根目录的 `.env`（已被 git 忽略）里写：

   ```bash
   MARKET_PROVIDER_CN=ricequant
   RQ_PYTHON=~/.local/share/kansoku-rq/venv/bin/python
   RQ_LICENSE_FILE=~/.config/kansoku/rq_license
   ```

   `RQ_BRIDGE_PATH` 可以改桥脚本的位置，默认是本目录的 `rq_bridge.py`。

## 工作方式

- `rq_bridge.py` 是一个常驻子进程，只 `rq.init` 一次，之后 stdin/stdout 一行一个 JSON 请求/应答。
  第一次请求要等米筐初始化，大约 10 秒；之后单次 K 线约 1 秒内，快照约 0.2 秒。
- 实时：米筐没有推送，`RicequantStream` 每 3 秒（盘中 09:15–11:31、12:59–15:01）或 60 秒（其它时间）
  批量拉一次 `current_snapshot`。盘中 K 线用累计成交量做差分拼出来，图表每分钟重拉 K 线时会校正成交易所口径。
- K 线时间：米筐分钟线按收盘时刻打标签，这里统一换成开盘时刻（与长桥一致）；
  60 分钟线是 09:30 / 10:30 / 13:00 / 14:00 四根；日、周、月线记在上海时间 0 点。
- 价格是前复权。「消息」页签显示的是上市公司公告，不是新闻。

## 目前没有的

资金分布（大/中/小单）、持仓、自选股、财报日历、宏观日历、市场温度、行业排行——米筐这边没接，相关面板对 A 股会自动隐藏或留空。
