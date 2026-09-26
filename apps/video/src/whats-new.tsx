import {
  Audio,
  type ComponentChildren,
  Gradient,
  Img,
  Layout,
  Line,
  Rect,
  Txt,
  makeScene2D,
} from '@revideo/2d';
import {
  type ReferenceArray,
  type SimpleSignal,
  all,
  createRef,
  createRefArray,
  createSignal,
  delay,
  easeInCubic,
  easeInOutCubic,
  easeOutCubic,
  easeInOutExpo,
  easeOutExpo,
  makeProject,
  sequence,
  waitFor,
} from '@revideo/core';
import { Camera, type CameraRefs, frameOn, ringIn, ringOut, ringTo, snap } from './camera';
import { C, Corner, Grid, Pill, font, mono } from './components';
import { MemoryPanel, newEntry, slideRowsIn } from './memoryPanel';
import { Extract, RevealText, drop, lift, popIn, rise, sink, wipe } from './motion';

const FRAME_Y = 72;
const R = {
  canvasPrompt: { x: 220, y: 256, w: 1158, h: 150 },
  canvasChart: { x: 1441, y: 430, w: 1399, h: 912 },
  canvasCards: { x: 1441, y: 430, w: 1399, h: 202 },
  searchFix: { x: 755, y: 454, w: 1362, h: 79 },
  searchSources: { x: 755, y: 994, w: 1362, h: 396 },
  syncWorkspace: { x: 896, y: 965, w: 1440, h: 151 },
  syncStatus: { x: 896, y: 1404, w: 1440, h: 173 },
};
const canvasA = frameOn(R.canvasPrompt, 1.5, -40);
const canvasEnd = frameOn(R.canvasChart, 1.2, -30);
const searchA = frameOn(R.searchFix, 1.5, -60);
const searchEnd = frameOn(R.searchSources, 1.45, -40);
const syncA = frameOn(R.syncWorkspace, 1.35, -60);
const syncEnd = frameOn(R.syncStatus, 1.35, -40);

function cameraRefs(): CameraRefs {
  return {
    cam: createRef<Layout>(),
    spot: createRef<Layout>(),
    hole: createRef<Rect>(),
    ring: createRef<Rect>(),
  };
}

const scrim = new Gradient({
  from: [0, -80],
  to: [0, 80],
  stops: [
    { offset: 0, color: '#0A0A0A00' },
    { offset: 0.4, color: '#0A0A0AF5' },
    { offset: 1, color: '#0A0A0A' },
  ],
});

function Panel({ width, children }: { width: SimpleSignal<number>; children: ComponentChildren }) {
  return (
    <Rect x={() => -830 + width() / 2} width={width} height={840} clip fill={'#0A0A0A'}>
      <Layout x={() => 830 - width() / 2}>{children}</Layout>
    </Rect>
  );
}

function Title({ items, text }: { items: ReferenceArray<Txt>; text: string }) {
  return (
    <Layout x={-790} y={-402}>
      <RevealText
        items={items}
        text={text}
        fontSize={62}
        fontFamily={font}
        fontWeight={700}
        fill={C.paper}
      />
    </Layout>
  );
}

