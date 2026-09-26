import { type Layout, Line } from '@revideo/2d';
import { type ThreadGenerator, all, createRef, delay, easeInCubic, easeOutExpo } from '@revideo/core';
import { C } from '../components';
import { CUE, cueTime } from './cues';
import { WALL_END, type World } from './world';

export function createWall(world: World, worldRoot: () => Layout) {
  const line = createRef<Line>();

  const node = (
    <Line
      ref={line}
      points={[
        [-960, 0],
        [960, 0],
      ]}
      stroke={C.paper}
      lineWidth={2}
      start={0.5}
      end={0.5}
    />
  );

  function* play(): ThreadGenerator {
    const fly = cueTime(CUE.silence - CUE.wall);
    yield* all(
      world.toWall(0.7),
      world.camZ(WALL_END, fly, easeInCubic),
      delay(fly, silence()),
    );
  }

  function* silence(): ThreadGenerator {
    worldRoot().opacity(0);
    yield* all(line().start(0.2, cueTime(CUE.drop - CUE.silence), easeOutExpo), line().end(0.8, cueTime(CUE.drop - CUE.silence), easeOutExpo));
    line().opacity(0);
  }

  return { node, play };
}
