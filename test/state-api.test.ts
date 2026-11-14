import { test } from "vitest";
import assert from "node:assert/strict";
import {
  createEngine,
  constrain,
  constrainTo,
  constrainPoint,
  calculateDistance,
  calculateMiddlePoint,
  convertToRelativeCoords,
  calculatePointDistance,
  extractPoint,
  copyTransform,
  copyPoint,
  type CanvasEngineOptions,
  type Transform,
  type Point,
} from "../src/canvas-glide.ts";

(globalThis as { Element?: unknown }).Element ??= class {};

const VP = { x: 0, y: 0, width: 800, height: 600 };
const VP_OFF = { x: 100, y: 50, width: 800, height: 600 };
const CV = { x: 0, y: 0, width: 800, height: 600 };
const CV_WIDE = { x: 0, y: 0, width: 1000, height: 500 };

const E = (options: Partial<CanvasEngineOptions> = {}) =>
  createEngine({ getViewportRect: () => VP, getCanvasRect: () => CV, ...options });
const INIT = (x: number, y: number, s: number) => ({ state: { initial: { origin: { x, y }, scale: s } } });
const OC = (a: number, b: number) => ({ constraints: { origin: { constraints: { x: [a, b] as [number, number], y: [a, b] as [number, number] } } } });

const near = (actual: number, expected: number, tol: number, what = "value") =>
  assert.ok(Math.abs(actual - expected) <= tol, `${what}: expected ${expected} (+-${tol}), got ${actual}`);
const nearPt = (actual: Point, expected: Point, tol: number, what = "point") => {
  near(actual.x, expected.x, tol, `${what}.x`);
  near(actual.y, expected.y, tol, `${what}.y`);
};

type Eng = ReturnType<typeof E>;
const ptr = (id: number, x: number, y: number) =>
  ({ pointerId: id, clientX: x, clientY: y, button: 0, currentTarget: null, stopPropagation() {}, preventDefault() {} }) as unknown as PointerEvent;
const down = (e: Eng, id: number, x: number, y: number) => e.event.onPointerDown(ptr(id, x, y));
const move = (e: Eng, id: number, x: number, y: number) => e.event.onPointerMove(ptr(id, x, y));
const wheel = (e: Eng, d: number, x: number, y: number) =>
  e.event.onWheel({ deltaY: d, deltaMode: 0, ctrlKey: false, clientX: x, clientY: y, stopPropagation() {}, preventDefault() {} } as unknown as WheelEvent);
const shown = (e: Eng, px: number, py: number): Point => ({ x: e.getOrigin().x + px / e.getScale(), y: e.getOrigin().y + py / e.getScale() });

function rec(extra: Partial<CanvasEngineOptions> = {}, initial?: Transform) {
  const originCalls: Point[] = [];
  const scaleCalls: number[] = [];
  const transformCalls: Transform[] = [];
  const engine = E({
    ...extra,
    state: {
      ...(initial ? { initial } : {}),
      onOriginChange: (o) => originCalls.push(structuredClone(o)),
      onScaleChange: (s) => scaleCalls.push(s),
      onTransformChange: (t) => transformCalls.push(structuredClone(t)),
    },
  });
  return { engine, originCalls, scaleCalls, transformCalls };
}

// ---- ST ----
test("A new engine starts at the default transform", () => {
  const e = E();
  assert.deepEqual(e.getOrigin(), { x: 0, y: 0 });
  assert.equal(e.getScale(), 1);
});

test("An engine starts at the initial transform it was given", () => {
  const e = E(INIT(10, 20, 2));
  assert.deepEqual(e.getOrigin(), { x: 10, y: 20 });
  assert.equal(e.getScale(), 2);
});

test("Two engines do not share the default origin", () => {
  const a = E();
  const b = E();
  a.panTo({ x: 123, y: 45 });
  const c = E();
  assert.deepEqual(a.getOrigin(), { x: 123, y: 45 });
  assert.deepEqual(b.getOrigin(), { x: 0, y: 0 });
  assert.deepEqual(c.getOrigin(), { x: 0, y: 0 });
});

