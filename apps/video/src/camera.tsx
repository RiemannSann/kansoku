import { Img, Layout, Rect } from '@revideo/2d';
import {
  type Reference,
  type ThreadGenerator,
  all,
  easeInOutCubic,
  easeInOutExpo,
} from '@revideo/core';
import type { Region, Shot } from './motion';

const K = 1660 / 2880;
const PAD = 14;
const BIG = 3000;
const SPOT = '#000000A3';

export interface CameraRefs {
  cam: Reference<Layout>;
  spot: Reference<Layout>;
  hole: Reference<Rect>;
  ring: Reference<Rect>;
}

export function local(region: Region) {
  return {
    x: K * (region.x + region.w / 2 - 1440),
    y: K * (region.y + region.h / 2 - 900),
    w: K * region.w + PAD * 2,
    h: K * region.h + PAD * 2,
  };
}

export function frameOn(region: Region, scale: number, anchorY: number): Shot {
  const box = local(region);
  return { x: -scale * box.x, y: anchorY - scale * box.y, scale };
}

export const overview: Shot = { x: 0, y: -10, scale: 0.74 };

export function Camera({ refs, src, accent }: { refs: CameraRefs; src: string; accent: string }) {
  return (
    <Layout ref={refs.cam} x={overview.x} y={overview.y} scale={overview.scale}>
      <Img src={src} width={1660} />
      <Rect ref={refs.hole} opacity={0} />
      <Layout ref={refs.spot} opacity={0}>
        <Rect
          fill={SPOT}
          x={() => refs.hole().x()}
          y={() => refs.hole().y() - refs.hole().height() / 2 - BIG / 2}
          width={BIG * 2}
          height={BIG}
        />
        <Rect
          fill={SPOT}
          x={() => refs.hole().x()}
          y={() => refs.hole().y() + refs.hole().height() / 2 + BIG / 2}
          width={BIG * 2}
          height={BIG}
        />
        <Rect
          fill={SPOT}
          x={() => refs.hole().x() - refs.hole().width() / 2 - BIG / 2}
          y={() => refs.hole().y()}
          width={BIG}
          height={() => refs.hole().height()}
        />
        <Rect
          fill={SPOT}
          x={() => refs.hole().x() + refs.hole().width() / 2 + BIG / 2}
          y={() => refs.hole().y()}
          width={BIG}
          height={() => refs.hole().height()}
        />
      </Layout>
      <Rect
        ref={refs.ring}
        stroke={accent}
        lineWidth={3}
        radius={12}
        shadowColor={accent}
        shadowBlur={24}
        end={0}
      />
    </Layout>
  );
}

function place(node: Rect, box: ReturnType<typeof local>) {
  node.position([box.x, box.y]);
  node.size([box.w, box.h]);
}

export function* ringIn(refs: CameraRefs, region: Region): ThreadGenerator {
  const box = local(region);
  place(refs.hole(), box);
  place(refs.ring(), box);
  refs.ring().opacity(1);
  yield* all(refs.spot().opacity(1, 0.5), refs.ring().end(1, 0.8, easeInOutCubic));
}

export function* ringTo(refs: CameraRefs, region: Region, duration = 0.9): ThreadGenerator {
  const box = local(region);
  yield* all(
    refs.hole().position([box.x, box.y], duration, easeInOutExpo),
    refs.hole().size([box.w, box.h], duration, easeInOutExpo),
    refs.ring().position([box.x, box.y], duration, easeInOutExpo),
    refs.ring().size([box.w, box.h], duration, easeInOutExpo),
  );
}

export function* ringOut(refs: CameraRefs): ThreadGenerator {
  yield* all(refs.spot().opacity(0, 0.4), refs.ring().opacity(0, 0.3));
}

export function* snap(refs: CameraRefs, shot: Shot, duration = 0.9): ThreadGenerator {
  const cam = refs.cam();
  yield* all(
    cam.scale(shot.scale, duration, easeInOutExpo),
    cam.x(shot.x, duration, easeInOutExpo),
    cam.y(shot.y, duration, easeInOutExpo),
    cam.filters.blur(5, duration * 0.4).to(0, duration * 0.6),
  );
  // Revideo renders filtered or shadowed nodes from a cache that ignores later child changes.
  cam.filters([]);
}
