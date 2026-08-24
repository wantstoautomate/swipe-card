import { LitElement, html, css, unsafeCSS } from "lit";

// eslint-plugin-import's resolver doesn't understand package.json "exports"
// maps (Swiper 9+ ships one), so it can't see these subpaths even though
// rollup resolves them correctly at build time.
// eslint-disable-next-line import/no-unresolved
import Swiper from "swiper/bundle";
// eslint-disable-next-line import/no-unresolved
import swiperStyle from "swiper/css/bundle";
import deepcopy from "deep-clone-simple";

const HELPERS = window.loadCardHelpers ? window.loadCardHelpers() : undefined;

window.customCards = window.customCards || [];
window.customCards.push({
  type: "swipe-card",
  name: "Swipe Card",
  description: "A card thats lets you swipe through multiple Lovelace cards.",
});

const computeCardSize = (card) => {
  if (typeof card.getCardSize === "function") {
    return card.getCardSize();
  }
  if (customElements.get(card.localName)) {
    return 1;
  }
  return customElements
    .whenDefined(card.localName)
    .then(() => computeCardSize(card));
};

class SwipeCard extends LitElement {
  static get properties() {
    return {
      _config: {},
      _cards: {},
    };
  }

  static getStubConfig() {
    return { cards: [] };
  }

  shouldUpdate(changedProps) {
    if (changedProps.has("_config") || changedProps.has("_cards")) {
      return true;
    }
    return false;
  }

  static get styles() {
    return css`
      :host {
        --swiper-theme-color: var(--primary-color);
      }
      ${unsafeCSS(swiperStyle)}
    `;
  }