test("The caller's initial transform is not mutated (panTo)", () => {
  const I = { origin: { x: 1, y: 2 }, scale: 1 };
  const e = E({ state: { initial: I } });
  e.panTo({ x: 50, y: 60 });
  assert.deepEqual(I.origin, { x: 1, y: 2 });
  assert.equal(I.scale, 1);
  assert.deepEqual(e.getOrigin(), { x: 50, y: 60 });
});

test("The caller's initial transform is not mutated (drag)", () => {
  const I = { origin: { x: 1, y: 2 }, scale: 1 };
  const e = E({ state: { initial: I } });
  down(e, 1, 100, 100);
  move(e, 1, 90, 80);
  assert.deepEqual(I.origin, { x: 1, y: 2 });
  nearPt(e.getOrigin(), { x: 11, y: 22 }, 1e-9, "origin");
});

test("A pan reports the new origin and the new transform once", () => {
  const r = rec();
  r.engine.panTo({ x: 50, y: 60 });
  assert.deepEqual(r.originCalls, [{ x: 50, y: 60 }]);
  assert.deepEqual(r.transformCalls, [{ origin: { x: 50, y: 60 }, scale: 1 }]);
  assert.equal(r.scaleCalls.length, 0);
});

test("A zoom reports the new scale, origin and transform once each", () => {
  const r = rec();
  r.engine.zoomTo(2);
  assert.equal(r.scaleCalls.length, 1, "scaleCalls");
  assert.equal(r.scaleCalls[0], 2);
  assert.equal(r.originCalls.length, 1, "originCalls");
  nearPt(r.originCalls[0], { x: 200, y: 150 }, 1e-9, "originCalls[0]");
  assert.equal(r.transformCalls.length, 1, "transformCalls");
  nearPt(r.transformCalls[0].origin, { x: 200, y: 150 }, 1e-9, "transformCalls[0].origin");
  assert.equal(r.transformCalls[0].scale, 2);
});

test("Setting the scale directly reports the scale and the transform once", () => {
  const r = rec();
  r.engine.setScale(3);
  assert.deepEqual(r.scaleCalls, [3]);
  assert.deepEqual(r.transformCalls, [{ origin: { x: 0, y: 0 }, scale: 3 }]);
  assert.equal(r.originCalls.length, 0);
});

test("setTransform: origin and scale both change", () => {
  const r = rec();
  r.engine.setTransform({ origin: { x: 5, y: 6 }, scale: 2 });
  assert.deepEqual(r.originCalls, [{ x: 5, y: 6 }]);
  assert.deepEqual(r.scaleCalls, [2]);
  assert.deepEqual(r.transformCalls, [{ origin: { x: 5, y: 6 }, scale: 2 }]);
});

test("setTransform: only the origin changes", () => {
  const r = rec();
  r.engine.setTransform({ origin: { x: 5, y: 6 }, scale: 1 });
  assert.deepEqual(r.originCalls, [{ x: 5, y: 6 }]);
  assert.equal(r.scaleCalls.length, 0);
  assert.deepEqual(r.transformCalls, [{ origin: { x: 5, y: 6 }, scale: 1 }]);
});

test("setTransform: only the scale changes", () => {
  const r = rec();
  r.engine.setTransform({ origin: { x: 0, y: 0 }, scale: 2 });
  assert.deepEqual(r.scaleCalls, [2]);
  assert.equal(r.originCalls.length, 0);
  assert.deepEqual(r.transformCalls, [{ origin: { x: 0, y: 0 }, scale: 2 }]);
});

test("An unchanged value triggers no callback (panTo, zoomTo)", () => {
  const r = rec();
  r.engine.panTo({ x: 50, y: 60 });
  assert.equal(r.originCalls.length, 1);
  assert.equal(r.scaleCalls.length, 0);
  assert.equal(r.transformCalls.length, 1);
  r.engine.panTo({ x: 50, y: 60 });
  r.engine.zoomTo(1);
  assert.equal(r.originCalls.length, 1, "originCalls");
  assert.equal(r.scaleCalls.length, 0, "scaleCalls");
  assert.equal(r.transformCalls.length, 1, "transformCalls");
  assert.deepEqual(r.engine.getOrigin(), { x: 50, y: 60 });
  assert.equal(r.engine.getScale(), 1);
});

