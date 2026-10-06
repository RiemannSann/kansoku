# StockSeller 实盘看板接入

把 `barneyStockSeller` 的只读网页看板（`live_view_web.py`）接进 kansoku，在 `/live`「实盘看板」页显示，并把实盘仓位并进首页。

## 用法

1. 先把只读网页看板开起来（和终端里的 `bs` 用的是同一套数据，可以同时开）：

   ```bash
   cd ~/Projects/python/scripts/local_code && uv run --project .. python StockSeller/live_view_web.py --os --os3 --no-open
   ```

   默认监听 `http://127.0.0.1:8766`。

2. 在 kansoku 首页右上角点钱包图标，或者直接打开 `/live`。

3. 想让实盘仓位（今日买入、可卖、卖出中）自动出现在首页「自选 + 持仓」里，在仓库根目录 `.env` 里加：

   ```bash
   STOCKSELLER_LIVE_URL=http://127.0.0.1:8766
   ```

   不设这一行时只有 `/live` 页面会去连看板，首页不受影响。

## 边界

- 只调用看板的 `GET /api/snapshot`。不碰下单、FIFO、monitor930 配置等任何会改状态的接口，页面上也没有任何操作按钮。
- 看板没开时 `/live` 会提示怎么启动，首页当作没有实盘仓位，不报错。
- 页面每 5 秒刷新一次，数据不写进浏览器缓存。
- 表格的列和颜色标记沿用看板原样（`Rem/Init`、`Decision Review` 等），代码可以点进 kansoku 的个股图表。
