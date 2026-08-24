import { LitElement, html, css, unsafeCSS } from "lit";

import Swiper from "swiper/swiper-bundle.esm.js";
import swiperStyle from "swiper/swiper-bundle.css";
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
    if (window.ResizeObserver) {
      this._ro = new ResizeObserver(() => {
        if (this.swiper) {
          this.swiper.update();
        }
      });
    }
    this._createCards();
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

  // Reactive navigation: if `active_card` rules are configured, slide to
  // whichever rule's entity currently matches, or to `default_card` (falling
  // back to `start_card`, then the first card) when none match. Runs on
  // every hass update - same place hass is already forwarded to child cards,
  // so it needs no extra lifecycle wiring and works regardless of whether
  // this component's own render() happens to run on a given tick.
  _maybeNavigateToActiveCard(hass) {
    if (!hass || !this.swiper || !this._activeCardRules.length) {
      return;
    }
    let targetIndex = this._defaultCardIndex();
    for (const rule of this._activeCardRules) {
      const stateObj = hass.states[rule.entity];
      const wantState = rule.state !== undefined ? rule.state : "on";
      if (stateObj && stateObj.state === wantState) {
        targetIndex = rule.index - 1;
        break;
      }
    }
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
        class="swiper-container"
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
      this._parameters.initialSlide = this._config.start_card - 1;
    }

    // Swiper's own `loop: true` wraps around by cloneNode()-ing slide DOM
    // for padding. That breaks when a slide's content is a custom element
    // (as virtually all Lovelace cards are): hass/config are plain JS
    // properties, not attributes, so cloneNode() never copies them, and the
    // resulting clone is uninitialized. Swiper's own loop-repositioning
    // logic then fails to measure it correctly and gets permanently stuck
    // at the last real slide - see https://github.com/bramkragten/swipe-card/issues/67
    // for a report of the same underlying symptom via mod-card.
    //
    // Rather than passing `loop` through to Swiper's constructor, implement
    // wraparound ourselves: it never touches slide DOM, so every slide stays
    // a normal, fully-initialized card element regardless of position.
    this._manualLoop = this._parameters.loop === true;
    const swiperParams = { ...this._parameters };
    if (this._manualLoop) {
      delete swiperParams.loop;
    }

    this.swiper = new Swiper(
      this.shadowRoot.querySelector(".swiper-container"),
      swiperParams
    );

    if (this._manualLoop) {
      this._patchManualLoop(this.swiper);
    }

    // hass may have already arrived before the swiper instance existed;
    // run one navigation pass now that it's ready.
    if (this._hass) {
      this._maybeNavigateToActiveCard(this._hass);
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

  // Manual wraparound for `parameters.loop: true` (see _initialLoad for why
  // Swiper's own loop mode isn't used). Covers both programmatic navigation
  // (slideNext/slidePrev - used by nav buttons and reset_after) and raw
  // touch/mouse drag gestures past the first/last slide.
  _patchManualLoop(swiper) {
    const origNext = swiper.slideNext.bind(swiper);
    const origPrev = swiper.slidePrev.bind(swiper);
    swiper.slideNext = (...args) => {
      if (swiper.isEnd) {
        swiper.slideTo(0);
      } else {
        origNext(...args);
      }
    };
    swiper.slidePrev = (...args) => {
      if (swiper.isBeginning) {
        swiper.slideTo(swiper.slides.length - 1);
      } else {
        origPrev(...args);
      }
    };

    let boundaryAtTouchStart = null;
    let startX = null;
    swiper.on("touchStart", (s, event) => {
      boundaryAtTouchStart = s.isEnd
        ? "end"
        : s.isBeginning
        ? "beginning"
        : null;
      startX = event.touches ? event.touches[0].clientX : event.clientX;
    });
    swiper.on("touchEnd", (s, event) => {
      if (!boundaryAtTouchStart) {
        return;
      }
      const endX = event.changedTouches
        ? event.changedTouches[0].clientX
        : event.clientX;
      const dx = endX - startX;
      const THRESHOLD = 30; // px, avoid triggering on taps/jitter
      if (boundaryAtTouchStart === "end" && dx < -THRESHOLD && s.isEnd) {
        s.slideTo(0);
      } else if (
        boundaryAtTouchStart === "beginning" &&
        dx > THRESHOLD &&
        s.isBeginning
      ) {
        s.slideTo(s.slides.length - 1);
      }
      boundaryAtTouchStart = null;
    });
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

    this._cards = await this._cardPromises;
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
  "%c   SWIPE-CARD  \n%c Version 5.0.0 ",
  "color: orange; font-weight: bold; background: black",
  "color: white; font-weight: bold; background: dimgray"
);