test("An unchanged value triggers no callback (setters)", () => {
  const r = rec();
  r.engine.panTo({ x: 50, y: 60 });
  assert.equal(r.originCalls.length, 1);
  assert.equal(r.scaleCalls.length, 0);
  assert.equal(r.transformCalls.length, 1);
  r.engine.setOrigin({ x: 50, y: 60 });
  r.engine.setScale(1);
  r.engine.setTransform({ origin: { x: 50, y: 60 }, scale: 1 });
  assert.equal(r.originCalls.length, 1, "originCalls");
  assert.equal(r.scaleCalls.length, 0, "scaleCalls");
  assert.equal(r.transformCalls.length, 1, "transformCalls");
});

test("A change callback reads a consistent transform (origin callback)", () => {
  const seen: { origin: Point; scale: number }[] = [];
  let engine: Eng;
  engine = E({ state: { onOriginChange: () => seen.push({ origin: structuredClone(engine.getOrigin()), scale: engine.getScale() }) } });
  engine.zoomTo(2);
  assert.equal(seen.length, 1);
  nearPt(seen[0].origin, { x: 200, y: 150 }, 1e-9, "origin");
  near(seen[0].scale, 2, 1e-9, "scale");
});

test("A change callback reads a consistent transform (scale callback)", () => {
  const seen: { origin: Point; scale: number }[] = [];
  let engine: Eng;
  engine = E({ state: { onScaleChange: () => seen.push({ origin: structuredClone(engine.getOrigin()), scale: engine.getScale() }) } });
  engine.zoomTo(2);
  assert.equal(seen.length, 1);
  nearPt(seen[0].origin, { x: 200, y: 150 }, 1e-9, "origin");
  near(seen[0].scale, 2, 1e-9, "scale");
});

test("A transform received by a callback is a snapshot (first received)", () => {
  const kept: Transform[] = [];
  const e = E({ state: { onTransformChange: (t) => kept.push(t) } });
  e.panTo({ x: 50, y: 60 });
  e.panTo({ x: 70, y: 80 });
  assert.deepEqual(kept[0], { origin: { x: 50, y: 60 }, scale: 1 });
  assert.deepEqual(kept[1], { origin: { x: 70, y: 80 }, scale: 1 });
  kept[0].origin.x = 999;
  kept[0].scale = 5;
  assert.deepEqual(e.getOrigin(), { x: 70, y: 80 });
  assert.equal(e.getScale(), 1);
});

test("A transform received by a callback is a snapshot (most recent)", () => {
  const kept: Transform[] = [];
  const e = E({ state: { onTransformChange: (t) => kept.push(t) } });
  e.panTo({ x: 50, y: 60 });
  e.panTo({ x: 70, y: 80 });
  kept[1].origin.x = 999;
  kept[1].scale = 5;
  assert.deepEqual(e.getOrigin(), { x: 70, y: 80 });
  assert.equal(e.getScale(), 1);
});

test("An engine can be created and panned before the viewport is measured", () => {
  const e = createEngine({ getViewportRect: () => null, getCanvasRect: () => CV });
  e.panTo({ x: 50, y: 60 });
  assert.deepEqual(e.getOrigin(), { x: 50, y: 60 });
  assert.equal(e.getScale(), 1);
});

test("A drag while the viewport is not measured", () => {
  const e = createEngine({ getViewportRect: () => null, getCanvasRect: () => CV });
  down(e, 1, 100, 100);
  move(e, 1, 90, 80);
  nearPt(e.getOrigin(), { x: 10, y: 20 }, 1e-9, "origin");
  assert.equal(e.getScale(), 1);
});

// ---- CN ----
for (const [req, res, ox, oy] of [
  [-1, 0.25, -1200, -900],
  [0, 0.25, -1200, -900],
  [0.01, 0.25, -1200, -900],
  [0.25, 0.25, -1200, -900],
  [8, 8, 350, 262.5],
  [100, 8, 350, 262.5],
] as const) {
  test(`The default scale limits clamp zoomTo(${req})`, () => {
    const e = E();
    e.zoomTo(req);
    assert.equal(e.getScale(), res);
    nearPt(e.getOrigin(), { x: ox, y: oy }, 1e-9, "origin");
  });
}

