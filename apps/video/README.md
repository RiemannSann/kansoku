# Kansoku 产品介绍视频

本目录使用 Revideo 生成 Kansoku 的产品介绍视频。当前版本面向社交时间线（静音自动播放），以「一次判断的完整旅程」为主线：盘前看全局 → 盘中判断 → 后台巡检 → 全程留痕 → 收盘后训练。设计定稿见 `docs/superpowers/specs/2026-07-29-product-video-story-recut-design.md`。

## 分镜

| 时间        | 节拍                | 主句                                  |
| ----------- | ------------------- | ------------------------------------- |
| 00:00–00:04 | 钩子                | 别问 AI 买什么。问它：凭什么。        |
| 00:04–00:10 | 01 PRE-MARKET       | 盘前，先看一眼全局。                  |
| 00:10–00:17 | 02 ON THE CHART     | 盯上一只，摊开来看。                  |
| 00:17–00:24 | 03 CHECKLIST        | 买不买，先过八条硬检查。              |
| 00:24–00:31 | 04 SCENARIOS        | 它敢说做空，也敢说什么时候认错。      |
| 00:31–00:39 | 05 BACKGROUND WATCH | 关掉图表，它还在后台盯。              |
| 00:39–00:43 | 06 PAPER TRAIL      | 每一步研究，落成你电脑里的文件。      |
| 00:43–00:47 | 06 PAPER TRAIL      | 行情 → 实算 → 模型 → 归档，全程留痕。 |
| 00:47–00:54 | 07 AFTER CLOSE      | 收盘后，遮住答案再练一次。            |
| 00:54–01:02 | 结尾                | 不是替你下单。是让每个判断都有依据。  |

## 使用方式

在仓库根目录运行：

```bash
pnpm video:dev
pnpm video:render
```

成片写入 `apps/video/output/kansoku-product-intro.mp4`。

另一支是 v0.43 新功能发布片（`src/whats-new.tsx`，设计见 `docs/superpowers/specs/2026-09-26-whats-new-043-video-design.md`）：

```bash
pnpm --filter @kansoku/video start:new
pnpm video:render:new
```

成片写入 `apps/video/output/kansoku-whats-new-0.43.mp4`，渲染完会用本机 `ffmpeg` 给结尾音乐加 1.2 秒淡出。

## 素材边界

- `public/captures/cockpit-live.png` 来自当前源码运行的真实桌面 App。
- `public/captures/app-trainer.png` 来自当前源码运行的匿名盲盘训练窗口。
- `public/captures/app-*.webp` 来自仓库内已公开的产品素材。
- 不使用包含真实持仓、账户金额或本地 AI 费用的截图。
- 视频源码可以版本化；渲染成片默认不进入 Git。

## 完整介绍片（MU 财报周）

设计见 `docs/superpowers/specs/2026-09-26-full-intro-video-design.md`，代码在 `src/full-intro.tsx` 和 `src/full/`（每段一个文件）。

```bash
pnpm --filter @kansoku/video start:full
pnpm video:render:full
```

成片写入 `apps/video/output/kansoku-full-intro.mp4`。素材都在演示环境里拍：`demo/start.sh` 用替身长桥 CLI（不读持仓和账户）和一个干净的工作区启动开发版，原始录屏和数据放在 `demo/raw/`（不进 git）。

## 预告短片（一镜到底 + 卡点爆发）

设计见 `docs/superpowers/specs/2026-09-26-teaser-video-design.md`，代码在 `src/teaser.tsx` 和 `src/teaser/`。36 秒，给 X 时间线用。

```bash
pnpm --filter @kansoku/video bgm:teaser   # 重新合成音乐
pnpm --filter @kansoku/video start:teaser
pnpm video:render:teaser
```

成片写入 `apps/video/output/kansoku-teaser.mp4`。画面切点和音乐鼓点都从 `src/teaser/cues.ts` 取时间（120 BPM，一拍 15 帧），改节奏只改这一个文件，然后重新合成音乐。开头的 MU 日线是 `longbridge kline MU.US --period day --count 250` 拉的真实数据，导出在 `src/teaser/mu-daily.ts`。
