import { Audio, Layout, makeScene2D } from '@revideo/2d';
import { all, createRefArray, createSignal, makeProject } from '@revideo/core';
import { C, Grid } from './components';
import { canvasScene } from './full/canvas';
import { chartScene } from './full/chart';
import { checkScene } from './full/check';
import type { Scene } from './full/chrome';
import { endScene } from './full/end';
import { hookScene } from './full/hook';
import { recordScene } from './full/record';
import { scenariosScene } from './full/scenarios';
import { syncScene } from './full/sync';
import { trainScene } from './full/train';
import { verifyScene } from './full/verify';
import { watchScene } from './full/watch';

const fullIntro = makeScene2D('kansoku-full-intro', function* (view) {
  const grid = createSignal(0.4);
  const slots = createRefArray<Layout>();
  const scenes: Scene[] = [
    hookScene(),
    verifyScene(),
    chartScene(),
    checkScene(),
    scenariosScene(),
    canvasScene(),
    watchScene(),
    recordScene(),
    trainScene(),
    syncScene(),
    endScene(),
  ];

  view.fill(C.bg);
  view.add(
    <>
      <Audio src={'/audio/full-bgm.mp3'} play volume={1} />
      <Grid opacity={grid} />
      {scenes.map((scene, index) => (
        <Layout key={`scene-${index}`} ref={slots} opacity={index === 0 ? 1 : 0}>
          {scene.node}
        </Layout>
      ))}
    </>,
  );

  for (const [index, scene] of scenes.entries()) {
    slots[index].opacity(1);
    const previous = scenes[index - 1];
    yield* all(scene.play(), previous?.outro ? previous.outro() : all());
    if (previous?.outro) slots[index - 1].opacity(0);
    if (!scene.outro) slots[index].opacity(0);
  }
});

export default makeProject({
  scenes: [fullIntro],
  settings: {
    shared: {
      size: { x: 1920, y: 1080 },
    },
  },
});
