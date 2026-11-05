# Refined Later motion — November 5, 2026

Current evidence superseding the older five-and-a-half-card layout. Captured from the actual production build in fresh desktop Chromium contexts at 1440×1000. Every record uses synthetic task data; no owner data is opened or reset.

## View the recordings

| Pending items | Actual recording | Initial viewport | Final state | Frame/timing samples |
|---|---|---|---|---|
| 1 | [Video](1-items.webm) | [Image](1-items-queue.png) | [Image](1-items-finished.png) | [JSON](1-items-frames.json) |
| 2 | [Video](2-items.webm) | [Image](2-items-queue.png) | [Image](2-items-finished.png) | [JSON](2-items-frames.json) |
| 4 | [Video](4-items.webm) | [Image](4-items-queue.png) | [Image](4-items-finished.png) | [JSON](4-items-frames.json) |
| 10 | [Video](10-items.webm) | [Image](10-items-queue.png) | [Image](10-items-finished.png) | [JSON](10-items-frames.json) |
| 10, scrolled 100 px | [Video](10-items-scrolled.webm) | [Image](10-items-scrolled-queue.png) | [Image](10-items-scrolled-finished.png) | [JSON](10-items-scrolled-frames.json) |

Selected **actual screencast frames** (not a mock animation):

- Four items: [outward](4-items-outward.jpg) → [return](4-items-return.jpg) → [settling](4-items-settling.jpg).
- Ten items: [outward](10-items-outward.jpg) → [return](10-items-return.jpg) → [settling](10-items-settling.jpg).
- Scrolled: [outward](10-items-scrolled-outward.jpg) → [return](10-items-scrolled-return.jpg) → [settling](10-items-scrolled-settling.jpg).

## What was inspected

The outward, mid-return and settling frames were opened and inspected, including frame extracts from the one- and two-item recordings. The main card remains visible to the left while separated, then follows a lower curved path behind the gently promoting next card. Only about 39 px of its bounding box overlaps the stack at the first sampled layer-change frame in these desktop recordings. It stays opaque and mounted through the transition. For one item, the same pending card returns to the front; it is not completed or replaced.

Native browser events report **230 ms outward** and **480 ms returning** in all five recordings. Video/frame scheduling can add wall-clock latency; this is not a real-time performance guarantee. In 4/10-item decks the outgoing large-card DOM node can unmount **after** returning completely behind the top-three visible cards; the occurrence remains pending at the sidebar bottom. Detached samples after completion are expected, never counted as transition frames.

The compact card lifts with a shadow and z-index 30, travels downward above the other rows as they fill upward, then loses its raised shadow during its final settle. The offscreen destination leaves through the visible bottom edge. The scrolled capture remains at **100 px** throughout; other captures stay at zero. IDs/nodes are retained; there is no force-scroll or extra reorder write.

The viewport is **3 × 60 + 3 × 8 + 0.5 × 60 = 234 px**: three full cards and the upper half of the fourth. One/two items occupy only their content height. `ResizeObserver` measures untransformed card height and CSS gap; tests also change them to 64 px/10 px and verify a 254 px viewport, with half of the fourth still visible.

## Reproduce

With a production build served at `http://127.0.0.1:4173`:

```sh
cd apps/web
node tests/capture-later-refinement.mjs
```

Requires installed Chromium (`CHROMIUM_PATH` override supported) and ffmpeg. Raw recording frames go to ignored `test-results`; selected screenshots, recordings and traces above are intentional documentation evidence. Reduced-motion behavior is tested separately without this large travel animation. No real Safari/iPhone, native widget, or OS-installed PWA verification is claimed.
