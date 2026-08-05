import { createInteractiveCanvasModule } from "./interactiveModule";
import type { ConstraintConfig } from "./constraints";
import type { CanvasPointerEvents } from "./eventModule";
import type { MoveModule, MoveOptions } from "./moveModule";
import type { Point, Rect } from "./pointUtils";
import type { ScaleModule, ScaleOptions } from "./scaleModule";
import { initState, type EngineState, type EngineStateOptions } from "./state";

export type CanvasEngineOptions = {
  getViewportRect: () => Rect | null;
  getCanvasRect: () => Rect | null;

  state?: EngineStateOptions;

  move?: MoveOptions;
  scale?: ScaleOptions;
  constraints?: ConstraintConfig;
};

/**
 * The flat members are the everyday API; the *Service objects expose the
 * underlying modules for full control. The flat names are mapped explicitly
 * (never spread) so a name can exist only once — a collision is a compile
 * error here instead of a silent override. Signatures are borrowed from the
 * modules via indexed access, so they can never drift out of sync.
 */
export type CanvasEngine = EngineState & {
  stateService: EngineState;
  scaleService: ScaleModule;
  moveService: MoveModule;

  zoomIn: ScaleModule['zoomIn'];
  zoomOut: ScaleModule['zoomOut'];
  zoomTo: ScaleModule['scaleTo'];
  zoomAt: ScaleModule['scaleAt'];
  zoomBy: ScaleModule['buttonScaleBy'];
  wheelZoom: ScaleModule['wheelScale'];
  pinchStart: ScaleModule['start'];
  pinch: ScaleModule['gestureScale'];
  pinchEnd: ScaleModule['cleanup'];
  isZoomEnabled: ScaleModule['isEnabled'];

  panStart: MoveModule['start'];
  pan: MoveModule['move'];
  panTo: MoveModule['moveTo'];
  panEnd: MoveModule['cleanup'];
  isPanEnabled: MoveModule['isEnabled'];

  reset: () => void;
  fit: () => void;
  center: () => void;

  event: CanvasPointerEvents;
};

export function createEngine({
  getViewportRect: getViewportRect,
  getCanvasRect: getCanvasRect,
  state: stateOptions,
  move: moveOptions,
  constraints,
}: CanvasEngineOptions): CanvasEngine {
  const state = initState(stateOptions);

  const interactiveModule = createInteractiveCanvasModule({
    state,
    move: moveOptions,
    constraints,
    getViewportRect(): Rect {
      const viewport = getViewportRect?.();
      if (!viewport) {
        throw new Error("Viewport not found");
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

  const scale = interactiveModule.scaleService;
  const move = interactiveModule.moveService;

  return {
    stateService: state,
    scaleService: scale,
    moveService: move,

    getTransform: state.getTransform,
    setTransform: state.setTransform,
    getOrigin: state.getOrigin,
    setOrigin: state.setOrigin,
    getScale: state.getScale,
    setScale: state.setScale,

    zoomIn: scale.zoomIn,
    zoomOut: scale.zoomOut,
    zoomTo: scale.scaleTo,
    zoomAt: scale.scaleAt,
    zoomBy: scale.buttonScaleBy,
    wheelZoom: scale.wheelScale,
    pinchStart: scale.start,
    pinch: scale.gestureScale,
    pinchEnd: scale.cleanup,
    isZoomEnabled: scale.isEnabled,

    panStart: move.start,
    pan: move.move,
    panTo: move.moveTo,
    panEnd: move.cleanup,
    isPanEnabled: move.isEnabled,

    reset,
    fit,
    center,

    event: interactiveModule.events,
  };
}