const whatsNewScene = makeScene2D('kansoku-whats-new-043', function* (view) {
  const gridOpacity = createSignal(0);
  const hookImg = createRef<Img>();
  const hookItems = createRefArray<Txt>();
  const stage = createRef<Layout>();
  const frame = createRef<Rect>();
  const corners = createRef<Layout>();
  const sectionCode = createRef<Txt>();
  const lightBar = createRef<Rect>();
  const dim = createRef<Rect>();

  const titleCanvas = createRefArray<Txt>();
  const titleSearch = createRefArray<Txt>();
  const titleMemory = createRefArray<Txt>();
  const titleSync = createRefArray<Txt>();

  const canvasCam = cameraRefs();
  const searchCam = cameraRefs();
  const syncCam = cameraRefs();
  const memoryRing = createRef<Rect>();
  const canvasPanel = createSignal(1660);
  const searchPanel = createSignal(0);
  const memoryPanel = createSignal(0);
  const syncPanel = createSignal(0);

  const memoryRows = createRefArray<Txt>();
  const memoryRow = createRef<Rect>();
  const memoryTyped = createRef<Txt>();
  const memoryGlow = createRef<Rect>();
  const memoryTag = createRef<Rect>();

  const cardCanvas = createRef<Rect>();
  const sweepCanvas = createRef<Rect>();
  const cardSearch = createRef<Rect>();
  const sweepSearch = createRef<Rect>();
  const cardSync = createRef<Rect>();
  const sweepSync = createRef<Rect>();

  const railCanvas = createRef<Layout>();
  const railSearch = createRef<Layout>();
  const railMemory = createRef<Layout>();
  const railSync = createRef<Layout>();

  const endCard = createRef<Layout>();
  const endIcon = createRef<Img>();
  const endWord = createRefArray<Txt>();
  const endVersion = createRefArray<Txt>();
  const endLine = createRef<Line>();
  const endUrl = createRef<Txt>();

  view.fill(C.bg);
  view.add(
    <>
      <Audio src={'/audio/observed-path.mp3'} play volume={3.2} />
      <Grid opacity={gridOpacity} />

      <Layout>
        <Img
          ref={hookImg}
          src={'/captures/new-canvas.png'}
          width={3000}
          x={-330}
          y={-160}
          scale={1.12}
          opacity={0}
        />
        <Rect width={1920} height={1080} fill={'#05070A'} opacity={0.64} />
        <Layout x={-800}>
          <RevealText
            items={hookItems}
            text={'这个月，AI 能画、能搜、能记住了。'}
            fontSize={78}
            fontFamily={font}
            fontWeight={700}
            fill={C.paper}
          />
        </Layout>
      </Layout>

      <Layout ref={stage} opacity={0}>
        <Txt
          ref={sectionCode}
          x={-790}
          y={-468}
          offset={[-1, 0]}
          text={''}
          fontFamily={mono}
          fontSize={20}
          fontWeight={700}
          letterSpacing={4}
          fill={C.yellow}
        />
        <Title items={titleCanvas} text={'让 AI 当场画一张会动的分析图。'} />
        <Title items={titleSearch} text={'说法拿不准？它回原始出处查。'} />
        <Title items={titleMemory} text={'它记住的，是你能打开改的文件。'} />
        <Title items={titleSync} text={'换台 Mac，接着用。'} />

        <Rect
          ref={frame}
          y={FRAME_Y}
          width={1660}
          height={840}
          radius={18}
          clip
          stroke={C.border}
          lineWidth={2}
          fill={'#0A0A0A'}
        >
          <Panel width={canvasPanel}>
            <Camera refs={canvasCam} src={'/captures/new-canvas.png'} accent={C.teal} />
          </Panel>
          <Panel width={searchPanel}>
            <Camera refs={searchCam} src={'/captures/new-search.png'} accent={C.yellow} />
          </Panel>
          <Panel width={memoryPanel}>
            <MemoryPanel
              rows={memoryRows}
              activeRow={memoryRow}
              typed={memoryTyped}
              typedGlow={memoryGlow}
              newTag={memoryTag}
            />
            <Rect
              ref={memoryRing}
              x={-620}
              y={84}
              width={432}
              height={64}
              stroke={C.yellow}
              lineWidth={3}
              radius={10}
              shadowColor={C.yellow}
              shadowBlur={24}
              end={0}
            />
          </Panel>
          <Panel width={syncPanel}>
            <Camera refs={syncCam} src={'/captures/new-sync.png'} accent={C.teal} />
          </Panel>
          <Rect ref={dim} width={1660} height={840} fill={'#000000'} opacity={0} />
          <Rect y={340} width={1660} height={160} fill={scrim} />
          <Rect y={-402} width={1660} height={36} fill={'#171B1F'} />
          <Layout x={-777} y={-402} layout direction={'row'} gap={10}>
            <Rect size={10} radius={5} fill={C.red} />
            <Rect size={10} radius={5} fill={C.yellow} />
            <Rect size={10} radius={5} fill={C.teal} />
          </Layout>
          <Rect
            ref={lightBar}
            x={-830}
            width={4}
            height={840}
            fill={C.yellow}
            shadowColor={C.yellow}
            shadowBlur={40}
            opacity={0}
          />
        </Rect>

        <Layout ref={corners}>
          <Corner x={-850} y={-348} />
          <Corner x={850} y={-348} flipX={-1} />
          <Corner x={-850} y={492} flipY={-1} />
          <Corner x={850} y={492} flipX={-1} flipY={-1} />
        </Layout>

        <Layout ref={railCanvas} layout y={430} direction={'row'} gap={14} opacity={0}>
          <Pill text={'K 线跟着盘中走'} accent={C.yellow} />
          <Pill text={'拖滑杆数字联动'} />
        </Layout>
        <Layout ref={railSearch} layout y={430} direction={'row'} gap={14} opacity={0}>
          <Pill text={'tavily / exa / brave'} accent={C.yellow} />
          <Pill text={'或 codex 免 key'} />
        </Layout>
        <Layout ref={railMemory} layout y={430} direction={'row'} gap={14} opacity={0}>
          <Pill text={'MEMORY.md'} accent={C.yellow} />
          <Pill text={'symbols/'} />
          <Pill text={'只追加不删旧'} accent={C.red} />
        </Layout>
        <Layout ref={railSync} layout y={430} direction={'row'} gap={14} opacity={0}>
          <Pill text={'iCloud 同步'} accent={C.yellow} />
          <Pill text={'冲突说人话'} />
          <Pill text={'升级只下差异'} accent={C.red} />
        </Layout>

        <Extract
          card={cardCanvas}
          sweep={sweepCanvas}
          src={'/captures/new-canvas.png'}
          shot={canvasEnd}
          region={R.canvasCards}
          accent={C.teal}
          offsetY={FRAME_Y}
        />
        <Extract
          card={cardSearch}
          sweep={sweepSearch}
          src={'/captures/new-search.png'}
          shot={searchEnd}
          region={R.searchSources}
          accent={C.yellow}
          offsetY={FRAME_Y}
        />
        <Extract
          card={cardSync}
          sweep={sweepSync}
          src={'/captures/new-sync.png'}
          shot={syncEnd}
          region={R.syncStatus}
          accent={C.teal}
          offsetY={FRAME_Y}
        />
      </Layout>

      <Layout ref={endCard}>
        <Img
          ref={endIcon}
          y={-160}
          src={'/brand/kansoku-icon.png'}
          width={112}
          scale={0}
          rotation={-30}
        />
        <Layout y={-30}>
          <RevealText
            items={endWord}
            text={'KANSOKU'}
            perChar
            gap={14}
            align={'center'}
            fontSize={70}
            fontFamily={mono}
            fontWeight={800}
            fill={C.paper}
          />
        </Layout>
        <Layout y={62}>
          <RevealText
            items={endVersion}
            align={'center'}
            text={'v0.43 · 现在更新'}
            fontSize={40}
            fontFamily={font}
            fontWeight={600}
            fill={C.paper}
          />
        </Layout>
        <Line
          ref={endLine}
          y={132}
          points={[
            [-220, 0],
            [220, 0],
          ]}
          stroke={C.yellow}
          lineWidth={2}
          start={0.5}
          end={0.5}
        />
        <Txt
          ref={endUrl}
          y={188}
          text={''}
          fontFamily={mono}
          fontSize={28}
          letterSpacing={4}
          fill={C.yellow}
        />
      </Layout>
    </>,
  );

  const highlights = [...hookItems].filter((item) =>
    ['画', '搜', '记', '住'].includes(item.text()),
  );
  yield* all(
    gridOpacity(0.45, 0.8),
    hookImg().opacity(1, 0.8),
    hookImg().scale(1.04, 3.8, easeOutCubic),
    (function* () {
      yield* waitFor(0.25);
      yield* rise(hookItems);
      yield* sequence(0.18, ...highlights.map((item) => item.fill(C.yellow, 0.25)));
      yield* waitFor(1.3);
    })(),
  );
  yield* all(sink(hookItems, 110), hookImg().opacity(0, 0.5));

  frame().y(FRAME_Y + 160);
  frame().scale(0.9);
  corners().scale(1.12);
  corners().opacity(0);
  stage().opacity(1);
  yield* all(
    frame().y(FRAME_Y, 1, easeOutExpo),
    frame().scale(1, 1, easeOutExpo),
    corners().scale(1, 1, easeOutExpo),
    corners().opacity(1, 0.6),
    sectionCode().text('01 / CANVAS', 0.45),
    delay(0.25, rise(titleCanvas)),
  );
  yield* all(popIn(railCanvas()), delay(0.3, ringIn(canvasCam, R.canvasPrompt)));
  yield* snap(canvasCam, canvasA);
  yield* waitFor(1.4);
  yield* all(ringTo(canvasCam, R.canvasChart), snap(canvasCam, canvasEnd));
  yield* waitFor(1.2);
  yield* all(ringOut(canvasCam), lift(cardCanvas(), sweepCanvas(), dim()));
  yield* waitFor(2);

  yield* all(drop(cardCanvas(), dim()), sink(titleCanvas, 90), railCanvas().opacity(0, 0.3));
  yield* all(
    sectionCode().text('02 / WEB SEARCH', 0.45),
    wipe(searchPanel, lightBar()),
    delay(0.35, rise(titleSearch)),
  );
  yield* all(popIn(railSearch()), delay(0.3, ringIn(searchCam, R.searchFix)));
  yield* snap(searchCam, searchA);
  yield* waitFor(1.4);
  yield* all(ringTo(searchCam, R.searchSources), snap(searchCam, searchEnd));
  yield* waitFor(1);
  yield* all(ringOut(searchCam), lift(cardSearch(), sweepSearch(), dim()));
  yield* waitFor(2);

  yield* all(drop(cardSearch(), dim()), sink(titleSearch, 90), railSearch().opacity(0, 0.3));
  yield* all(
    sectionCode().text('03 / MEMORY', 0.45),
    wipe(memoryPanel, lightBar()),
    delay(0.35, rise(titleMemory)),
  );
  yield* all(popIn(railMemory()), slideRowsIn(memoryRows));
  yield* all(memoryRow().opacity(1, 0.3), memoryRing().end(1, 0.7, easeInOutCubic));
  yield* waitFor(0.5);
  yield* all(
    memoryRing().position([200, 52], 0.9, easeInOutExpo),
    memoryRing().size([1180, 76], 0.9, easeInOutExpo),
  );
  yield* all(memoryGlow().opacity(1, 0.3), memoryTyped().text(newEntry, 2.2));
  yield* all(
    memoryTag().opacity(1, 0.25),
    memoryTag().scale(1, 0.5, easeOutExpo),
    memoryGlow().shadowBlur(36, 0.6),
  );
  yield* waitFor(2.2);

  yield* all(sink(titleMemory, 90), railMemory().opacity(0, 0.3), memoryRing().opacity(0, 0.3));
  yield* all(
    sectionCode().text('04 / SYNC', 0.45),
    wipe(syncPanel, lightBar()),
    delay(0.35, rise(titleSync)),
  );
  yield* all(popIn(railSync()), delay(0.3, ringIn(syncCam, R.syncWorkspace)));
  yield* snap(syncCam, syncA);
  yield* waitFor(1.4);
  yield* all(ringTo(syncCam, R.syncStatus), snap(syncCam, syncEnd));
  yield* waitFor(1);
  yield* all(ringOut(syncCam), lift(cardSync(), sweepSync(), dim()));
  yield* waitFor(2.4);

  yield* all(
    sink(titleSync, 90),
    stage().opacity(0, 0.6),
    frame().scale(0.92, 0.6, easeInCubic),
    gridOpacity(0.25, 0.6),
  );
  yield* all(endIcon().scale(1, 0.8, easeOutExpo), endIcon().rotation(0, 0.8, easeOutExpo));
  yield* all(rise(endWord, 0.05), delay(0.3, rise(endVersion)));
  yield* all(endLine().start(0, 0.6, easeInOutCubic), endLine().end(1, 0.6, easeInOutCubic));
  yield* endUrl().text('kansoku.trade', 0.6);
  yield* waitFor(3.8);
  yield* endCard().opacity(0, 0.8);
});

export default makeProject({
  scenes: [whatsNewScene],
  settings: {
    shared: {
      size: { x: 1920, y: 1080 },
    },
  },
});
