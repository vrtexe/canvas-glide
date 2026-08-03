import createInteractiveCanvasModule from './interactiveModule';
import type { ConstraintConfig } from './constraints';
import type { MoveOptions } from './moveModule';
import type { Point, Rect } from './pointUtils';
import type { ScaleOptions } from './scaleModule';
import { initState, type EngineStateOptions } from './state';

type EngineOptions = {
  viewport: () => Rect | null;
  canvas: () => Rect | null;

  state?: EngineStateOptions;

  move?: MoveOptions;
  scale?: ScaleOptions;
  constraints?: ConstraintConfig;
};


export function createEngine({
  viewport: getViewportRect,
  canvas: getCanvasRect,
  state: stateOptions,
  move: moveOptions,
  constraints,
}: EngineOptions) {
  const state = initState(stateOptions);

  const interactiveModule = createInteractiveCanvasModule({
    state,
    move: moveOptions,
    constraints,
    getViewportRect(): Rect {
      const viewport = getViewportRect?.();
      if (!viewport) {
        throw new Error('Viewport not found');
      }
      return viewport;
    },
  });

  const getCenterOrigin = (zoomOverride = state.getScale()): Point => {
    const viewport = getViewportRect?.();
    const canvas = getCanvasRect?.();

    if (!viewport || !canvas) {
      return state.getOrigin();
    }

    const viewportRect = viewport;

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    return {
      x: canvasWidth / 2 - viewportRect.width / (2 * zoomOverride),
      y: canvasHeight / 2 - viewportRect.height / (2 * zoomOverride),
    };
  };

  const centerOn = (zoom: number): void => {
    state.setTransform({ origin: getCenterOrigin(zoom), scale: zoom });
  };

  const center = (): void => centerOn(state.getScale());

  const fit = (): void => centerOn(1);

  const reset = fit;

  return {
    stateService: state,
    scaleService: interactiveModule.scaleService,
    moveService: interactiveModule.moveService,

    reset,
    fit,
    center,

    event: interactiveModule.events,
  };
}

export default createEngine;
