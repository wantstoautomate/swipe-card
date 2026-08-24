## 6.1.0

- **Breaking:** `active_card` is now an object instead of a bare list, grouping everything specific to this
  feature under one key instead of scattering it across top-level config:
  - `active_card.rules` - the list of `{entity, state, index}` rules (was the bare `active_card` list before).
  - `default_card` is renamed to `active_card.fallback_card` ("default" was ambiguous with `start_card`, which
    is also a kind of default - this one is specifically active_card's own fallback).
  - `active_card.on_load` (new, default `true`) - whether `active_card` applies to the very first render, not
    just changes afterward. `false` restores 6.0.2's behavior (always open on `start_card`, only react to
    changes after load) as an explicit opt-in rather than the only option; `true` (the new default) means the
    card opens already matching current entity state, which is what most setups actually want, given a change
    after load already worked that way.
  - See the README for the full example and the two use cases `on_load` covers.

## 6.0.2

- Fix Swiper being constructed before its slide DOM exists: card creation is async (an extra async step when
  loop is enabled, to build the two padding slides), but `_initialLoad` never waited for it before constructing
  `new Swiper()`. `initialSlide` then silently had nothing to select and landed on index 0 - the wraparound
  clone of the last card when looping - instead of `start_card`. Explains both: the card opening on whatever
  card an `active_card` entity happened to already match instead of `start_card`, and not being able to swipe
  backward until swiping through every other card first (dragging started from a corrupted boundary state).
- `active_card` no longer applies on the very first render: the card always opens on `start_card`/`default_card`
  regardless of what state its entities already happen to be in, and only reacts to genuine changes from that
  point on.

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
