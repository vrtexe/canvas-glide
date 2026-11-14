# canvas-glide

Pan, zoom and pinch-to-zoom for any HTML element, image or `<canvas>`, in plain JavaScript or TypeScript, with no framework and no dependencies.

[![npm version](https://img.shields.io/npm/v/canvas-glide.svg?style=flat-square)](https://www.npmjs.com/package/canvas-glide)
[![types](https://img.shields.io/npm/types/canvas-glide.svg?style=flat-square)](https://github.com/vrtexe/canvas-glide/blob/main/src/lib/engine.ts)
[![license](https://img.shields.io/npm/l/canvas-glide.svg?style=flat-square)](LICENSE.md)
[![issues](https://img.shields.io/github/issues/vrtexe/canvas-glide.svg?style=flat-square)](https://github.com/vrtexe/canvas-glide/issues)

canvas-glide is a headless pan and zoom engine. It turns mouse, touch, pen and wheel input into a transform, an `origin` and a `scale`, and passes that transform to your callback. You apply it with one CSS `transform` or one canvas `setTransform` call. The engine renders nothing, and the only DOM call it makes is pointer capture on the element that receives the events.

[Live demo](https://vrtexe.github.io/canvas-glide-react-demo/) (React, with canvas, image and HTML content)

## Features

- **Mouse, touch, pen and wheel.** One set of Pointer Events handlers covers drag to pan, two-finger pinch to zoom and pan, the mouse wheel, and trackpad pinch that the browser reports as ctrl+wheel.
- **Zoom stays under the pointer.** Wheel and pinch zoom keep the content under the pointer in place; zoom buttons keep the viewport centre in place.
- **Limits.** The scale stays between 0.25 and 8 by default. You can set another range, a range for the pan position, or a function that computes either.
- **Programmatic control.** Zoom in, zoom out, zoom to a scale, pan to a position, centre, fit and reset from your own buttons, keys or code.
- **Any renderer.** Apply the transform to HTML, SVG or an image with CSS, or redraw a `<canvas>` with it.
- **Small and typed.** Written in TypeScript with bundled declarations, no runtime dependencies, 3.1 kB gzipped as an ES module, with a UMD build for `require`.

## Install

```sh
npm install canvas-glide
```

## Quick start

This example pans and zooms an image inside a 600 by 400 pixel box. The same wiring works for any element.

```html
<div id="viewport">
  <img id="content" src="map.png" alt="Map" draggable="false" />
</div>
```

```css
#viewport {
  width: 600px;
  height: 400px;
  overflow: hidden;
  touch-action: none;
  user-select: none;
}

#content {
  transform-origin: 0 0;
}
```

```ts
import { createEngine } from 'canvas-glide';

const viewport = document.getElementById('viewport')!;
const content = document.getElementById('content')!;

const engine = createEngine({
  getViewportRect: () => viewport.getBoundingClientRect(),
  getCanvasRect: () => ({ x: 0, y: 0, width: content.offsetWidth, height: content.offsetHeight }),
  state: {
    onTransformChange: ({ origin, scale }) => {
      content.style.transform = `translate(${-origin.x * scale}px, ${-origin.y * scale}px) scale(${scale})`;
    },
  },
});

viewport.addEventListener('pointerdown', engine.event.onPointerDown);
viewport.addEventListener('pointermove', engine.event.onPointerMove);
viewport.addEventListener('pointerup', engine.event.onPointerUp);
viewport.addEventListener('pointercancel', engine.event.onPointerCancel);
viewport.addEventListener('wheel', engine.event.onWheel, { passive: false });
```

Each part of the setup has a job:

- `touch-action: none` gives touch gestures to the engine instead of the browser's own scrolling and page zoom.
- `overflow: hidden` clips the content to the viewport.
- `transform-origin: 0 0` makes the CSS transform match the engine's coordinate model.
- `draggable="false"` on an image stops the browser's native image drag, which would cancel the pointer and end the pan.
- `{ passive: false }` on the wheel listener lets the engine call `preventDefault`, so the wheel zooms instead of scrolling the page.

## Coordinate model

The transform is `{ origin: { x, y }, scale }`. `origin` is the content point, in unscaled content pixels, that sits at the top-left corner of the viewport. A point `p`, measured in pixels from the viewport's top-left corner, shows the content point `origin + p / scale`. The CSS transform in the quick start applies exactly this mapping: with `transform-origin: 0 0` it translates by `-origin × scale` and then scales.

The engine uses two kinds of screen coordinates. Viewport coordinates are pixels from the viewport's top-left corner and are used by `zoomTo` and `zoomAt`. Client coordinates are the `clientX` and `clientY` of a pointer event and are used by `wheelZoom`, the pan and pinch methods, and the event handlers; `getViewportRect` converts between the two.

At scale 1 the content shows at its own size. `fit()` sets scale 1 and centres the content, so it shows the whole content only when the content element is no larger than the viewport.

## Drawing on a canvas

For a `<canvas>`, apply the same mapping with `setTransform` and redraw:

```ts
import { createEngine, type Transform } from 'canvas-glide';

const canvas = document.querySelector('canvas')!;
const context = canvas.getContext('2d')!;

function draw({ origin, scale }: Transform) {
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.setTransform(scale, 0, 0, scale, -origin.x * scale, -origin.y * scale);
  drawScene(context);
}

const engine = createEngine({
  getViewportRect: () => canvas.getBoundingClientRect(),
  getCanvasRect: () => ({ x: 0, y: 0, width: 2000, height: 1000 }),
  state: { onTransformChange: draw },
});

draw(engine.getTransform());
```

The callbacks run synchronously on every input event that changes the transform, which can be more often than the screen refreshes. Schedule an expensive redraw with `requestAnimationFrame`. On high-density screens, size the canvas backing store by `devicePixelRatio` and multiply the transform by it.

## Options

`createEngine(options)` takes these options. `Point` is `{ x, y }`, `Rect` is `{ x, y, width, height }` (a `DOMRect` fits), and `Transform` is `{ origin: Point, scale: number }`; all three are exported types.

| Option | Type | Default | Usage |
|---|---|---|---|
| `getViewportRect` | `() => Rect \| null` | required | Position and size of the viewport in client coordinates, usually `element.getBoundingClientRect()`. While it returns `null`, the calls that need the viewport do nothing. |
| `getCanvasRect` | `() => Rect \| null` | required | Unscaled size of the content. Only `width` and `height` are read, by `fit`, `center` and `reset` without `state.initial`. While it returns `null`, those calls do nothing. |
| `state.initial` | `Transform` | `{ origin: { x: 0, y: 0 }, scale: 1 }` | Starting transform, and the one `reset()` restores. The engine uses it as given, without limits. |
| `state.onTransformChange` | `(transform: Transform) => void` | none | Called with a copy of the transform after the origin or the scale changed. |
| `state.onOriginChange` | `(origin: Point) => void` | none | Called after the origin changed, before `onTransformChange`. |
| `state.onScaleChange` | `(scale: number) => void` | none | Called after the scale changed, before `onTransformChange`. |
| `move.enabled` | `boolean` | `true` | `false` stops pointer drags from panning, and a pinch then zooms about its starting midpoint. The pan methods still work. |
| `move.onIsMovingChange` | `(isMoving: boolean) => void` | none | Called with `true` when a pointer drag starts and with `false` when the last pointer lifts. |
| `scale.enabled` | `boolean` | `true` | `false` stops pinch and wheel zoom and leaves wheel events to the page. The zoom methods still work. |
| `scale.wheelVelocity` | `number` | `0.0015` | Wheel zoom speed. Each wheel event multiplies the scale by `exp(-deltaY × wheelVelocity)`, with `deltaY` in pixels (see [Input handling](#input-handling)). |
| `scale.zoomStep` | `number` | `0.1` | Default step of `zoomIn` and `zoomOut`. |
| `constraints.scale.constraints` | `[min, max]` | `[0.25, 8]` | Allowed scale range. |
| `constraints.scale.constrain` | `(scale: number) => number` | none | Function that returns the allowed scale; it replaces the range. |
| `constraints.scale.enabled` | `boolean` | `true` | `false` removes every scale limit. |
| `constraints.origin.constraints` | `{ x: [min, max], y: [min, max] }` | none | Allowed origin range, in content pixels. |
| `constraints.origin.constrain` | `(origin: Point) => Point` | none | Function that returns the allowed origin; it replaces the range. |
| `constraints.origin.enabled` | `boolean` | `true` | `false` removes every origin limit. |

## Methods

`createEngine` returns an object with these members.

| Method | Effect |
|---|---|
| `getTransform()`, `getOrigin()`, `getScale()` | Return the current transform, origin or scale. Objects are copies. |
| `setTransform(transform, constrainOrigin?)`, `setOrigin(origin)`, `setScale(scale)` | Write the value as given, without the configured limits. `setTransform` passes the origin through `constrainOrigin` when one is given. A value that is not a finite number is ignored. |
| `zoomIn(step?)`, `zoomOut(step?)` | Multiply or divide the scale by `1 + step` about the viewport centre. `step` defaults to `scale.zoomStep`. |
| `zoomTo(scale, pivot?)` | Set the scale, keeping `pivot` (viewport coordinates) or the viewport centre in place. |
| `zoomAt(factor, point)` | Multiply the scale by `factor`, keeping `point` (viewport coordinates) in place. |
| `zoomBy(delta)` | Add `delta` to the scale, about the viewport centre. |
| `wheelZoom(deltaY, point)` | Apply one wheel step at `point` (client coordinates). |
| `panTo(origin)` | Move the origin to `origin`. |
| `center()` | Centre the content at the current scale. |
| `fit()` | Set scale 1 and centre the content. |
| `reset()` | Restore `state.initial`, or call `fit()` when no initial transform was given. |
| `panStart(point)`, `pan(point)`, `panEnd()` | Drive a pan from your own input source, in client coordinates. |
| `pinchStart(points)`, `pinch(points)`, `pinchEnd()` | Drive a two-point pinch from your own input source, in client coordinates. |
| `isPanEnabled()`, `isZoomEnabled()` | Return `move.enabled` and `scale.enabled`. |
| `event` | The DOM handlers `onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel` and `onWheel`. |
| `stateService`, `scaleService`, `moveService` | The underlying state, zoom and pan modules. |

Every method except the three setters, and `reset()` with `state.initial`, applies the scale and origin limits.

## Pan and zoom limits

A range clamps each value on its own: the scale to `[min, max]`, and the origin per axis in content pixels. A `constrain` function receives the proposed value and returns the allowed one, so it can compute a limit from the current state. During a zoom, `getScale()` already returns the new scale when the origin function runs.

This example limits the scale to 0.5 to 4 and keeps the centre of the viewport over the content at every scale:

```ts
const engine = createEngine({
  getViewportRect: () => viewport.getBoundingClientRect(),
  getCanvasRect: () => ({ x: 0, y: 0, width: content.offsetWidth, height: content.offsetHeight }),
  constraints: {
    scale: { constraints: [0.5, 4] },
    origin: {
      constrain: ({ x, y }) => {
        const scale = engine.getScale();
        const halfWidth = viewport.clientWidth / (2 * scale);
        const halfHeight = viewport.clientHeight / (2 * scale);
        return {
          x: Math.min(Math.max(x, -halfWidth), content.offsetWidth - halfWidth),
          y: Math.min(Math.max(y, -halfHeight), content.offsetHeight - halfHeight),
        };
      },
    },
  },
});
```

## Input handling

The `event` handlers implement these rules:

- Only the primary button starts a gesture: the left mouse button, a touch, or a pen tip.
- One pointer pans. A second pointer starts a pinch, in which the distance between the two pointers sets the scale and their midpoint pans. Further pointers are ignored, and lifting one pointer of a pinch continues the pan with the other.
- A press captures the pointer on the element the handler is attached to, so a drag continues when the pointer leaves the viewport.
- A wheel event's `deltaY` is converted to pixels (line mode × 32, page mode × 800), multiplied by 10 for ctrl+wheel, and clamped to ±120 per event.
- With `move.enabled` and `scale.enabled` both `false`, pointer events are left to the page. With `scale.enabled` set to `false`, wheel events are left to the page.

## Scope

The engine does not animate, add inertia, rotate or read the keyboard. Each input event updates the transform once, synchronously; bind keys to `zoomIn`, `zoomOut` or `panTo` for keyboard control. Trackpad pinch works through the ctrl+wheel events that Chromium-based browsers and Firefox send; the engine does not listen to WebKit `gesturechange` events.

## Framework bindings and demo

[vrtexe/canvas-glide-react](https://github.com/vrtexe/canvas-glide-react) wraps the engine in React components. The [live demo](https://vrtexe.github.io/canvas-glide-react-demo/) uses it to pan and zoom canvas, image and HTML content.

## Development

```sh
npm ci
npm test
npm run build
```

`npm test` runs the Vitest suite in `test/`. `npm run build` type-checks with `tsc` and writes `dist/` with Vite: `canvas-glide.js` (ES module), `canvas-glide.umd.cjs` (UMD) and `canvas-glide.d.ts`.

## License

MIT, see [LICENSE.md](LICENSE.md).
