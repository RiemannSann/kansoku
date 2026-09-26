import { Audio, Gradient, Layout, Rect, makeScene2D } from '@revideo/2d';
import { createRef, makeProject } from '@revideo/core';
import { C } from './components';
import { createCollapse } from './teaser/collapse';
import { createDrop } from './teaser/drop';
import { createEnd } from './teaser/end';
import { createHook } from './teaser/hook';
import { createWall } from './teaser/wall';
import { createWorld } from './teaser/world';

const vignette = new Gradient({
  type: 'radial',
  from: 0,
  to: 0,
  fromRadius: 380,
  toRadius: 1150,
  stops: [
    { offset: 0, color: '#00000000' },
    { offset: 1, color: '#000000B0' },
  ],
});

const teaser = makeScene2D('kansoku-teaser', function* (view) {
  const stage = createRef<Layout>();
  const worldRoot = createRef<Layout>();
  const world = createWorld();
  const hook = createHook(world, stage);
  const wall = createWall(world, worldRoot);
  const drop = createDrop();
  const collapse = createCollapse();
  const end = createEnd(collapse);

  view.fill(C.bg);
  view.add(
    <>
      <Audio src={'/audio/teaser-bgm.mp3'} play volume={1} />
      <Layout ref={stage}>
        <Layout ref={worldRoot}>{world.node}</Layout>
        {hook.node}
        {wall.node}
        {drop.node}
        {end.node}
        {collapse.node}
      </Layout>
      <Rect width={1920} height={1080} fill={vignette} />
    </>,
  );

  yield* hook.play();
  yield* wall.play();
  yield* drop.play(stage());
  yield* drop.flashback();
  yield* collapse.play(stage());
  yield* end.play();
});

export default makeProject({
  scenes: [teaser],
  settings: {
    shared: {
      size: { x: 1920, y: 1080 },
    },
  },
});
