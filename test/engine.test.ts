import { test } from "vitest";
import assert from "node:assert/strict";
import { createEngine, type CanvasEngine, type CanvasEngineOptions } from "../src/canvas-glide.ts";

// The pointer handlers check `currentTarget instanceof Element`; Node has no DOM.
(globalThis as { Element?: unknown }).Element ??= class {};

const rect = () => ({ x: 0, y: 0, width: 800, height: 600 });
const engineWith = (options: Partial<CanvasEngineOptions> = {}) =>
  createEngine({ getViewportRect: rect, getCanvasRect: rect, ...options });

const pointer = (pointerId: number, clientX: number, clientY: number, extra: object = {}) =>
  ({ pointerId, clientX, clientY, button: 0, currentTarget: null, stopPropagation() {}, preventDefault() {}, ...extra }) as unknown as PointerEvent;

const wheel = (deltaY: number, clientX = 400, clientY = 300) => {
  const e = { deltaY, deltaMode: 0, ctrlKey: false, clientX, clientY, prevented: false, stopPropagation() {}, preventDefault() { e.prevented = true; } };
  return e;
};

test("engines do not share the default origin, and the caller's initial origin is not mutated", () => {
  const a = engineWith();
  a.panTo({ x: 123, y: 45 });
  assert.deepEqual(engineWith().getOrigin(), { x: 0, y: 0 });

  const initial = { origin: { x: 1, y: 2 }, scale: 1 };
  engineWith({ state: { initial } }).panTo({ x: 50, y: 60 });
  assert.deepEqual(initial.origin, { x: 1, y: 2 });
});

test("origin constraints apply without enabled: true", () => {
  const engine = engineWith({ constraints: { origin: { constraints: { x: [0, 100], y: [0, 100] } } } });
  engine.panTo({ x: 500, y: -500 });
  assert.deepEqual(engine.getOrigin(), { x: 100, y: 0 });
});

test("the wheel neither zooms nor blocks page scrolling when zoom is disabled", () => {
  const engine = engineWith({ scale: { enabled: false } });
  const e = wheel(-100);
  engine.event.onWheel(e as unknown as WheelEvent);
  assert.equal(engine.getScale(), 1);
  assert.equal(e.prevented, false);
});

test("a wheel zoom keeps the point under the cursor", () => {
  const engine = engineWith();
  const before = { x: engine.getOrigin().x + 200 / engine.getScale(), y: engine.getOrigin().y + 150 / engine.getScale() };
  engine.event.onWheel(wheel(-100, 200, 150) as unknown as WheelEvent);
  const after = { x: engine.getOrigin().x + 200 / engine.getScale(), y: engine.getOrigin().y + 150 / engine.getScale() };
  assert.ok(engine.getScale() > 1);
  assert.ok(Math.abs(after.x - before.x) < 1e-9 && Math.abs(after.y - before.y) < 1e-9);
});

test("a pinch scales by the finger distance and respects origin constraints", () => {
  const engine = engineWith({ constraints: { origin: { constraints: { x: [0, 100], y: [0, 100] } } } });
  engine.event.onPointerDown(pointer(1, 100, 100));
  engine.event.onPointerDown(pointer(2, 200, 100));
  engine.event.onPointerMove(pointer(2, 300, 100));
  assert.equal(engine.getScale(), 2);
  const { x, y } = engine.getOrigin();
  assert.ok(x >= 0 && x <= 100 && y >= 0 && y <= 100, `origin ${x},${y} outside the constraints`);
});

test("with zoom disabled, only the first finger pans", () => {
  const engine = engineWith({ scale: { enabled: false } });
  engine.event.onPointerDown(pointer(1, 100, 100));
  engine.event.onPointerDown(pointer(2, 400, 100));
  engine.event.onPointerMove(pointer(2, 401, 100));
  assert.deepEqual(engine.getOrigin(), { x: 0, y: 0 });
  engine.event.onPointerMove(pointer(1, 99, 100));
  assert.deepEqual(engine.getOrigin(), { x: 1, y: 0 });
});

test("a third finger neither jumps the view nor breaks the pinch", () => {
  const engine = engineWith();
  engine.event.onPointerDown(pointer(1, 100, 100));
  engine.event.onPointerDown(pointer(2, 200, 100));
  engine.event.onPointerDown(pointer(3, 500, 100));
  engine.event.onPointerMove(pointer(1, 101, 100));
  // A 1 px pinch step moves the origin by about 2; the old pan hand-off jumped by about 400.
  assert.ok(Math.abs(engine.getOrigin().x) < 10, `origin jumped to ${engine.getOrigin().x}`);
  engine.event.onPointerMove(pointer(2, 300, 100));
  assert.ok(engine.getScale() > 1.9);
});

test("moves from a pointer that was never pressed are ignored", () => {
  const engine = engineWith();
  engine.event.onPointerDown(pointer(1, 100, 100));
  engine.event.onPointerMove(pointer(9, 500, 400));
  assert.deepEqual(engine.getOrigin(), { x: 0, y: 0 });
});

test("a cancelled pointer is forgotten", () => {
  const engine = engineWith();
  engine.event.onPointerDown(pointer(1, 100, 100));
  engine.event.onPointerCancel(pointer(1, 100, 100));
  engine.event.onPointerDown(pointer(2, 200, 200));
  engine.event.onPointerMove(pointer(2, 300, 200));
  assert.equal(engine.getScale(), 1);
  assert.deepEqual(engine.getOrigin(), { x: -100, y: 0 });
});

