## Unreleased

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
