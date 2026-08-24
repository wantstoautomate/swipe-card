## 6.0.1

- Fix `parameters.loop: true`: the 6.0.0 fix stopped Swiper's own loop mode from getting stuck, but its
  touch-boundary heuristic raced against Swiper's own native resistance/overshoot handling and could land on
  the wrong slide, with a visible resistance "hit the edge" tell before wrapping. Replaced with real padding
  slides (clones of the first/last card) plus a silent teleport to the equivalent real slide on arrival -
  Swiper always has a genuine slide to drag into, so there's no boundary math to race and no resistance tell.

## 6.0.0

- Update Swiper from 6.5.9 to 14.1.0
- Fix `parameters.loop: true` getting permanently stuck at the last slide with real (non-plain) card content, by implementing wraparound manually instead of relying on Swiper's clone-based loop mode (#67)
- Add `active_card` / `default_card` to reactively navigate the swiper based on entity state, instead of only a static `start_card`

## 4.0.0

- Drop support for older Home Assistant versions
- Report the correct card size
- Bug fixes

## 3.0.0

- Bundled version
- Updated swiper

## 2.0.1

- Make local possible with `path` option
- Some bug fixes

## 2.0.0

- Convert to LitElement

## 1.0.3

- Initial release that supports versioning
