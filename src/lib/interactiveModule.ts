import type { Rect } from './pointUtils.ts';
import { canvasPointerEvents } from './eventModule.ts';
import { createMovementModule, type MoveOptions } from './moveModule.ts';
import { type Point } from './pointUtils.ts';
import { createScaleModule, type ScaleOptions } from './scaleModule.ts';
import type { EngineState } from './state.ts';
import {
  createOriginConstrainer,
  createScaleConstrainer,
  defaultScaleConstraints,
  originConstrainerDefault,
  type ConstraintConfig,
  type ConstraintOptions,
  type PointConstraint,
} from './constraints.ts';

export type InteractiveCanvasModuleProps = {
  state: EngineState;

  move?: MoveOptions;
  scale?: ScaleOptions;

  constraints?: ConstraintConfig;

  zoomAt?: (scale: number, point: Point) => void;
  getViewportRect: () => Rect | null;
};

export function createInteractiveCanvasModule(
  props: InteractiveCanvasModuleProps,
) {
  const { state, getViewportRect, constraints } = props;

  const scaleConstrainConfig = {
    ...defaultScaleConstraints,
    ...(constraints?.scale || {}),
    constraints: constraints?.scale?.constraints ?? defaultScaleConstraints.constraints,
  };
  const originConstrainConfig: ConstraintOptions<Point, PointConstraint> = {
    ...originConstrainerDefault,
    ...(constraints?.origin || {}),
  };

  const constrainOrigin = createOriginConstrainer(originConstrainConfig);
  const constrainScale = createScaleConstrainer(scaleConstrainConfig);

  const moveService = createMovementModule({
    state,
    constrainOrigin,
    move: state.setOrigin,
    ...(props.move || {}),
  });

  const scaleService = createScaleModule({
    state,
    scale: (scale, origin) =>
      state.setTransform({ origin: origin, scale: scale }, constrainOrigin),
    constrainScale,
    panEnabled: () => moveService.isEnabled(),
    rect: getViewportRect,
    ...(props.scale || {})
  });

  const events = canvasPointerEvents({
    moveModule: moveService,
    scaleModule: scaleService,
  });

  return {
    scaleService,
    moveService,
    events,
    constrainScale,
    constrainOrigin,
  };
}
