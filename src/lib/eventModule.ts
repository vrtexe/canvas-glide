import type { MoveModule } from "./moveModule.ts";
import { extractPoint, type Point } from "./pointUtils.ts";
import type { ScaleModule } from "./scaleModule.ts";

export type CanvasPointerEvents = {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
  onPointerCancel: (e: PointerEvent) => void;
  onWheel: (e: WheelEvent) => void;
};

export type CanvasPointerEventProps = {
  moveModule: MoveModule;
  scaleModule: ScaleModule;
};

export function canvasPointerEvents(props: CanvasPointerEventProps): CanvasPointerEvents {
  const { moveModule, scaleModule } = props;

  const pointers: Map<number, Point> = new Map();

  let moveEnabled: boolean = false;
  let scaleEnabled: boolean = false;
  // The pan follows one pointer only; other pointers either pinch or are ignored.
  let panPointerId: number | undefined;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0 || (!moveModule.isEnabled() && !scaleModule.isEnabled())) {
      return;
    }

    e.stopPropagation();

    if (e.currentTarget instanceof Element) e.currentTarget.setPointerCapture(e.pointerId);

    pointers.set(e.pointerId, extractPoint(e));

    computeActionState();

    if (scaleEnabled) {
      scaleModule.start(pointers.values());
    } else if (moveEnabled && (panPointerId === undefined || panPointerId === e.pointerId)) {
      panPointerId = e.pointerId;
      moveModule.start(extractPoint(e));
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const pointer = pointers.get(e.pointerId);
    if (!pointer || (!moveEnabled && !scaleEnabled)) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    pointer.x = e.clientX;
    pointer.y = e.clientY;

    if (scaleEnabled) {
      scaleModule.gestureScale(pointers.values());
    } else if (e.pointerId === panPointerId) {
      moveModule.move(pointer);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) {
      return;
    }

    e.preventDefault();

    if (e.currentTarget instanceof Element && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    scaleModule.cleanup();
    panPointerId = undefined;

    computeActionState();

    if (scaleEnabled) {
      scaleModule.start(pointers.values());
    } else if (moveEnabled) {
      const [id, point] = pointers.entries().next().value!;
      panPointerId = id;
      moveModule.start(point);
    } else {
      moveModule.cleanup();
    }
  };

  function computeActionState() {
    const devices = pointers.size;

    moveEnabled = moveModule.isEnabled() && devices >= 1;
    scaleEnabled = scaleModule.isEnabled() && devices >= 2;
  }

  const onWheel: (e: WheelEvent) => void = (e) => {
    if (!scaleModule.isEnabled()) {
      return;
    }

    e.stopPropagation();
    e.preventDefault();

    const unit = (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 800 : 1) * (e.ctrlKey ? 10 : 1);
    const deltaPx = Math.max(-120, Math.min(120, e.deltaY * unit));
    scaleModule.wheelScale(deltaPx, extractPoint(e));
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
    onWheel,
  };
}
