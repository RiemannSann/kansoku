import { Img, Layout, Line, Txt } from '@revideo/2d';
import {
  all,
  createRef,
  createRefArray,
  delay,
  easeInCubic,
  easeInOutCubic,
  easeOutExpo,
  sequence,
  waitFor,
} from '@revideo/core';
import { C, font, mono } from '../components';
import { RevealText, rise } from '../motion';
import type { Scene } from './chrome';

const RAYS = 18;

export function endScene(): Scene {
  const rays = createRefArray<Line>();
  const icon = createRef<Img>();
  const word = createRefArray<Txt>();
  const tagline = createRefArray<Txt>();
  const rule = createRef<Line>();
  const url = createRef<Txt>();
  const root = createRef<Layout>();

  const node = (
    <Layout ref={root}>
      {Array.from({ length: RAYS }, (_, index) => {
        const angle = (index / RAYS) * Math.PI * 2;
        return (
          <Line
            key={`ray${index}`}
            ref={rays}
            points={[
              [Math.cos(angle) * 1200, Math.sin(angle) * 760],
              [0, -150],
            ]}
            stroke={index % 3 === 0 ? C.yellow : C.border}
            lineWidth={index % 3 === 0 ? 2 : 1}
            end={0}
          />
        );
      })}
      <Img
        ref={icon}
        y={-150}
        src={'/brand/kansoku-icon.png'}
        width={116}
        scale={0}
        rotation={-40}
      />
      <Layout y={-24}>
        <RevealText
          items={word}
          text={'KANSOKU'}
          perChar
          gap={14}
          align={'center'}
          fontSize={72}
          fontFamily={mono}
          fontWeight={800}
          fill={C.paper}
        />
      </Layout>
      <Layout y={70}>
        <RevealText
          items={tagline}
          text={'不是替你下单。是让每个判断都有依据。'}
          align={'center'}
          fontSize={38}
          fontFamily={font}
          fontWeight={600}
          fill={C.paper}
        />
      </Layout>
      <Line
        ref={rule}
        y={140}
        points={[
          [-240, 0],
          [240, 0],
        ]}
        stroke={C.yellow}
        lineWidth={2}
        start={0.5}
        end={0.5}
      />
      <Txt
        ref={url}
        y={196}
        text={''}
        fontFamily={mono}
        fontSize={28}
        letterSpacing={4}
        fill={C.yellow}
      />
    </Layout>
  );

  function* play() {
    yield* sequence(0.03, ...[...rays].map((ray) => ray.end(1, 0.5, easeInOutCubic)));
    yield* all(
      sequence(0.02, ...[...rays].map((ray) => ray.start(1, 0.45, easeInCubic))),
      delay(0.3, all(icon().scale(1, 0.8, easeOutExpo), icon().rotation(0, 0.8, easeOutExpo))),
    );
    yield* all(rise(word, 0.05), delay(0.35, rise(tagline, 0.03)));
    yield* all(rule().start(0, 0.6, easeInOutCubic), rule().end(1, 0.6, easeInOutCubic));
    yield* url().text('kansoku.trade', 0.6);
    yield* waitFor(3);
    yield* root().opacity(0, 0.8);
  }

  return { node, play };
}