test("zoomBy(-5) stops at the lower limit", () => {
  const e = E();
  e.zoomBy(-5);
  assert.equal(e.getScale(), 0.25);
});
test("zoomBy(100) stops at the upper limit", () => {
  const e = E();
  e.zoomBy(100);
  assert.equal(e.getScale(), 8);
});

test("Custom range [0.5, 2]: zoomTo(5)", () => {
  const e = E({ constraints: { scale: { constraints: [0.5, 2] } } });
  e.zoomTo(5);
  assert.equal(e.getScale(), 2);
});
test("Custom range [0.5, 2]: zoomTo(0.1)", () => {
  const e = E({ constraints: { scale: { constraints: [0.5, 2] } } });
  e.zoomTo(0.1);
  assert.equal(e.getScale(), 0.5);
});
test("Custom range [0.1, 20]: zoomTo(15)", () => {
  const e = E({ constraints: { scale: { constraints: [0.1, 20] } } });
  e.zoomTo(15);
  assert.equal(e.getScale(), 15);
});
test("Custom range [0.1, 20]: zoomTo(0.15)", () => {
  const e = E({ constraints: { scale: { constraints: [0.1, 20] } } });
  e.zoomTo(0.15);
  assert.equal(e.getScale(), 0.15);
});

test("Disabled scale constraints: zoomTo(20)", () => {
  const e = E({ constraints: { scale: { enabled: false } } });
  e.zoomTo(20);
  assert.equal(e.getScale(), 20);
});
test("Disabled scale constraints: zoomTo(0.1)", () => {
  const e = E({ constraints: { scale: { enabled: false } } });
  e.zoomTo(0.1);
  assert.equal(e.getScale(), 0.1);
});

test("A custom scale constrain function decides the scale", () => {
  const e = E({ constraints: { scale: { constrain: (v) => Math.round(v) } } });
  e.zoomTo(2.4);
  assert.equal(e.getScale(), 2);
});

test("Without origin constraints a pan goes anywhere", () => {
  const e = E();
  e.panTo({ x: 5000, y: -5000 });
  assert.deepEqual(e.getOrigin(), { x: 5000, y: -5000 });
});

test("Origin constraints apply with enabled omitted", () => {
  const e = E(OC(0, 100));
  e.panTo({ x: 500, y: -500 });
  assert.deepEqual(e.getOrigin(), { x: 100, y: 0 });
});
test("Origin constraints apply with enabled: true", () => {
  const e = E({ constraints: { origin: { enabled: true, constraints: { x: [0, 100], y: [0, 100] } } } });
  e.panTo({ x: 500, y: -500 });
  assert.deepEqual(e.getOrigin(), { x: 100, y: 0 });
});
test("Origin constraints are ignored with enabled: false", () => {
  const e = E({ constraints: { origin: { enabled: false, constraints: { x: [0, 100], y: [0, 100] } } } });
  e.panTo({ x: 500, y: -500 });
  assert.deepEqual(e.getOrigin(), { x: 500, y: -500 });
});

test("A custom origin constrain function decides the origin", () => {
  const e = E({ constraints: { origin: { constrain: (p) => ({ x: Math.max(0, p.x), y: p.y }) } } });
  e.panTo({ x: -50, y: 7 });
  assert.deepEqual(e.getOrigin(), { x: 0, y: 7 });
});

test("A one-finger drag to the right stops at the origin constraints", () => {
  const e = E(OC(-50, 100));
  down(e, 1, 400, 300);
  move(e, 1, 700, 300);
  nearPt(e.getOrigin(), { x: -50, y: 0 }, 1e-9, "origin");
});
test("A one-finger drag to the left stops at the origin constraints", () => {
  const e = E(OC(-50, 100));
  down(e, 1, 400, 300);
  move(e, 1, 100, 300);
  nearPt(e.getOrigin(), { x: 100, y: 0 }, 1e-9, "origin");
});
test("A drag past the limit and back is computed from the start of the drag", () => {
  const e = E(OC(-50, 100));
  down(e, 1, 400, 300);
  move(e, 1, 700, 300);
  nearPt(e.getOrigin(), { x: -50, y: 0 }, 1e-9, "origin after step 2");
  move(e, 1, 440, 300);
  nearPt(e.getOrigin(), { x: -40, y: 0 }, 1e-9, "origin after step 3");
});

