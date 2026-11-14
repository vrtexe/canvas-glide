import { calculateDistance, calculateMiddlePoint, convertToRelativeCoords, type Point, type Rect } from "./pointUtils.ts";
import { copyPoint, isSameTransform, type EngineState, type Transform } from "./state.ts";

export const WHEEL_SCALE_VELOCITY = 0.0015;
export const ZOOM_STEP = 0.1;

export type ScaleOptions = {
  enabled?: boolean;
  wheelVelocity?: number | undefined;
  zoomStep?: number | undefined;
};

export type ScaleConfig = ScaleOptions & {
  state: EngineState;
  scale: (scale: number, origin: Point) => void;
  rect: () => Rect | null;
  constrainScale: (scale: number) => number;
  panEnabled?: () => boolean;
};

export type ScaleModule = {
  start: (points: Iterable<Point>) => void;
  cleanup: () => void;
  scaleAt: (scale: number, point: Point) => void;
  scaleTo: (scale: number, pivot?: Point) => void;
  zoomIn: (step?: number) => void;
  zoomOut: (step?: number) => void;
  gestureScale: (pointers: Iterable<Point>) => void;
  wheelScale: (scroll: number, absolutePoint: Point) => void;
  buttonScale: (newScale: number) => void;
  buttonScaleBy: (delta: number) => void;
  isEnabled: () => boolean;
};

type Pinch = {
  startPoints: Point[];
  startState: Transform;
  lastPoints: Point[];
  lastState: Transform;
};

export function createScaleModule(config: ScaleConfig): ScaleModule {
  const wheelVelocity = config.wheelVelocity ?? WHEEL_SCALE_VELOCITY;
  const zoomStep = config.zoomStep ?? ZOOM_STEP;

  let pinch: Pinch | undefined;

  function anchorAt(points: Point[]): Pinch {
    const state = config.state.getTransform();
    return { startPoints: points, startState: state, lastPoints: points, lastState: state };
  }

  function scaleAt(scale: number, point: Point) {
    const px = point.x;
    const py = point.y;

    const currentScale = config.state.getScale();
    const nextScale = config.constrainScale(scale * currentScale);
    const prevOrigin = config.state.getOrigin();

    config.scale(nextScale, {
      x: prevOrigin.x - (px / nextScale - px / currentScale),
      y: prevOrigin.y - (py / nextScale - py / currentScale),
    });
  }

  function scaleAtCenter(scale: number) {
    const rect = config.rect();
    if (rect) scaleAt(scale, { x: rect.width / 2, y: rect.height / 2 });
  }

  return {
    isEnabled: () => config.enabled !== false,
    start(points: Iterable<Point>) {
      pinch = anchorAt([...points].slice(0, 2).map(copyPoint));
    },
    cleanup() {
      pinch = undefined;
    },
    gestureScale(pointers) {
      const rect = config.rect();
      if (!pinch || pinch.startPoints.length !== 2 || !rect) {
        return;
      }

      // A zoom or pan from elsewhere since the last step: continue from it instead of overwriting it.
      if (!isSameTransform(pinch.lastState, config.state.getTransform())) {
        pinch = anchorAt(pinch.lastPoints);
      }

      const [p1, p2] = pointers;
      const [startP1, startP2] = pinch.startPoints;

      const startDistance = calculateDistance(startP1, startP2);
      const currentDistance = calculateDistance(p1, p2);

      if (startDistance === 0 || currentDistance === 0) {
        return;
      }

      const startScale = pinch.startState.scale;
      const startOrigin = pinch.startState.origin;

      const midpoint = midPointCalculator(rect);

      const startMid = midpoint(startP1, startP2);
      const currentMid = config.panEnabled?.() === false ? startMid : midpoint(p1, p2);

      const nextScale = config.constrainScale(startScale * (currentDistance / startDistance));

      config.scale(nextScale, {
        x: startOrigin.x + startMid.x / startScale - currentMid.x / nextScale,
        y: startOrigin.y + startMid.y / startScale - currentMid.y / nextScale,
      });

      pinch.lastPoints = [p1, p2].map(copyPoint);
      pinch.lastState = config.state.getTransform();
    },
    wheelScale(scroll, absolutePoint) {
      const rect = config.rect();
      if (!rect) return;

      scaleAt(Math.exp(-scroll * wheelVelocity), convertToRelativeCoords(absolutePoint, rect));
    },
    buttonScale(newScale) {
      scaleAtCenter(newScale / config.state.getScale());
    },
    scaleAt(scale: number, point: Point) {
      scaleAt(scale, point);
    },
    scaleTo(scale, pivot) {
      const factor = scale / config.state.getScale();
      if (pivot) scaleAt(factor, pivot);
      else scaleAtCenter(factor);
    },
    zoomIn(step = zoomStep) {
      scaleAtCenter(1 + step);
    },
    zoomOut(step = zoomStep) {
      scaleAtCenter(1 / (1 + step));
    },
    buttonScaleBy(delta) {
      scaleAtCenter((config.state.getScale() + delta) / config.state.getScale());
    },
  };
}

function midPointCalculator(rect: Rect) {
  return (a: Point, b: Point): Point =>
    calculateMiddlePoint(convertToRelativeCoords(a, rect), convertToRelativeCoords(b, rect));
}
