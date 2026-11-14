import { test } from "vitest";
import assert from "node:assert/strict";
import { createEngine, type CanvasEngineOptions } from "../src/canvas-glide.ts";

(globalThis as { Element?: unknown }).Element ??= class {};

type Rect = { x: number; y: number; width: number; height: number };
const VP: Rect = { x: 0, y: 0, width: 800, height: 600 };
const VP_OFF: Rect = { x: 100, y: 50, width: 800, height: 600 };
const CV: Rect = { x: 0, y: 0, width: 800, height: 600 };

const E = (options: Partial<CanvasEngineOptions> = {}) =>
  createEngine({ getViewportRect: () => VP, getCanvasRect: () => CV, ...options });

const INIT = (x: number, y: number, s: number) => ({ state: { initial: { origin: { x, y }, scale: s } } });
const OC = (a: number, b: number) => ({ constraints: { origin: { constraints: { x: [a, b], y: [a, b] } } } }) as Partial<CanvasEngineOptions>;
const ZOOM_OFF: Partial<CanvasEngineOptions> = { scale: { enabled: false } };
const PAN_OFF: Partial<CanvasEngineOptions> = { move: { enabled: false } };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function recorder() {
  const originCalls: unknown[] = [];
  const scaleCalls: unknown[] = [];
  const transformCalls: unknown[] = [];
  const movingCalls: boolean[] = [];
  return {
    originCalls,
    scaleCalls,
    transformCalls,
    movingCalls,
    stateCallbacks: {
      onOriginChange: (o: unknown) => originCalls.push(clone(o)),
      onScaleChange: (s: unknown) => scaleCalls.push(clone(s)),
      onTransformChange: (t: unknown) => transformCalls.push(clone(t)),
    },
    onIsMovingChange: (b: boolean) => movingCalls.push(b),
  };
}

type Flags = { prevented: boolean; stopped: boolean };

function pointerEvent(id: number, x: number, y: number) {
  const e = {
    pointerId: id,
    clientX: x,
    clientY: y,
    button: 0,
    currentTarget: null,
    prevented: false,
    stopped: false,
    stopPropagation() { e.stopped = true; },
    preventDefault() { e.prevented = true; },
  };
  return e;
}

function wheelEvent(d: number, x: number, y: number, extra: { deltaMode?: number; ctrlKey?: boolean } = {}) {
  const e = {
    deltaY: d,
    deltaMode: extra.deltaMode ?? 0,
    ctrlKey: extra.ctrlKey ?? false,
    clientX: x,
    clientY: y,
    prevented: false,
    stopped: false,
    stopPropagation() { e.stopped = true; },
    preventDefault() { e.prevented = true; },
  };
  return e;
}

function driver(engine: ReturnType<typeof E>) {
  const last = new Map<number, { x: number; y: number }>();
  const seen = (id: number, x: number, y: number) => last.set(id, { x, y });
  return {
    down(id: number, x: number, y: number) { seen(id, x, y); const e = pointerEvent(id, x, y); engine.event.onPointerDown(e as unknown as PointerEvent); return e as Flags; },
    move(id: number, x: number, y: number) { seen(id, x, y); const e = pointerEvent(id, x, y); engine.event.onPointerMove(e as unknown as PointerEvent); return e as Flags; },
    up(id: number, x?: number, y?: number) { const p = last.get(id) ?? { x: 0, y: 0 }; const e = pointerEvent(id, x ?? p.x, y ?? p.y); engine.event.onPointerUp(e as unknown as PointerEvent); return e as Flags; },
    cancel(id: number, x?: number, y?: number) { const p = last.get(id) ?? { x: 0, y: 0 }; const e = pointerEvent(id, x ?? p.x, y ?? p.y); engine.event.onPointerCancel(e as unknown as PointerEvent); return e as Flags; },
    wheel(d: number, x: number, y: number, extra: { deltaMode?: number; ctrlKey?: boolean } = {}) { const e = wheelEvent(d, x, y, extra); engine.event.onWheel(e as unknown as WheelEvent); return e as Flags; },
  };
}

