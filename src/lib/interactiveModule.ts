import type { Rect } from './pointUtils';
import { canvasPointerEvents } from './eventModule';
import createMovementModule, { type MoveOptions } from './moveModule';
import { type Point } from './pointUtils';
import createScaleModule, { type ScaleOptions } from './scaleModule';
import type { EngineState } from './state';
import {
  createOriginConstrainer,
  createScaleConstrainer,
  defaultScaleConstraints,
  originConstrainerDefault,
  type ConstraintConfig,
  type ConstraintOptions,
  type PointConstraint,
} from './constraints';

export type InteractiveCanvasModuleProps = {
  state: EngineState;

  move?: MoveOptions;
  scale?: ScaleOptions;

  constraints?: ConstraintConfig;

  zoomAt?: (scale: number, point: Point) => void;
  getViewportRect: () => Rect;
};

export default function createInteractiveCanvasModule(
  props: InteractiveCanvasModuleProps,
) {
  const { state, getViewportRect, constraints } = props;

  const scaleConstrainConfig = {
    ...defaultScaleConstraints,
    ...(constraints?.scale || {}),
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
      state.setTransform({ origin: origin, scale: scale }),
    constrainScale,
    constrainOrigin,
    rect: getViewportRect,
  });

  const events = canvasPointerEvents({
    moveModule: moveService,
    scaleModule: scaleService,
  });

  return {
    scaleService,
    moveService,
    events,
    isMoving: true,
  };
}
