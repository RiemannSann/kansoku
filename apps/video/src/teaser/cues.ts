export const FPS = 30;
export const BEAT = 15;

const b = (beats: number) => beats * BEAT;

export const DROP_BEATS = [3, 2, 3, 2, 3, 2, 3, 2];
export const FLASH_FRAMES = [12, 10, 9, 8, 7, 6, 4, 4];

const dropStart = b(28);
export const DROP_CUTS = DROP_BEATS.map(
  (_, index) => dropStart + b(DROP_BEATS.slice(0, index).reduce((sum, n) => sum + n, 0)),
);
const flashStart = b(48);
export const FLASH_CUTS = FLASH_FRAMES.map(
  (_, index) => flashStart + FLASH_FRAMES.slice(0, index).reduce((sum, n) => sum + n, 0),
);

export const CUE = {
  pull: b(1),
  slam: b(3),
  slamOut: b(7),
  zoomOut: b(8),
  line: b(10),
  lineOut: b(17),
  wall: b(20),
  silence: b(27),
  drop: dropStart,
  flash: flashStart,
  collapse: b(52),
  merge: b(55),
  end: b(58),
  tagline: b(62),
  total: b(72),
};

export const sec = (frames: number) => frames / FPS;

// Revideo sums frame times in floats, so a cut landing exactly on a frame boundary can slip one frame late.
export const cueTime = (frames: number) => sec(frames) - 1e-4;