const near = (actual: number, expected: number, tol: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${what}: expected ${expected} (tol ${tol}), got ${actual}`);
const nearPoint = (p: { x: number; y: number }, x: number, y: number, tol: number, what: string) => {
  near(p.x, x, tol, `${what}.x`);
  near(p.y, y, tol, `${what}.y`);
};
const shown = (engine: ReturnType<typeof E>, px: number, py: number) => {
  const o = engine.getOrigin();
  const s = engine.getScale();
  return { x: o.x + px / s, y: o.y + py / s };
};

// ---- PN ----

test("A drag moves the origin by the pointer distance divided by the scale (scale 1)", () => {
  const e = E(INIT(0, 0, 1)); const d = driver(e);
  d.down(1, 200, 150); d.move(1, 190, 130);
  nearPoint(e.getOrigin(), 10, 20, 1e-9, "origin");
});

test("A drag moves the origin by the pointer distance divided by the scale (scale 2)", () => {
  const e = E(INIT(0, 0, 2)); const d = driver(e);
  d.down(1, 200, 150); d.move(1, 190, 130);
  nearPoint(e.getOrigin(), 5, 10, 1e-9, "origin");
  near(e.getScale(), 2, 1e-9, "scale");
});

test("A drag moves the origin by the pointer distance divided by the scale (offset viewport)", () => {
  const e = E({ ...INIT(0, 0, 1), getViewportRect: () => VP_OFF }); const d = driver(e);
  d.down(1, 200, 150); d.move(1, 190, 130);
  nearPoint(e.getOrigin(), 10, 20, 1e-9, "origin");
});

test("A drag reports that moving started and ended", () => {
  const r = recorder();
  const e = E({ move: { onIsMovingChange: r.onIsMovingChange } }); const d = driver(e);
  d.down(1, 100, 100); d.move(1, 90, 80); d.up(1, 90, 80);
  assert.deepEqual(r.movingCalls, [true, false]);
});

test("A drag does nothing when pan is disabled", () => {
  const r = recorder();
  const e = E({ move: { enabled: false, onIsMovingChange: r.onIsMovingChange } }); const d = driver(e);
  d.down(1, 100, 100); d.move(1, 90, 80); d.up(1, 90, 80);
  nearPoint(e.getOrigin(), 0, 0, 0, "origin");
  assert.deepEqual(r.movingCalls, []);
});

test("A pointer that moves without being pressed does not pan", () => {
  const r = recorder();
  const e = E({ state: r.stateCallbacks }); const d = driver(e);
  d.move(1, 500, 400);
  nearPoint(e.getOrigin(), 0, 0, 0, "origin");
  near(e.getScale(), 1, 0, "scale");
  assert.deepEqual(r.originCalls, []);
  assert.deepEqual(r.scaleCalls, []);
  assert.deepEqual(r.transformCalls, []);
});

test("A hover move is left to the page", () => {
  const e = E(); const d = driver(e);
  const ev = d.move(1, 500, 400);
  assert.equal(ev.prevented, false);
  assert.equal(ev.stopped, false);
});

test("Moves from a pointer that was never pressed are ignored", () => {
  const e = E(); const d = driver(e);
  d.down(1, 100, 100); d.move(9, 500, 400);
  nearPoint(e.getOrigin(), 0, 0, 0, "origin");
  near(e.getScale(), 1, 0, "scale");
});

test("A lift from a pointer that was never pressed does not disturb a drag", () => {
  const e = E(); const d = driver(e);
  d.down(1, 100, 100); d.move(1, 90, 100); d.up(9, 500, 400);
  nearPoint(e.getOrigin(), 10, 0, 1e-9, "origin at check");
  d.move(1, 80, 100);
  nearPoint(e.getOrigin(), 20, 0, 1e-9, "origin at end");
});

test("A move after the pointer was lifted does not pan", () => {
  const e = E(); const d = driver(e);
  d.down(1, 100, 100); d.move(1, 90, 100); d.up(1, 90, 100); d.move(1, 50, 100);
  nearPoint(e.getOrigin(), 10, 0, 1e-9, "origin");
});

test("With zoom disabled, only the first finger pans", () => {
  const e = E(ZOOM_OFF); const d = driver(e);
  d.down(1, 100, 100); d.down(2, 400, 100); d.move(2, 401, 100);
  nearPoint(e.getOrigin(), 0, 0, 1e-9, "origin at check");
  d.move(1, 99, 100);
  nearPoint(e.getOrigin(), 1, 0, 1e-9, "origin at end");
  near(e.getScale(), 1, 1e-9, "scale");
});

test("With zoom disabled, the remaining finger takes over the pan without a jump", () => {
  const e = E(ZOOM_OFF); const d = driver(e);
  d.down(1, 100, 100); d.down(2, 400, 100); d.up(1, 100, 100);
  nearPoint(e.getOrigin(), 0, 0, 1e-9, "origin at check");
  d.move(2, 390, 100);
  nearPoint(e.getOrigin(), 10, 0, 1e-9, "origin at end");
});

test("With zoom disabled, lifting the second finger leaves the first finger panning", () => {
  const e = E(ZOOM_OFF); const d = driver(e);
  d.down(1, 100, 100); d.down(2, 400, 100); d.up(2, 400, 100);
  nearPoint(e.getOrigin(), 0, 0, 1e-9, "origin at check");
  d.move(1, 90, 100);
  nearPoint(e.getOrigin(), 10, 0, 1e-9, "origin at end");
});

test("A wheel zoom during a drag is kept on the next move", () => {
  const e = E(); const d = driver(e);
  d.down(1, 400, 300); d.wheel(-100, 400, 300); d.move(1, 401, 300);
  assert.ok(e.getScale() > 1, `scale ${e.getScale()}`);
  nearPoint(shown(e, 401, 300), 400, 300, 1e-9, "shown(401, 300)");
});

test("Two engines track their pointers separately", () => {
  const A = E(); const B = E(); const a = driver(A); const b = driver(B);
  a.down(1, 100, 100); b.move(1, 50, 50);
  nearPoint(A.getOrigin(), 0, 0, 1e-9, "A at check");
  nearPoint(B.getOrigin(), 0, 0, 1e-9, "B at check");
  a.move(1, 90, 100);
  nearPoint(A.getOrigin(), 10, 0, 1e-9, "A at end");
  nearPoint(B.getOrigin(), 0, 0, 1e-9, "B at end");
});

// ---- WH ----

test("The wheel zooms by the default velocity (in)", () => {
  const e = E(); driver(e).wheel(-100, 400, 300);
  near(e.getScale(), 1.161834, 1e-5, "scale");
});

test("The wheel zooms by the default velocity (out)", () => {
  const e = E(); driver(e).wheel(100, 400, 300);
  near(e.getScale(), 0.860708, 1e-5, "scale");
});

test("A wheel turn is converted to pixels and capped (3 lines)", () => {
  const e = E(); driver(e).wheel(-3, 400, 300, { deltaMode: 1 });
  near(e.getScale(), 1.154884, 1e-5, "scale");
});

test("A wheel turn is converted to pixels and capped (1 page)", () => {
  const e = E(); driver(e).wheel(-1, 400, 300, { deltaMode: 2 });
  near(e.getScale(), 1.197217, 1e-5, "scale");
});

test("A wheel turn is converted to pixels and capped (1000 in)", () => {
  const e = E(); driver(e).wheel(-1000, 400, 300);
  near(e.getScale(), 1.197217, 1e-5, "scale");
});

test("A wheel turn is converted to pixels and capped (1000 out)", () => {
  const e = E(); driver(e).wheel(1000, 400, 300);
  near(e.getScale(), 0.835270, 1e-5, "scale");
});

test("A wheel turn is converted to pixels and capped (control key)", () => {
  const e = E(); driver(e).wheel(-5, 400, 300, { ctrlKey: true });
  near(e.getScale(), 1.077884, 1e-5, "scale");
});

test("A wheel turn is converted to pixels and capped (on the cap)", () => {
  const e = E(); driver(e).wheel(-120, 400, 300);
  near(e.getScale(), 1.197217, 1e-5, "scale");
});

test("A wheel turn is converted to pixels and capped (one below the cap)", () => {
  const e = E(); driver(e).wheel(-119, 400, 300);
  near(e.getScale(), 1.195423, 1e-5, "scale");
});

test("A wheel turn is converted to pixels and capped (control key above the cap)", () => {
  const e = E(); driver(e).wheel(-20, 400, 300, { ctrlKey: true });
  near(e.getScale(), 1.197217, 1e-5, "scale");
});

test("A wheel zoom keeps the point under the cursor", () => {
  const e = E(); driver(e).wheel(-100, 200, 150);
  assert.ok(e.getScale() > 1);
  nearPoint(shown(e, 200, 150), 200, 150, 1e-9, "shown(200, 150)");
});

test("A wheel zoom keeps the point under the cursor when the viewport is offset", () => {
  const e = E({ getViewportRect: () => VP_OFF }); driver(e).wheel(-100, 300, 200);
  assert.ok(e.getScale() > 1);
  nearPoint(shown(e, 200, 150), 200, 150, 1e-9, "shown(200, 150)");
});

test("A wheel turn in and the same turn out return to the starting view", () => {
  const e = E(); const d = driver(e);
  d.wheel(-100, 200, 150);
  assert.ok(e.getScale() > 1);
  d.wheel(100, 200, 150);
  near(e.getScale(), 1, 1e-9, "scale");
  nearPoint(e.getOrigin(), 0, 0, 1e-9, "origin");
});

test("A wheel event without a vertical turn changes nothing", () => {
  const r = recorder();
  const e = E({ state: r.stateCallbacks }); driver(e).wheel(0, 200, 150);
  near(e.getScale(), 1, 0, "scale");
  nearPoint(e.getOrigin(), 0, 0, 0, "origin");
  assert.deepEqual(r.originCalls, []);
  assert.deepEqual(r.scaleCalls, []);
  assert.deepEqual(r.transformCalls, []);
});

test("The wheel does not scroll the page while zoom is enabled", () => {
  const e = E(); const ev = driver(e).wheel(-100, 400, 300);
  assert.equal(ev.prevented, true);
  assert.ok(e.getScale() > 1);
});

test("The wheel neither zooms nor blocks page scrolling when zoom is disabled", () => {
  const e = E(ZOOM_OFF); const ev = driver(e).wheel(-100, 400, 300);
  near(e.getScale(), 1, 0, "scale");
  nearPoint(e.getOrigin(), 0, 0, 0, "origin");
  assert.equal(ev.prevented, false);
});

test("The configured wheel velocity is used", () => {
  const e = E({ scale: { wheelVelocity: 0.003 } }); driver(e).wheel(-100, 400, 300);
  near(e.getScale(), 1.349859, 1e-5, "scale");
});

test("The configured wheel velocity is used (velocity 0)", () => {
  const e = E({ scale: { wheelVelocity: 0 } }); driver(e).wheel(-100, 400, 300);
  near(e.getScale(), 1, 1e-9, "scale");
  nearPoint(e.getOrigin(), 0, 0, 1e-9, "origin");
});

function limitEngine(scale: number) {
  const r = recorder();
  const e = E({ state: { initial: { origin: { x: 10, y: 20 }, scale }, ...r.stateCallbacks } });
  return { e, r };
}

test("The wheel changes nothing at the scale limit (upper)", () => {
  const { e, r } = limitEngine(8); driver(e).wheel(-100, 200, 150);
  near(e.getScale(), 8, 0, "scale");
  nearPoint(e.getOrigin(), 10, 20, 0, "origin");
  assert.deepEqual(r.originCalls, []);
  assert.deepEqual(r.scaleCalls, []);
  assert.deepEqual(r.transformCalls, []);
});

test("The wheel changes nothing at the scale limit (lower)", () => {
  const { e, r } = limitEngine(0.25); driver(e).wheel(100, 200, 150);
  near(e.getScale(), 0.25, 0, "scale");
  nearPoint(e.getOrigin(), 10, 20, 0, "origin");
  assert.deepEqual(r.originCalls, []);
  assert.deepEqual(r.scaleCalls, []);
  assert.deepEqual(r.transformCalls, []);
});

// ---- PI ----

const pinchIn = (d: ReturnType<typeof driver>) => {
  d.down(1, 300, 300); d.down(2, 500, 300); d.move(1, 200, 300); d.move(2, 600, 300);
};

test("A pinch scales by the finger distance and keeps the midpoint", () => {
  const e = E(); pinchIn(driver(e));
  near(e.getScale(), 2, 1e-9, "scale");
  nearPoint(e.getOrigin(), 200, 150, 1e-9, "origin");
});

test("A pinch keeps the midpoint when the viewport is offset", () => {
  const e = E({ getViewportRect: () => VP_OFF }); const d = driver(e);
  d.down(1, 400, 350); d.down(2, 600, 350); d.move(1, 300, 350); d.move(2, 700, 350);
  near(e.getScale(), 2, 1e-9, "scale");
  nearPoint(e.getOrigin(), 200, 150, 1e-9, "origin");
});

test("A pinch scales by the finger distance and respects origin constraints", () => {
  const e = E(OC(0, 100)); const d = driver(e);
  d.down(1, 100, 100); d.down(2, 200, 100); d.move(2, 300, 100);
  near(e.getScale(), 2, 1e-9, "scale");
  nearPoint(e.getOrigin(), 50, 50, 1e-9, "origin");
});

test("Two fingers moving together pan without zooming", () => {
  const e = E(); const d = driver(e);
  d.down(1, 600, 450); d.down(2, 800, 450); d.move(1, 450, 350); d.move(2, 650, 350);
  near(e.getScale(), 1, 1e-9, "scale");
  nearPoint(e.getOrigin(), 150, 100, 1e-9, "origin");
});

test("A pinch stops at the scale limits (upper)", () => {
  const e = E(); const d = driver(e);
  d.down(1, 380, 300); d.down(2, 420, 300); d.move(1, 0, 300); d.move(2, 800, 300);
  near(e.getScale(), 8, 1e-9, "scale");
  nearPoint(e.getOrigin(), 350, 262.5, 1e-9, "origin");
});

test("A pinch stops at the scale limits (lower)", () => {
  const e = E(); const d = driver(e);
  d.down(1, 0, 300); d.down(2, 800, 300); d.move(1, 380, 300); d.move(2, 420, 300);
  near(e.getScale(), 0.25, 1e-9, "scale");
  nearPoint(e.getOrigin(), -1200, -900, 1e-9, "origin");
});

test("Two fingers pressed at the same point leave the transform finite", () => {
  const e = E(); const d = driver(e);
  d.down(1, 300, 300); d.down(2, 300, 300); d.move(2, 400, 300);
  const s = e.getScale(); const o = e.getOrigin();
  assert.equal(Number.isFinite(s), true);
  assert.ok(s >= 0.25 && s <= 8, `scale ${s}`);
  assert.equal(Number.isFinite(o.x), true);
  assert.equal(Number.isFinite(o.y), true);
});

test("After a pinch the remaining finger pans without a jump", () => {
  const e = E(); const d = driver(e);
  pinchIn(d); d.up(2, 600, 300);
  near(e.getScale(), 2, 1e-9, "scale at check");
  nearPoint(e.getOrigin(), 200, 150, 1e-9, "origin at check");
  d.move(1, 180, 300);
  near(e.getScale(), 2, 1e-9, "scale at end");
  nearPoint(e.getOrigin(), 210, 150, 1e-9, "origin at end");
});

test("A third finger neither jumps the view nor breaks the pinch", () => {
  const e = E(); const d = driver(e);
  d.down(1, 100, 100); d.down(2, 200, 100); d.down(3, 500, 100); d.move(1, 101, 100);
  assert.ok(Math.abs(e.getOrigin().x) < 10, `origin.x ${e.getOrigin().x}`);
  d.move(2, 300, 100);
  assert.ok(e.getScale() > 1.9 && e.getScale() < 2.1, `scale ${e.getScale()}`);
});

function threeDown() {
  const e = E(); const d = driver(e);
  d.down(1, 100, 100); d.down(2, 200, 100); d.down(3, 500, 100);
  return { e, d };
}
function pi09(lift: number, liftX: number, moveId: number, moveX: number) {
  const { e, d } = threeDown();
  d.up(lift, liftX, 100);
  near(e.getScale(), 1, 0, "scale at check");
  nearPoint(e.getOrigin(), 0, 0, 0, "origin at check");
  d.move(moveId, moveX, 100);
  assert.ok(Math.abs(e.getOrigin().x) < 10, `origin.x ${e.getOrigin().x}`);
  assert.ok(e.getScale() > 0.9 && e.getScale() < 1.1, `scale ${e.getScale()}`);
}
test("Lifting one of three fingers does not move the view (lift 1, move 2)", () => pi09(1, 100, 2, 201));
test("Lifting one of three fingers does not move the view (lift 2, move 1)", () => pi09(2, 200, 1, 101));
test("Lifting one of three fingers does not move the view (lift 3, move 1)", () => pi09(3, 500, 1, 101));

test("A cancelled pointer is forgotten", () => {
  const e = E(); const d = driver(e);
  d.down(1, 100, 100); d.cancel(1, 100, 100); d.down(2, 200, 200); d.move(2, 300, 200);
  near(e.getScale(), 1, 1e-9, "scale");
  nearPoint(e.getOrigin(), -100, 0, 1e-9, "origin");
});

test("A pointer cancelled during a pinch leaves a one-finger pan", () => {
  const e = E(); const d = driver(e);
  d.down(1, 100, 100); d.down(2, 200, 100); d.cancel(2, 200, 100); d.move(1, 80, 100);
  near(e.getScale(), 1, 1e-9, "scale");
  nearPoint(e.getOrigin(), 20, 0, 1e-9, "origin");
});

test("A cancelled drag reports that moving ended", () => {
  const r = recorder();
  const e = E({ move: { onIsMovingChange: r.onIsMovingChange } }); const d = driver(e);
  d.down(1, 100, 100); d.cancel(1, 100, 100);
  assert.deepEqual(r.movingCalls, [true, false]);
});

test("The moving report alternates through a drag that becomes a pinch and ends false", () => {
  const r = recorder();
  const e = E({ move: { onIsMovingChange: r.onIsMovingChange } }); const d = driver(e);
  d.down(1, 300, 300); d.down(2, 500, 300); d.move(2, 600, 300); d.up(2, 600, 300); d.up(1, 300, 300);
  const m = r.movingCalls;
  assert.ok(m.length > 0, "not empty");
  assert.equal(m[0], true);
  for (let i = 1; i < m.length; i++) assert.notEqual(m[i], m[i - 1], `neighbours equal at ${i}: ${JSON.stringify(m)}`);
  assert.equal(m[m.length - 1], false);
});

test("A pointer pressed twice without a lift is not treated as a pinch", () => {
  const e = E(); const d = driver(e);
  d.down(1, 100, 100); d.down(1, 150, 100); d.move(1, 140, 100);
  near(e.getScale(), 1, 0, "scale");
  assert.equal(Number.isFinite(e.getOrigin().x), true);
  assert.equal(Number.isFinite(e.getOrigin().y), true);
});

test("A pinch does nothing to the scale when zoom is disabled", () => {
  const e = E(ZOOM_OFF); const d = driver(e);
  d.down(1, 300, 300); d.down(2, 500, 300); d.move(2, 700, 300);
  near(e.getScale(), 1, 0, "scale");
  nearPoint(e.getOrigin(), 0, 0, 0, "origin");
});

test("With pan disabled, a pinch zooms and the remaining finger does not pan", () => {
  const e = E(PAN_OFF); const d = driver(e);
  pinchIn(d);
  near(e.getScale(), 2, 1e-9, "scale at check");
  nearPoint(e.getOrigin(), 200, 150, 1e-9, "origin at check");
  d.up(2, 600, 300); d.move(1, 100, 300);
  near(e.getScale(), 2, 1e-9, "scale at end");
  nearPoint(e.getOrigin(), 200, 150, 1e-9, "origin at end");
});

test("A wheel zoom during a drag at scale 2 keeps the grabbed point", () => {
  const e = E(INIT(0, 0, 2)); const d = driver(e);
  d.down(1, 400, 300);
  const grabbed = shown(e, 400, 300);
  d.wheel(-100, 400, 300);
  d.move(1, 400, 300);
  nearPoint(shown(e, 400, 300), grabbed.x, grabbed.y, 1e-9, "grabbed point");
});

test("A wheel zoom during a pinch is kept on the next pinch move", () => {
  const e = E(); const d = driver(e);
  d.down(1, 300, 300); d.down(2, 500, 300); d.wheel(-100, 400, 300);
  const s = e.getScale();
  d.move(2, 500, 300);
  near(e.getScale(), s, 1e-9, "scale");
});
