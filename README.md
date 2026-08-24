# Lovelace swipe card

A Lovelace card that uses [swiper](https://swiperjs.com/) to create a touch slider that lets you flick through multiple cards.
You can use (almost?) all options of swiper, these can be found [here](https://swiperjs.com/swiper-api).

This is a maintained fork of [bramkragten/swipe-card](https://github.com/bramkragten/swipe-card) - see
[changelog.md](changelog.md) for what's different.

## Installation:

### HACS (recommended)

Add this repository as a [custom repository](https://hacs.xyz/docs/faq/custom_repositories/) in HACS
(category: Dashboard), then install "Swipe Card" from HACS as normal.

### Manual

Download `dist/swipe-card.js` from the [latest release](https://github.com/wantstoautomate/swipe-card/releases)
to `/config/www/swipe-card/`. Add the following to resources in your lovelace config:

```yaml
resources:
  - url: /local/swipe-card/swipe-card.js
    type: module
```

## Configuration:

And add a card with type `custom:swipe-card`:

```yaml
- type: custom:swipe-card
  cards: []
```

## Parameters

| Name | Type | Default | Supported options | Description |
| ---- | ---- | ------- | ----------------- | ----------- |
| `card_width` | string | | Any css option that fits in the `width` css value | Will force the width of the swiper container |
| `start_card` | number | | Any number | The card being displayed at the beginning |
| `parameters` | object | | Any parameter from [here](https://swiperjs.com/swiper-api#parameters) | Configuration of the swiper. Note: `parameters.loop` is handled specially, see below. |
| `reset_after` | number | | Any number | Will reset the swiper to the `start_card` if defined or the first card after `reset_after` seconds |
| `active_card` | list | | List of `{entity, state, index}` | Reactively slide to a card when an entity matches a state - see below |
| `default_card` | number | | Any number | Card to show when no `active_card` rule matches (falls back to `start_card`, then the first card) |

### `parameters.loop`

`loop: true` no longer passes through to Swiper's own loop implementation. Swiper wraps around by
`cloneNode()`-ing slide DOM, which doesn't work with Lovelace cards: `hass`/`config` are set as plain JS
properties (not attributes), so the cloned slides come out uninitialized and Swiper's own loop-repositioning
logic gets permanently stuck at the last slide (see [#67](https://github.com/bramkragten/swipe-card/issues/67)
for a report of the same underlying symptom via mod-card). `loop: true` now triggers a manual wraparound
implementation instead - swiping or navigating past the last card goes to the first, and vice versa - and every
slide stays a normal, fully-functional card regardless of position.

### `active_card`

Lets the swiper reactively navigate itself based on entity state, instead of only supporting a static
`start_card` set once at load:

```yaml
- type: custom:swipe-card
  active_card:
    - entity: input_boolean.bedroom_active
      state: "on"      # optional, defaults to "on"
      index: 1
    - entity: input_boolean.study_active
      index: 2
  default_card: 1        # shown when no rule matches; falls back to start_card, then 1
  cards:
    - ...                # card 1 (bedroom)
    - ...                # card 2 (study)
```

Rules are checked in order on every `hass` update; the first matching rule's card is shown. `index` uses the
same 1-based numbering as `start_card`.
