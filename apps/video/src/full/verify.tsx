import { Img, Layout, Line, Rect, Txt, Video } from '@revideo/2d';
import {
  all,
  createRef,
  createRefArray,
  easeInCubic,
  easeInOutCubic,
  easeOutExpo,
  sequence,
  waitFor,
} from '@revideo/core';
import { C, font, mono } from '../components';
import { type Scene, Window, makeChrome, shotPoint } from './chrome';

const W = 1184;
const H = 740;
const ZOOM = 1.28;
const FOCUS_Y = 70;

const verdict = { left: shotPoint(755, 240, W), right: shotPoint(1852, 240, W) };
const sources = [1328, 1385, 1443].map((py) => ({
  left: shotPoint(790, py, W),
  right: shotPoint(1170, py, W),
}));
const focus = shotPoint(1300, 835, W);

export function verifyScene(): Scene {
  const chrome = makeChrome('01 / VERIFY', '听到传闻？让它回原始出处查。');
  const win = createRef<Layout>();
  const video = createRef<Video>();
  const badge = createRef<Rect>();
  const answerImg = createRef<Img>();
  const scan = createRef<Rect>();
  const tags = createRefArray<Rect>();
  const wires = createRefArray<Line>();
  const underline = createRef<Line>();

  const node = (
    <>
      <Window root={win} width={W} height={H}>
        <Video ref={video} src={'/captures/full/verify-steps.mp4'} width={W} playbackRate={2} />
        <Layout>
          <Img ref={answerImg} src={'/captures/full/verify-answer.webp'} width={W} opacity={0} />
          <Line
            ref={underline}
            points={[
              [verdict.left.x, verdict.left.y + 12],
              [verdict.right.x, verdict.right.y + 12],
            ]}
            stroke={C.yellow}
            lineWidth={3}
            end={0}
          />
          {sources.map((source) => (
            <Line
              key={`wire-${source.left.y}`}
              ref={wires}
              points={[
                [source.left.x - 6, source.left.y],
                [verdict.left.x - 44, source.left.y],
                [verdict.left.x - 44, verdict.left.y + 12],
                [verdict.left.x - 4, verdict.left.y + 12],
              ]}
              radius={8}
              stroke={C.teal}
              lineWidth={2}
              end={0}
            />
          ))}
          {sources.map((source) => (
            <Rect
              key={`tag-${source.left.y}`}
              ref={tags}
              x={source.right.x + 48}
              y={source.right.y}
              padding={[3, 8]}
              radius={4}
              layout
              fill={C.teal}
              scale={0}
            >
              <Txt text={'✓ 已核对'} fontFamily={font} fontSize={12} fontWeight={700} fill={C.bg} />
            </Rect>
          ))}
        </Layout>
        <Rect
          ref={scan}
          y={-H / 2}
          width={W}
          height={3}
          fill={C.yellow}
          shadowColor={C.yellow}
          shadowBlur={24}
          opacity={0}
        />
        <Rect
          ref={badge}
          x={W / 2 - 92}
          y={-H / 2 + 62}
          padding={[6, 14]}
          radius={4}
          layout
          fill={'#0B0E10E8'}
          stroke={C.yellow}
          lineWidth={1}
        >
          <Txt text={'快进 60×'} fontFamily={mono} fontSize={18} fontWeight={700} fill={C.yellow} />
        </Rect>
      </Window>
      {chrome.node}
    </>
  );

  function* play() {
    video().play();
    win().scale(0.94);
    yield* all(win().opacity(1, 0.45), win().scale(1, 0.6, easeOutExpo), chrome.enter());
    yield* waitFor(3.1);
    yield* all(answerImg().opacity(1, 0.25), badge().opacity(0, 0.25));
    video().pause();
    scan().opacity(1);
    yield* scan().y(H / 2, 0.9, easeInOutCubic);
    scan().opacity(0);
    yield* all(
      win().scale(ZOOM, 0.9, easeInOutCubic),
      win().position([-focus.x * ZOOM, FOCUS_Y - focus.y * ZOOM], 0.9, easeInOutCubic),
    );
    yield* sequence(0.14, ...[...tags].map((tag) => tag.scale(1, 0.45, easeOutExpo)));
    yield* all(
      sequence(0.1, ...[...wires].map((wire) => wire.end(1, 0.6, easeInOutCubic))),
      underline().end(1, 0.5, easeInOutCubic),
    );
    yield* waitFor(1.1);
    yield* all(chrome.exit(), win().scale([0, ZOOM], 0.45, easeInCubic));
  }

  return { node, play };
}