test("A two-finger pan stops at the origin constraints", () => {
  const e = E(OC(-50, 100));
  down(e, 1, 300, 300);
  down(e, 2, 500, 300);
  move(e, 1, 600, 300);
  move(e, 2, 800, 300);
  near(e.getScale(), 1, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: -50, y: 0 }, 1e-9, "origin");
});

test("A wheel zoom stops at the origin constraints", () => {
  const e = E(OC(-50, 100));
  wheel(e, 100, 400, 300);
  assert.ok(e.getScale() < 1, `scale ${e.getScale()}`);
  near(e.getOrigin().x, -50, 1e-9, "origin.x");
  assert.ok(e.getOrigin().y >= -50 && e.getOrigin().y < 0, `origin.y ${e.getOrigin().y}`);
});

test("A programmatic zoom stops at the origin constraints", () => {
  const e = E(OC(-50, 100));
  e.zoomTo(0.5);
  near(e.getScale(), 0.5, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: -50, y: -50 }, 1e-9, "origin");
});

// ---- PZ ----
test("Zoom in uses the default step and keeps the viewport centre", () => {
  const e = E();
  e.zoomIn();
  near(e.getScale(), 1.1, 1e-9, "scale");
  nearPt(shown(e, 400, 300), { x: 400, y: 300 }, 1e-9, "shown(400,300)");
});

test("Zoom out reverses zoom in (default step)", () => {
  const e = E();
  e.zoomIn();
  e.zoomOut();
  near(e.getScale(), 1, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: 0, y: 0 }, 1e-9, "origin");
});
test("Zoom out reverses zoom in (step 0.5)", () => {
  const e = E();
  e.zoomIn(0.5);
  e.zoomOut(0.5);
  near(e.getScale(), 1, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: 0, y: 0 }, 1e-9, "origin");
});
test("Zoom out reverses zoom in (step 1)", () => {
  const e = E();
  e.zoomIn(1);
  e.zoomOut(1);
  near(e.getScale(), 1, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: 0, y: 0 }, 1e-9, "origin");
});
test("Zoom out reverses zoom in (start scale 2, step 0.5)", () => {
  const e = E(INIT(0, 0, 2));
  e.zoomIn(0.5);
  e.zoomOut(0.5);
  near(e.getScale(), 2, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: 0, y: 0 }, 1e-9, "origin");
});

test("Zoom in accepts an explicit step", () => {
  const e = E();
  e.zoomIn(0.5);
  near(e.getScale(), 1.5, 1e-9, "scale");
});

test("The configured zoom step is used by zoom in", () => {
  const e = E({ scale: { zoomStep: 0.25 } });
  e.zoomIn();
  near(e.getScale(), 1.25, 1e-9, "scale");
});
test("A configured zoom step of 0 means no zoom", () => {
  const e = E({ scale: { zoomStep: 0 } });
  e.zoomIn();
  near(e.getScale(), 1, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: 0, y: 0 }, 1e-9, "origin");
});

test("zoomTo(2), pivot omitted", () => {
  const e = E();
  e.zoomTo(2);
  near(e.getScale(), 2, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: 200, y: 150 }, 1e-9, "origin");
});
test("zoomTo(2) at the top left corner", () => {
  const e = E();
  e.zoomTo(2, { x: 0, y: 0 });
  near(e.getScale(), 2, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: 0, y: 0 }, 1e-9, "origin");
});
test("zoomTo(2) at the bottom right corner", () => {
  const e = E();
  e.zoomTo(2, { x: 800, y: 600 });
  near(e.getScale(), 2, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: 400, y: 300 }, 1e-9, "origin");
});

test("Zoom to a scale is absolute when the engine is already zoomed", () => {
  const e = E(INIT(10, 20, 2));
  e.zoomTo(4);
  near(e.getScale(), 4, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: 110, y: 95 }, 1e-9, "origin");
});