  setConfig(config) {
    if (!config || !config.cards || !Array.isArray(config.cards)) {
      throw new Error("Card config incorrect");
    }
    this._config = config;
    this._parameters = deepcopy(this._config.parameters) || {};
    this._cards = [];
    this._activeCardRules = config.active_card || [];
    this._lastActiveIndex = null;
    // See _createCards/_initialLoad for why loop:true doesn't pass through
    // to Swiper directly - this flag needs to be known before cards are
    // built, since looping adds two extra padding slides.
    this._loopEnabled = this._parameters.loop === true;
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => {
        if (this.swiper) {
          this.swiper.update();
        }
      });
    }
    // _initialLoad awaits this before constructing Swiper - see there for
    // why (constructing against slide DOM that doesn't exist yet makes
    // initialSlide silently a no-op).
    this._cardsReady = this._createCards();
  }

  set hass(hass) {
    this._hass = hass;

    if (!this._cards) {
      return;
    }

    this._cards.forEach((element) => {
      element.hass = this._hass;
    });

    this._maybeNavigateToActiveCard(hass);
  }

  // Which card `active_card`'s rules currently resolve to: whichever rule's
  // entity matches first, or `default_card` (falling back to `start_card`,
  // then the first card) when none match. Pure computation, no navigation -
  // see _maybeNavigateToActiveCard and _initialLoad for the two ways this
  // gets used.
  _computeActiveCardIndex(hass) {
    // +1 when loop padding is in play: index 0 is the wraparound clone of
    // the last card, so real card 1 actually lives at swiper index 1.
    const offset = this._loopEnabled ? 1 : 0;
    for (const rule of this._activeCardRules) {
      const stateObj = hass.states[rule.entity];
      const wantState = rule.state !== undefined ? rule.state : "on";
      if (stateObj && stateObj.state === wantState) {
        return rule.index - 1 + offset;
      }
    }
    return this._defaultCardIndex() + offset;
  }

  // Reactive navigation: on every hass update (same place hass is already
  // forwarded to child cards, so it needs no extra lifecycle wiring), slide
  // to whatever _computeActiveCardIndex currently resolves to, if that's
  // different from last time. Deliberately NOT called for the very first
  // hass update after load - see _initialLoad, which seeds _lastActiveIndex
  // silently instead so the card always starts at start_card/default_card
  // regardless of whatever state active_card's entities already happen to
  // be in, and only reacts to genuine changes from that point on.
  _maybeNavigateToActiveCard(hass) {
    if (!hass || !this.swiper || !this._activeCardRules.length) {
      return;
    }
    const targetIndex = this._computeActiveCardIndex(hass);
    if (targetIndex !== this._lastActiveIndex) {
      this._lastActiveIndex = targetIndex;
      this.swiper.slideTo(targetIndex);
    }
  }

  _defaultCardIndex() {
    if ("default_card" in this._config) {
      return this._config.default_card - 1;
    }
    if ("start_card" in this._config) {
      return this._config.start_card - 1;
    }
    return 0;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this._config && this._hass && this._updated && !this._loaded) {
      this._initialLoad();
    } else if (this.swiper) {
      this.swiper.update();
    }
  }

  updated(changedProperties) {
    super.updated(changedProperties);
    this._updated = true;
    if (this._config && this._hass && this.isConnected && !this._loaded) {
      this._initialLoad();
    } else if (this.swiper) {
      this.swiper.update();
    }
  }

  render() {
    if (!this._config || !this._hass) {
      return html``;
    }

    return html`
      <div
        class="swiper"
        dir="${this._hass.translationMetadata.translations[
          this._hass.selectedLanguage || this._hass.language
        ].isRTL || false
          ? "rtl"
          : "ltr"}"
      >
        <div class="swiper-wrapper">${this._cards}</div>
        ${"pagination" in this._parameters
          ? html` <div class="swiper-pagination"></div> `
          : ""}
        ${"navigation" in this._parameters
          ? html`
              <div class="swiper-button-next"></div>
              <div class="swiper-button-prev"></div>
            `
          : ""}
        ${"scrollbar" in this._parameters
          ? html` <div class="swiper-scrollbar"></div> `
          : ""}
      </div>
    `;
  }

  async _initialLoad() {
    this._loaded = true;

    await this.updateComplete;
    // Card creation is async (and, when loop is enabled, has an extra async
    // step to build the two padding slides after the real cards resolve)
    // and isn't guaranteed to have finished by the point above - the
    // updateComplete there only waits for whatever Lit update was already
    // pending, not one triggered by _cards being reassigned later. Without
    // this, Swiper can end up constructed against slide DOM that doesn't
    // exist yet, silently making `initialSlide` a no-op and landing on
    // index 0 instead.
    if (this._cardsReady) {
      await this._cardsReady;
      await this.updateComplete;
    }

    if ("pagination" in this._parameters) {
      if (this._parameters.pagination === null) {
        this._parameters.pagination = {};
      }
      this._parameters.pagination.el =
        this.shadowRoot.querySelector(".swiper-pagination");
    }

    if ("navigation" in this._parameters) {
      if (this._parameters.navigation === null) {
        this._parameters.navigation = {};
      }
      this._parameters.navigation.nextEl = this.shadowRoot.querySelector(
        ".swiper-button-next"
      );
      this._parameters.navigation.prevEl = this.shadowRoot.querySelector(
        ".swiper-button-prev"
      );
    }

    if ("scrollbar" in this._parameters) {
      if (this._parameters.scrollbar === null) {
        this._parameters.scrollbar = {};
      }
      this._parameters.scrollbar.el =
        this.shadowRoot.querySelector(".swiper-scrollbar");
    }

    if ("start_card" in this._config) {
      this._parameters.initialSlide =
        this._config.start_card - 1 + (this._loopEnabled ? 1 : 0);
    }

    // Swiper's own `loop: true` wraps around by cloneNode()-ing slide DOM
    // for padding. That breaks when a slide's content is a custom element
    // (as virtually all Lovelace cards are): hass/config are plain JS
    // properties, not attributes, so cloneNode() never copies them, and the
    // resulting clone is uninitialized. Dragging past the boundary then hits
    // Swiper's own non-loop resistance/overshoot logic instead (since it
    // never actually enters loop mode with a broken clone), which can land
    // on the wrong slide entirely - see
    // https://github.com/bramkragten/swipe-card/issues/67 for a report of
    // the same underlying clone-initialization symptom via mod-card.
    //
    // Rather than passing `loop` through to Swiper's constructor at all,
    // _createCards() adds two extra padding slides - real, fully-initialized
    // clones of the first/last card, built through the same
    // _createCardElement() pipeline as every other slide - and this handler
    // silently (0ms) teleports to the equivalent real slide the instant a
    // transition into one of them finishes. Swiper always has a genuine
    // slide to drag into in both directions, so there's no resistance zone
    // and no boundary math to get wrong: dragging feels like an ordinary
    // slide transition throughout, not a special-cased "you hit the edge"
    // gesture, and slideNext()/slidePrev() (nav buttons, reset_after) work
    // completely natively with no patching needed.
    const swiperParams = { ...this._parameters };
    delete swiperParams.loop;

    this.swiper = new Swiper(
      this.shadowRoot.querySelector(".swiper"),
      swiperParams
    );

    if (this._loopEnabled) {
      // _cards.length read fresh on each firing, not captured here: card
      // creation is async and _initialLoad doesn't wait on it (matching the
      // rest of this method - cards can still be resolving when this runs),
      // so the padding slides may not exist in _cards yet at this point.
      this.swiper.on("slideChangeTransitionEnd", (s) => {
        const lastRealIndex = this._cards.length - 2;
        if (s.activeIndex === 0) {
          s.slideTo(lastRealIndex, 0);
        } else if (s.activeIndex === this._cards.length - 1) {
          s.slideTo(1, 0);
        }
      });
    }

    // Deliberately not navigating here even if hass already arrived before
    // the swiper existed: the card should always open on start_card/
    // default_card, not immediately jump to wherever active_card's entities
    // already happen to be. Seed the change-detection baseline silently
    // instead, so the *next* real change is what triggers navigation, not
    // the current already-in-place state.
    if (this._hass && this._activeCardRules.length) {
      this._lastActiveIndex = this._computeActiveCardIndex(this._hass);
    }

    if (this._config.reset_after) {
      this.swiper
        .on("slideChange", () => {
          this._setResetTimer();
        })
        .on("click", () => {
          this._setResetTimer();
        })
        .on("touchEnd", () => {
          this._setResetTimer();
        });
    }
  }

  _setResetTimer() {
    if (this._resetTimer) {
      window.clearTimeout(this._resetTimer);
    }
    this._resetTimer = window.setTimeout(() => {
      this.swiper.slideTo(this._parameters.initialSlide || 0);
    }, this._config.reset_after * 1000);
  }

  async _createCards() {
    this._cardPromises = Promise.all(
      this._config.cards.map((config) => this._createCardElement(config))
    );

    const realCards = await this._cardPromises;

    if (this._loopEnabled && realCards.length > 0) {
      // Real, fully-initialized clones (built through the same
      // _createCardElement() pipeline as every other slide, not
      // Swiper's own cloneNode()-based loop padding) of the last/first
      // card, so there's always a genuine slide to drag into at both
      // boundaries. See _initialLoad for the teleport-on-arrival logic
      // that swaps these back to the real equivalent slide.
      const [wrapStart, wrapEnd] = await Promise.all([
        this._createCardElement(
          this._config.cards[this._config.cards.length - 1]
        ),
        this._createCardElement(this._config.cards[0]),
      ]);
      this._cards = [wrapStart, ...realCards, wrapEnd];
    } else {
      this._cards = realCards;
    }

    if (this._ro) {
      this._cards.forEach((card) => {
        this._ro.observe(card);
      });
    }
    if (this.swiper) {
      this.swiper.update();
    }
  }

  async _createCardElement(cardConfig) {
    const element = (await HELPERS).createCardElement(cardConfig);
    element.className = "swiper-slide";
    if ("card_width" in this._config) {
      element.style.width = this._config.card_width;
    }
    if (this._hass) {
      element.hass = this._hass;
    }
    element.addEventListener(
      "ll-rebuild",
      (ev) => {
        ev.stopPropagation();
        this._rebuildCard(element, cardConfig);
      },
      {
        once: true,
      }
    );
    return element;
  }

  async _rebuildCard(cardElToReplace, config) {
    let newCardEl = this.createCardElement(config);
    try {
      newCardEl.hass = this.hass;
    } catch (e) {
      newCardEl = document.createElement("ha-alert");
      newCardEl.alertType = "error";
      newCardEl.innerText = e.message;
    }
    if (cardElToReplace.parentElement) {
      cardElToReplace.parentElement.replaceChild(newCardEl, cardElToReplace);
    }
    this._cards = this._cards.map((curCardEl) =>
      curCardEl === cardElToReplace ? newCardEl : curCardEl
    );
    this._ro.unobserve(cardElToReplace);
    this._ro.observe(newCardEl);
    this.swiper.update();
  }

  async getCardSize() {
    await this._cardPromises;

    if (!this._cards) {
      return 0;
    }

    const promises = [];

    for (const element of this._cards) {
      promises.push(computeCardSize(element));
    }

    const results = await Promise.all(promises);

    return Math.max(...results);
  }
}

customElements.define("swipe-card", SwipeCard);
console.info(
  "%c   SWIPE-CARD  \n%c Version 6.0.2 ",
  "color: orange; font-weight: bold; background: black",
  "color: white; font-weight: bold; background: dimgray"
);
