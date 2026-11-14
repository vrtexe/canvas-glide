import { type Point } from './pointUtils.ts';
import { copyPoint, isSameTransform, type EngineState, type Transform } from './state.ts';

export type MoveOptions = {
  enabled?: boolean;
  onIsMovingChange?: (isMoving: boolean) => void;
};

export type MoveConfig = {
  state: EngineState;
  move: (origin: Point) => void;
  constrainOrigin: (origin: Point) => Point;
} & MoveOptions;

export type MoveModule = {
  start: (point: Point) => void;
  cleanup: () => void;
  move: (point: Point) => void;
  moveTo: (origin: Point) => void;
  isEnabled: () => boolean;
};

type Drag = {
  startPoint: Point;
  startOrigin: Point;
  lastPoint: Point;
  lastTransform: Transform;
};

/**
 * origin = startOrigin − ((pointer − startPoint) / zoom)
 *
 * @param config
 * @returns
 */
export function createMovementModule(config: MoveConfig): MoveModule {
  let drag: Drag | undefined;
  let isMoving = false;

  function anchorAt(point: Point): Drag {
    const transform = config.state.getTransform();
    return { startPoint: point, startOrigin: transform.origin, lastPoint: point, lastTransform: transform };
  }

  return {
    isEnabled: () => config.enabled !== false,
    start: (point: Point) => {
      if (!isMoving) {
        isMoving = true;
        config.onIsMovingChange?.(isMoving);
      }
      drag = anchorAt(copyPoint(point));
    },
    cleanup: () => {
      if (isMoving) {
        isMoving = false;
        config.onIsMovingChange?.(isMoving);
      }
      drag = undefined;
    },
    move: (point: Point) => {
      if (!drag) {
        return;
      }

      // A zoom or pan from elsewhere since the last step: continue from it instead of overwriting it.
      if (!isSameTransform(drag.lastTransform, config.state.getTransform())) {
        drag = anchorAt(drag.lastPoint);
      }

      const scale = config.state.getScale();

      const dx = point.x - drag.startPoint.x;
      const dy = point.y - drag.startPoint.y;

      config.move(
        config.constrainOrigin({
          x: drag.startOrigin.x - dx / scale,
          y: drag.startOrigin.y - dy / scale,
        }),
      );

      drag.lastPoint = copyPoint(point);
      drag.lastTransform = config.state.getTransform();
    },
    moveTo: (origin: Point) => {
      config.move(config.constrainOrigin(origin));
    },
  };
}