test("Zoom at a point keeps that point in place", () => {
  const e = E();
  e.zoomAt(2, { x: 200, y: 150 });
  near(e.getScale(), 2, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: 100, y: 75 }, 1e-9, "origin");
});

test("Zoom by a delta adds to the scale", () => {
  const e = E();
  e.zoomBy(0.5);
  near(e.getScale(), 1.5, 1e-9, "scale at check");
  e.zoomBy(-0.5);
  near(e.getScale(), 1, 1e-9, "scale at end");
});

test("isZoomEnabled/isPanEnabled with defaults", () => {
  const e = E();
  assert.strictEqual(e.isZoomEnabled(), true);
  assert.strictEqual(e.isPanEnabled(), true);
});
test("isZoomEnabled/isPanEnabled with zoom disabled", () => {
  const e = E({ scale: { enabled: false } });
  assert.strictEqual(e.isZoomEnabled(), false);
  assert.strictEqual(e.isPanEnabled(), true);
});
test("isZoomEnabled/isPanEnabled with pan disabled", () => {
  const e = E({ move: { enabled: false } });
  assert.strictEqual(e.isZoomEnabled(), true);
  assert.strictEqual(e.isPanEnabled(), false);
});

test("Pan to a point sets the origin", () => {
  const e = E();
  e.panTo({ x: 50, y: 60 });
  assert.deepEqual(e.getOrigin(), { x: 50, y: 60 });
  assert.equal(e.getScale(), 1);
});

test("A programmatic pan gesture moves the origin like a drag", () => {
  const e = E();
  e.panStart({ x: 100, y: 100 });
  e.pan({ x: 90, y: 80 });
  nearPt(e.getOrigin(), { x: 10, y: 20 }, 1e-9, "origin at check");
  e.panEnd();
  e.pan({ x: 0, y: 0 });
  nearPt(e.getOrigin(), { x: 10, y: 20 }, 1e-9, "origin at end");
});

test("A programmatic pinch gesture scales like two fingers", () => {
  const e = E();
  e.pinchStart([{ x: 300, y: 300 }, { x: 500, y: 300 }]);
  e.pinch([{ x: 200, y: 300 }, { x: 600, y: 300 }]);
  near(e.getScale(), 2, 1e-9, "scale at check");
  nearPt(e.getOrigin(), { x: 200, y: 150 }, 1e-9, "origin at check");
  e.pinchEnd();
  e.pinch([{ x: 300, y: 300 }, { x: 500, y: 300 }]);
  near(e.getScale(), 2, 1e-9, "scale at end");
  nearPt(e.getOrigin(), { x: 200, y: 150 }, 1e-9, "origin at end");
});

test("The scale service sets an absolute scale around the viewport centre", () => {
  const e = E();
  e.scaleService.buttonScale(2);
  near(e.getScale(), 2, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: 200, y: 150 }, 1e-9, "origin");
});

test("The service objects act on the same engine as the flat API", () => {
  const e = E();
  e.moveService.moveTo({ x: 50, y: 60 });
  e.scaleService.zoomIn();
  near(e.getScale(), 1.1, 1e-9, "engine.getScale");
  near(e.stateService.getScale(), 1.1, 1e-9, "stateService.getScale");
  nearPt(shown(e, 400, 300), { x: 450, y: 360 }, 1e-9, "shown(400,300)");
});

// ---- FC ----
test("Fit returns to scale 1 with the canvas centred", () => {
  const e = createEngine({ getViewportRect: () => VP, getCanvasRect: () => CV_WIDE, ...INIT(7, 7, 3) });
  e.fit();
  near(e.getScale(), 1, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: 100, y: -50 }, 1e-9, "origin");
});
test("Fit with the viewport at client (100, 50)", () => {
  const e = createEngine({ getViewportRect: () => VP_OFF, getCanvasRect: () => CV_WIDE, ...INIT(7, 7, 3) });
  e.fit();
  near(e.getScale(), 1, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: 100, y: -50 }, 1e-9, "origin");
});
test("Center keeps the scale and centres the canvas", () => {
  const e = createEngine({ getViewportRect: () => VP, getCanvasRect: () => CV_WIDE, ...INIT(7, 7, 2) });
  e.center();
  near(e.getScale(), 2, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: 300, y: 100 }, 1e-9, "origin");
});
test("Reset returns a default engine to its starting view", () => {
  const e = E();
  e.panTo({ x: 50, y: 60 });
  e.zoomTo(2);
  near(e.getScale(), 2, 1e-9, "scale before reset");
  e.reset();
  near(e.getScale(), 1, 1e-9, "scale");
  nearPt(e.getOrigin(), { x: 0, y: 0 }, 1e-9, "origin");
});

