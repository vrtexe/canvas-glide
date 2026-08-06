import type { Point, Rect } from "./pointUtils";

export const DEFAULT_ZOOM_CONSTRAINTS: Constraint = [0.25, 8];
export const CONSTRAINT_THRESHOLD = 0;

export const originConstrainerDefault: ConstraintOptions<Point, PointConstraint> = {
  enabled: false,
} as const;

export const defaultScaleConstraints: ConstraintOptions<number, Constraint> = {
  enabled: true,
  constraints: DEFAULT_ZOOM_CONSTRAINTS,
} as const;

export type ConstraintConfig = {
  origin?: ConstraintOptions<Point, PointConstraint>;
  scale?: ConstraintOptions<number, Constraint>;
};

export type Constraint = [number, number];
export type PointConstraint = { x: Constraint; y: Constraint };

export type Constrainer<V> = (value: V) => V;
export type ConstraintOptions<V, C> = {
  enabled?: boolean;
  constraints?: C;
  constrain?: Constrainer<V>;
};

export type PointConstrainer = Constrainer<Point>;
export type OriginConstrainer = Constrainer<number>;

export function constrain(value: number, constraints: Constraint) {
  const [min, max] = constraints;
  return constrainTo(value, min, max);
}

export function constrainTo(value: number, min: number, max: number) {
  return Math.max(Math.min(value, max), min);
}

export function constrainPoint(value: Point, constraints: PointConstraint): Point {
  return {
    x: constrain(value.x, constraints.x),
    y: constrain(value.y, constraints.y),
  };
}

export function createOriginConstrainer(
  config: ConstraintOptions<Point, PointConstraint> | undefined,
): PointConstrainer {
  if (config?.enabled === false) {
    return (value: Point): Point => value;
  }

  if (config?.constrain) {
    return config.constrain;
  }

  if (config?.constraints) {
    return (value: Point): Point => constrainPoint(value, config.constraints!);
  }

  return (value: Point): Point => value;
}

export function createScaleConstrainer(config: ConstraintOptions<number, Constraint> | undefined): OriginConstrainer {
  if (config?.enabled === false) {
    return (value: number): number => value;
  }

  if (config?.constrain) {
    return config.constrain;
  }

  if (config?.constraints) {
    return (value: number): number => constrain(value, config.constraints!);
  }

  return (value: number): number => value;
}

export function getConstraintsAt(rect: Rect, scale: number): PointConstraint {
  const vw = rect?.width;
  const vh = rect?.height;

  const halfVisibleX = vw / (2 * scale);
  const halfVisibleY = vh / (2 * scale);

  return {
    x: [-halfVisibleX + CONSTRAINT_THRESHOLD, vw + halfVisibleX - CONSTRAINT_THRESHOLD],
    y: [-halfVisibleY + CONSTRAINT_THRESHOLD, vh + halfVisibleY - CONSTRAINT_THRESHOLD],
  };
}
