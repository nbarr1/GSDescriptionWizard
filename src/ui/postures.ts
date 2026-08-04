/**
 * Body-position figures.
 *
 * Describing your own posture in words is slow and most people do it badly:
 * "bent over" covers a squat, a stoop and a twist, which are three different
 * mechanisms. Picking a figure takes a second and composes into precise prose.
 *
 * Each figure is coordinate data, not markup, so it is drawn with
 * createElementNS and never touches an HTML parser. Viewbox is 100 x 130 with
 * the floor at y=124.
 */

type Shape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'polyline'; points: [number, number][] }
  /** Context props - the ladder, the bench, the load - drawn in a lighter tone. */
  | { kind: 'prop'; points: [number, number][] };

const FLOOR: Shape = {
  kind: 'prop',
  points: [
    [6, 124],
    [94, 124],
  ],
};

/**
 * Figures are built head-down: head circle, spine, arms, legs. Keeping them in
 * this shape makes them easy to adjust without redrawing anything.
 */
export const POSTURE_FIGURES: Record<string, Shape[]> = {
  standing_upright: [
    FLOOR,
    { kind: 'circle', cx: 50, cy: 22, r: 10 },
    { kind: 'line', x1: 50, y1: 32, x2: 50, y2: 74 },
    {
      kind: 'polyline',
      points: [
        [32, 66],
        [50, 40],
        [68, 66],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [36, 124],
        [50, 74],
        [64, 124],
      ],
    },
  ],

  reaching_forward: [
    FLOOR,
    { kind: 'circle', cx: 44, cy: 24, r: 10 },
    { kind: 'line', x1: 44, y1: 34, x2: 46, y2: 74 },
    // Both arms extended horizontally in front of the body.
    {
      kind: 'polyline',
      points: [
        [46, 42],
        [70, 40],
        [90, 42],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [34, 124],
        [46, 74],
        [60, 124],
      ],
    },
  ],

  reaching_overhead: [
    FLOOR,
    { kind: 'circle', cx: 50, cy: 34, r: 10 },
    { kind: 'line', x1: 50, y1: 44, x2: 50, y2: 82 },
    // Arms above shoulder height, elbows extended.
    {
      kind: 'polyline',
      points: [
        [34, 8],
        [44, 30],
        [50, 48],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [66, 8],
        [56, 30],
        [50, 48],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [38, 124],
        [50, 82],
        [62, 124],
      ],
    },
  ],

  bent_forward: [
    FLOOR,
    { kind: 'circle', cx: 74, cy: 46, r: 10 },
    // Spine folded forward at the hip rather than the knee.
    {
      kind: 'polyline',
      points: [
        [74, 54],
        [56, 62],
        [44, 70],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [74, 58],
        [76, 84],
        [78, 100],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [34, 124],
        [44, 70],
        [54, 124],
      ],
    },
  ],

  bent_and_twisted: [
    FLOOR,
    { kind: 'circle', cx: 70, cy: 44, r: 10 },
    {
      kind: 'polyline',
      points: [
        [70, 52],
        [54, 62],
        [42, 72],
      ],
    },
    // Shoulders rotated away from the hips - the twist.
    {
      kind: 'polyline',
      points: [
        [54, 62],
        [40, 48],
        [26, 52],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [54, 62],
        [72, 74],
        [86, 70],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [32, 124],
        [42, 72],
        [56, 124],
      ],
    },
  ],

  squatting: [
    FLOOR,
    { kind: 'circle', cx: 50, cy: 40, r: 10 },
    { kind: 'line', x1: 50, y1: 50, x2: 52, y2: 84 },
    {
      kind: 'polyline',
      points: [
        [52, 60],
        [66, 74],
        [70, 90],
      ],
    },
    // Deep knee bend, heels down.
    {
      kind: 'polyline',
      points: [
        [52, 84],
        [74, 96],
        [64, 124],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [52, 84],
        [30, 96],
        [40, 124],
      ],
    },
  ],

  kneeling: [
    FLOOR,
    { kind: 'circle', cx: 46, cy: 40, r: 10 },
    { kind: 'line', x1: 46, y1: 50, x2: 48, y2: 88 },
    {
      kind: 'polyline',
      points: [
        [48, 62],
        [66, 68],
        [78, 76],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [48, 88],
        [70, 96],
        [72, 124],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [48, 88],
        [40, 110],
        [62, 124],
      ],
    },
  ],

  seated: [
    FLOOR,
    // Chair seat and back, drawn behind a figure facing left.
    {
      kind: 'prop',
      points: [
        [24, 92],
        [64, 92],
      ],
    },
    {
      kind: 'prop',
      points: [
        [64, 92],
        [64, 54],
      ],
    },
    { kind: 'circle', cx: 46, cy: 38, r: 10 },
    { kind: 'line', x1: 46, y1: 48, x2: 52, y2: 90 },
    {
      kind: 'polyline',
      points: [
        [50, 62],
        [34, 72],
        [26, 78],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [52, 90],
        [26, 92],
        [26, 124],
      ],
    },
  ],

  lying_or_fallen: [
    FLOOR,
    { kind: 'circle', cx: 22, cy: 108, r: 9 },
    { kind: 'line', x1: 31, y1: 110, x2: 66, y2: 114 },
    {
      kind: 'polyline',
      points: [
        [40, 112],
        [52, 94],
        [64, 96],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [66, 114],
        [82, 106],
        [92, 118],
      ],
    },
  ],

  on_ladder: [
    FLOOR,
    // Ladder rails and rungs behind the figure.
    {
      kind: 'prop',
      points: [
        [30, 8],
        [24, 124],
      ],
    },
    {
      kind: 'prop',
      points: [
        [70, 8],
        [76, 124],
      ],
    },
    {
      kind: 'prop',
      points: [
        [28, 44],
        [72, 44],
      ],
    },
    {
      kind: 'prop',
      points: [
        [26, 76],
        [74, 76],
      ],
    },
    {
      kind: 'prop',
      points: [
        [25, 108],
        [75, 108],
      ],
    },
    { kind: 'circle', cx: 50, cy: 30, r: 9 },
    { kind: 'line', x1: 50, y1: 39, x2: 50, y2: 76 },
    {
      kind: 'polyline',
      points: [
        [30, 46],
        [50, 48],
        [72, 34],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [40, 108],
        [50, 76],
        [60, 108],
      ],
    },
  ],

  leaning_over_barrier: [
    FLOOR,
    // A rail or machine side the figure is reaching across.
    {
      kind: 'prop',
      points: [
        [62, 78],
        [96, 78],
      ],
    },
    {
      kind: 'prop',
      points: [
        [70, 78],
        [70, 124],
      ],
    },
    { kind: 'circle', cx: 46, cy: 44, r: 10 },
    {
      kind: 'polyline',
      points: [
        [46, 52],
        [52, 66],
        [56, 76],
      ],
    },
    // Arm reaching past the barrier into the machine.
    {
      kind: 'polyline',
      points: [
        [52, 62],
        [74, 66],
        [92, 70],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [38, 124],
        [56, 76],
        [58, 124],
      ],
    },
  ],

  carrying_load: [
    FLOOR,
    { kind: 'circle', cx: 50, cy: 22, r: 10 },
    { kind: 'line', x1: 50, y1: 32, x2: 50, y2: 76 },
    // Load held against the chest, obscuring the view of the floor.
    {
      kind: 'prop',
      points: [
        [30, 44],
        [70, 44],
        [70, 66],
        [30, 66],
        [30, 44],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [30, 56],
        [40, 44],
        [50, 42],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [70, 56],
        [60, 44],
        [50, 42],
      ],
    },
    {
      kind: 'polyline',
      points: [
        [38, 124],
        [50, 76],
        [62, 124],
      ],
    },
  ],

  walking: [
    FLOOR,
    { kind: 'circle', cx: 50, cy: 22, r: 10 },
    { kind: 'line', x1: 50, y1: 32, x2: 50, y2: 74 },
    {
      kind: 'polyline',
      points: [
        [34, 58],
        [50, 42],
        [66, 60],
      ],
    },
    // Stride, rather than feet together.
    {
      kind: 'polyline',
      points: [
        [28, 124],
        [50, 74],
        [70, 124],
      ],
    },
  ],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Builds the figure as real SVG nodes. Nothing here parses a string, so this
 * path stays outside the reach of the no-HTML-sink rule by construction.
 */
export function buildPostureFigure(postureId: string): SVGSVGElement | null {
  const shapes = POSTURE_FIGURES[postureId];
  if (!shapes) return null;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 130');
  svg.setAttribute('class', 'posture__figure');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  for (const shape of shapes) {
    svg.appendChild(buildShape(shape));
  }
  return svg;
}

function buildShape(shape: Shape): SVGElement {
  if (shape.kind === 'circle') {
    const node = document.createElementNS(SVG_NS, 'circle');
    node.setAttribute('cx', String(shape.cx));
    node.setAttribute('cy', String(shape.cy));
    node.setAttribute('r', String(shape.r));
    node.setAttribute('class', 'posture__body');
    return node;
  }

  if (shape.kind === 'line') {
    const node = document.createElementNS(SVG_NS, 'line');
    node.setAttribute('x1', String(shape.x1));
    node.setAttribute('y1', String(shape.y1));
    node.setAttribute('x2', String(shape.x2));
    node.setAttribute('y2', String(shape.y2));
    node.setAttribute('class', 'posture__body');
    return node;
  }

  const node = document.createElementNS(SVG_NS, 'polyline');
  node.setAttribute('points', shape.points.map(([x, y]) => `${x},${y}`).join(' '));
  node.setAttribute('class', shape.kind === 'prop' ? 'posture__prop' : 'posture__body');
  return node;
}

export function hasPostureFigure(postureId: string): boolean {
  return postureId in POSTURE_FIGURES;
}