// ---- HL ----
for (const [v, exp] of [
  [-1, 0],
  [0, 0],
  [5, 5],
  [10, 10],
  [11, 10],
] as const) {
  test(`constrain and constrainTo of ${v} in [0, 10]`, () => {
    assert.equal(constrain(v, [0, 10]), exp);
    assert.equal(constrainTo(v, 0, 10), exp);
  });
}

test("constrainPoint clamps each axis on its own", () => {
  const r = constrainPoint({ x: 500, y: -500 }, { x: [0, 100], y: [0, 100] });
  assert.equal(r.x, 100);
  assert.equal(r.y, 0);
});

test("calculateDistance", () => near(calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5, 1e-9));
test("calculateMiddlePoint", () => nearPt(calculateMiddlePoint({ x: 0, y: 0 }, { x: 10, y: 20 }), { x: 5, y: 10 }, 1e-9));
test("convertToRelativeCoords", () =>
  nearPt(convertToRelativeCoords({ x: 300, y: 200 }, { x: 100, y: 50, width: 800, height: 600 }), { x: 200, y: 150 }, 1e-9));
test("calculatePointDistance", () => {
  const r = calculatePointDistance({ x: 1, y: 2 }, { x: 4, y: 6 });
  assert.ok(Array.isArray(r));
  near(r[0], 3, 1e-9);
  near(r[1], 4, 1e-9);
});
test("extractPoint", () => {
  const r = extractPoint({ clientX: 12, clientY: 34 } as unknown as PointerEvent);
  assert.equal(r.x, 12);
  assert.equal(r.y, 34);
});

test("copyTransform is independent of the original", () => {
  const T = { origin: { x: 1, y: 2 }, scale: 3 };
  const C = copyTransform(T);
  assert.deepEqual(C, { origin: { x: 1, y: 2 }, scale: 3 });
  assert.notStrictEqual(C, T);
  assert.notStrictEqual(C.origin, T.origin);
  C.origin.x = 9;
  C.origin.y = 9;
  C.scale = 4;
  assert.deepEqual(T, { origin: { x: 1, y: 2 }, scale: 3 });
});
test("copyPoint is independent of the original", () => {
  const P = { x: 1, y: 2 };
  const Q = copyPoint(P);
  assert.deepEqual(Q, { x: 1, y: 2 });
  assert.notStrictEqual(Q, P);
  Q.x = 9;
  Q.y = 9;
  assert.deepEqual(P, { x: 1, y: 2 });
});
test("wheelVelocity 0 means no wheel zoom", () => {
  const e = E({ scale: { wheelVelocity: 0 } });
  e.event.onWheel({ deltaY: -100, deltaMode: 0, ctrlKey: false, clientX: 400, clientY: 300, stopPropagation() {}, preventDefault() {} } as unknown as WheelEvent);
  assert.equal(e.getScale(), 1);
});
test("origin callback during setTransform sees the new scale", () => {
  const seen: number[] = [];
  const e = E({ state: { onOriginChange: () => seen.push(e.getScale()) } });
  e.setTransform({ origin: { x: 5, y: 6 }, scale: 2 });
  assert.deepEqual(seen, [2]);
});
test("constrained pan reports the constrained origin to the callback", () => {
  const seen: unknown[] = [];
  const e = E({ constraints: { origin: { constraints: { x: [0, 100], y: [0, 100] } } }, state: { onOriginChange: (o) => seen.push({ ...o }) } });
  e.panTo({ x: 500, y: -500 });
  assert.deepEqual(seen, [{ x: 100, y: 0 }]);
});
