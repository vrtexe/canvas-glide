import { type Point } from './pointUtils.ts';
import { copyPoint, type EngineState } from './state.ts';

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

/**
 * origin = startOrigin − ((pointer − startPoint) / zoom)
 *
 * @param config
 * @returns
 */
export function createMovementModule(config: MoveConfig): MoveModule {
  let startPoint: Point | undefined;
  let startOrigin: Point | undefined;
  let isMoving = false;
  return {
    isEnabled: () => config.enabled !== false,
    start: (point: Point) => {
      if (!isMoving) {
        isMoving = true;
        config.onIsMovingChange?.(isMoving);
      }
      startPoint = copyPoint(point);
      startOrigin = { ...config.state.getOrigin() };
    },
    cleanup: () => {
      if (isMoving) {
        isMoving = false;
        config.onIsMovingChange?.(isMoving);
      }
      startPoint = undefined;
      startOrigin = undefined;
    },
    move: (point: Point) => {
      if (!startPoint || !startOrigin) {
        return;
      }

      const scale = config.state.getScale();

      const dx = point.x - startPoint.x;
      const dy = point.y - startPoint.y;

      config.move(
        config.constrainOrigin({
          x: startOrigin.x - dx / scale,
          y: startOrigin.y - dy / scale,
        }),
      );
    },
    moveTo: (origin: Point) => {
      config.move(config.constrainOrigin(origin));
    },
  };
}
