import type { Point } from "./pointUtils.ts";

export type Transform = {
  origin: Point;
  scale: number;
};

export type EngineStateOptions = {
  initial?: Transform;
  onTransformChange?: (newTransform: Transform) => void;
  onScaleChange?: (newScale: number) => void;
  onOriginChange?: (newOrigin: Point) => void;
};

export type EngineState = {
  getTransform: () => Transform;
  setTransform: (newTransform: Transform, constrainOrigin?: (origin: Point) => Point) => void;
  getOrigin: () => Point;
  setOrigin: (newOrigin: Point) => void;
  getScale: () => number;
  setScale: (newValue: number) => void;
};

export function copyTransform(transform: Transform): Transform {
  return {
    origin: copyPoint(transform.origin),
    scale: transform.scale,
  };
}

export function copyPoint(point: Point): Point {
  return {
    x: point.x,
    y: point.y,
  };
}

export function isSameTransform(a: Transform, b: Transform): boolean {
  return a.scale === b.scale && a.origin.x === b.origin.x && a.origin.y === b.origin.y;
}

const defaultTransform: Transform = {
  origin: { x: 0, y: 0 },
  scale: 1,
};

export function initState(options?: EngineStateOptions): EngineState {
  const { onTransformChange, onScaleChange, onOriginChange } = options || {};
  const transform = copyTransform({
    ...defaultTransform,
    ...(options?.initial || {}),
  });

  function getTransform() {
    return copyTransform(transform);
  }

  // The scale is written before the origin is constrained, so a constrainer that reads the scale sees the new one.
  function setTransform(newTransform: Transform, constrainOrigin?: (origin: Point) => Point) {
    const previous = copyTransform(transform);

    transform.scale = newTransform.scale;
    const origin = constrainOrigin ? constrainOrigin(newTransform.origin) : newTransform.origin;

    if (![origin.x, origin.y, newTransform.scale].every(Number.isFinite)) {
      transform.scale = previous.scale;
      return;
    }

    transform.origin = copyPoint(origin);

    const originChanged = previous.origin.x !== origin.x || previous.origin.y !== origin.y;
    const scaleChanged = previous.scale !== transform.scale;

    if (originChanged) onOriginChange?.(copyPoint(origin));
    if (scaleChanged) onScaleChange?.(transform.scale);
    if (originChanged || scaleChanged) onTransformChange?.(copyTransform(transform));
  }

  function getOrigin() {
    return copyPoint(transform.origin);
  }

  function setOrigin(newOrigin: Point) {
    setTransform({ origin: newOrigin, scale: transform.scale });
  }

  function setScale(newValue: number) {
    setTransform({ origin: transform.origin, scale: newValue });
  }

  function getScale() {
    return transform.scale;
  }

  return {
    getTransform,
    setTransform,
    getOrigin,
    setOrigin,
    getScale,
    setScale,
  };
}