test("a second press of the same pointer without a lift restarts the drag there", () => {
  const engine = engineWith();
  engine.event.onPointerDown(pointer(1, 100, 100));
  engine.event.onPointerDown(pointer(1, 300, 300));
  engine.event.onPointerMove(pointer(1, 299, 300));
  assert.deepEqual(engine.getOrigin(), { x: 1, y: 0 });
});

test("with pan disabled, a two-finger drag does not move the view", () => {
  const engine = engineWith({ move: { enabled: false } });
  engine.event.onPointerDown(pointer(1, 100, 100));
  engine.event.onPointerDown(pointer(2, 200, 100));
  engine.event.onPointerMove(pointer(1, 150, 100));
  engine.event.onPointerMove(pointer(2, 250, 100));
  assert.deepEqual(engine.getTransform(), { origin: { x: 0, y: 0 }, scale: 1 });
});

test("fit respects the scale and origin constraints", () => {
  const engine = engineWith({
    constraints: { scale: { constraints: [2, 4] }, origin: { constraints: { x: [10, 100], y: [10, 100] } } },
  });
  engine.fit();
  assert.deepEqual(engine.getTransform(), { origin: { x: 100, y: 100 }, scale: 2 });
});

test("non-finite values are ignored", () => {
  const engine = engineWith();
  engine.setScale(NaN);
  engine.setOrigin({ x: Infinity, y: 0 });
  engine.zoomTo(NaN);
  engine.event.onWheel(wheel(NaN) as unknown as WheelEvent);
  assert.deepEqual(engine.getTransform(), { origin: { x: 0, y: 0 }, scale: 1 });
});

test("getTransform and getOrigin return copies", () => {
  const engine = engineWith();
  engine.getTransform().scale = 5;
  engine.getTransform().origin.x = 5;
  engine.getOrigin().y = 5;
  assert.deepEqual(engine.getTransform(), { origin: { x: 0, y: 0 }, scale: 1 });
});

test("an origin constrainer that reads the scale sees the scale being applied", () => {
  const seen: number[] = [];
  const engine: CanvasEngine = engineWith({
    constraints: { origin: { constrain: (origin) => (seen.push(engine.getScale()), origin) } },
  });
  engine.zoomTo(2);
  engine.event.onPointerDown(pointer(1, 300, 300));
  engine.event.onPointerDown(pointer(2, 500, 300));
  engine.event.onPointerMove(pointer(2, 700, 300));
  assert.deepEqual(seen, [2, 4]);
});

test("without a viewport rect, zoom, wheel and fit change nothing", () => {
  const engine = engineWith({ getViewportRect: () => null, state: { initial: { origin: { x: 5, y: 5 }, scale: 3 } } });
  engine.zoomIn();
  engine.fit();
  engine.event.onWheel(wheel(-100) as unknown as WheelEvent);
  assert.deepEqual(engine.getTransform(), { origin: { x: 5, y: 5 }, scale: 3 });
});

test("only the primary button starts a drag", () => {
  const engine = engineWith();
  engine.event.onPointerDown(pointer(1, 100, 100, { button: 2 }));
  engine.event.onPointerMove(pointer(1, 150, 100));
  assert.deepEqual(engine.getOrigin(), { x: 0, y: 0 });
});

test("a press captures the pointer on its target and the lift releases it", () => {
  const captured = new Set<number>();
  const currentTarget = Object.assign(new Element(), {
    setPointerCapture: (id: number) => captured.add(id),
    hasPointerCapture: (id: number) => captured.has(id),
    releasePointerCapture: (id: number) => captured.delete(id),
  });
  const engine = engineWith();
  engine.event.onPointerDown(pointer(1, 100, 100, { currentTarget }));
  assert.deepEqual([...captured], [1]);
  engine.event.onPointerUp(pointer(1, 100, 100, { currentTarget }));
  assert.equal(captured.size, 0);
});

test("with pan and zoom disabled, a press and a lift are left to the page", () => {
  const calls: string[] = [];
  const e = pointer(1, 100, 100, {
    currentTarget: Object.assign(new Element(), { setPointerCapture: () => calls.push("capture") }),
    stopPropagation: () => calls.push("stop"),
    preventDefault: () => calls.push("prevent"),
  });
  const engine = engineWith({ move: { enabled: false }, scale: { enabled: false } });
  engine.event.onPointerDown(e);
  engine.event.onPointerUp(e);
  assert.deepEqual(calls, []);
});

test("a lift from a pointer that was never pressed is left to the page", () => {
  let prevented = false;
  engineWith().event.onPointerUp(pointer(7, 0, 0, { preventDefault: () => (prevented = true) }));
  assert.equal(prevented, false);
});

test("reset returns to the initial transform", () => {
  const engine = engineWith({ state: { initial: { origin: { x: 10, y: 20 }, scale: 2 } } });
  engine.zoomTo(4);
  engine.panTo({ x: 99, y: 99 });
  engine.reset();
  assert.deepEqual(engine.getTransform(), { origin: { x: 10, y: 20 }, scale: 2 });
});

test("an undefined scale range keeps the default range", () => {
  const engine = engineWith({ constraints: { scale: { constraints: undefined } } });
  engine.zoomTo(1000);
  assert.equal(engine.getScale(), 8);
});
