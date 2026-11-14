import { createInteractiveCanvasModule } from "./interactiveModule.ts";
import type { ConstraintConfig } from "./constraints.ts";
import type { CanvasPointerEvents } from "./eventModule.ts";
import type { MoveModule, MoveOptions } from "./moveModule.ts";
import type { Rect } from "./pointUtils.ts";
import type { ScaleModule, ScaleOptions } from "./scaleModule.ts";
import { initState, type EngineState, type EngineStateOptions } from "./state.ts";

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

  zoomIn: ScaleModule["zoomIn"];
  zoomOut: ScaleModule["zoomOut"];
  zoomTo: ScaleModule["scaleTo"];
  zoomAt: ScaleModule["scaleAt"];
  zoomBy: ScaleModule["buttonScaleBy"];
  wheelZoom: ScaleModule["wheelScale"];
  pinchStart: ScaleModule["start"];
  pinch: ScaleModule["gestureScale"];
  pinchEnd: ScaleModule["cleanup"];
  isZoomEnabled: ScaleModule["isEnabled"];

  panStart: MoveModule["start"];
  pan: MoveModule["move"];
  panTo: MoveModule["moveTo"];
  panEnd: MoveModule["cleanup"];
  isPanEnabled: MoveModule["isEnabled"];

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
  scale: scaleOptions,
  constraints,
}: CanvasEngineOptions): CanvasEngine {
  const state = initState(stateOptions);
  const initial = stateOptions?.initial && state.getTransform();

  const interactiveModule = createInteractiveCanvasModule({
    state,
    move: moveOptions,
    scale: scaleOptions,
    constraints,
    getViewportRect,
  });

  const centerOn = (zoom: number): void => {
    const viewport = getViewportRect();
    const canvas = getCanvasRect();

    if (!viewport || !canvas) {
      return;
    }

    const scale = interactiveModule.constrainScale(zoom);

    state.setTransform(
      {
        origin: {
          x: canvas.width / 2 - viewport.width / (2 * scale),
          y: canvas.height / 2 - viewport.height / (2 * scale),
        },
        scale,
      },
      interactiveModule.constrainOrigin,
    );
  };

  const center = (): void => centerOn(state.getScale());

  const fit = (): void => centerOn(1);

  const reset = (): void => (initial ? state.setTransform(initial) : fit());

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
