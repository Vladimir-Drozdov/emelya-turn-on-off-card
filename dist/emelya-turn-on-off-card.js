import { LitElement, html, css } from "/local/lib/lit.js";
import { handleAction, hasAction } from "/local/lib/custom-card-helpers.js";

function clone(value) {
  return structuredClone(value);
}

// Домены, у которых включение/выключение делается сервисами <domain>.turn_on / <domain>.turn_off
const TURN_ON_OFF_DOMAINS = [
  "light", "switch", "fan", "input_boolean", "automation", "humidifier",
  "siren", "media_player", "remote", "vacuum", "water_heater"
];

// Домены с нестандартными именами сервисов вкл/выкл
const DOMAIN_SERVICE_MAP = {
  lock:  { on: "unlock", off: "lock" },
  cover: { on: "open_cover", off: "close_cover" },
  valve: { on: "open_valve", off: "close_valve" }
};

// Состояния, которые считаем "включено"
const ON_STATES = ["on", "open", "unlocked", "playing", "home", "cleaning", "heat", "cool"];

function getServiceCall(entityId, turningOn) {
  const domain = entityId.split(".")[0];
  const mapped = DOMAIN_SERVICE_MAP[domain];
  if (mapped) {
    return { domain, service: turningOn ? mapped.on : mapped.off };
  }
  return { domain, service: turningOn ? "turn_on" : "turn_off" };
}

function isEntityOn(hass, entityId) {
  const stateObj = hass?.states?.[entityId];
  if (!stateObj) return false;
  return ON_STATES.includes(stateObj.state);
}

/* MAIN CARD */
class EmelyaTurnOnOffCard extends LitElement {
  static properties = {
    hass: {},
    config: {},
  };

  static styles = css`
    :host {
      display: block;
      max-width: 450px; min-width: 320px;
      width: 100%;
      border-radius: 24px;
      border: none !important;
    }
    ha-card {
      border-radius: 24px !important;
      border: none !important;
      box-shadow: none !important;
      width: 100%;
      background: #1C1B1F;
      padding: 16px;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 8px;
      cursor: pointer;
      user-select: none;
      position: relative;
    }
    ha-card::before {
      content: "" !important;
      position: absolute !important;
      inset: 0 !important;
      padding: 1px !important;
      border-radius: inherit !important;
      background: linear-gradient(291.96deg, #4D4A54 0%, #1C1B1F 50%, #4D4A54 100%);
      pointer-events: none !important;
      -webkit-mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor !important;
      mask-composite: exclude !important;
    }

    .header {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 0 0 8px;
    }
    .icon-button {
      width: 64px;
      height: 64px;
      background: rgba(28, 27, 31, 1);
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      flex-shrink: 0;
      position: relative;
      border: none;
      transition: background 0.2s ease;
    }
    .icon-button.on { background: #343239; }
    .icon-button::before {
      content: "" !important;
      position: absolute !important;
      inset: 0 !important;
      padding: 1px !important;
      border-radius: inherit !important;
      background: linear-gradient(135deg, rgba(101, 101, 101, 0) 0%, #656565 50%, rgba(101, 101, 101, 0) 100%) !important;
      pointer-events: none !important;
      -webkit-mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor !important;
      mask-composite: exclude !important;
    }
    .icon-button img { width: 14px; height: 20px; }

    .text-wrap {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .title {
      color: #fff;
      font-size: 18px;
      font-weight: 600;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .subtitle {
      color: rgba(255, 255, 255, 0.6);
      font-size: 14px;
      line-height: 1.2;
    }

    /* Нижний переключатель: два слота, слева пустой кружок (выкл), справа power (вкл) */
    .switch-wrap {
      position: relative;
      display: flex;
      height: 56px;
      padding: 4px;
      align-items: center;
      gap: 8px;
      box-sizing: border-box;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.10);
      z-index: 1;
    }
    .switch-wrap::before {
      content: "" !important;
      position: absolute !important;
      inset: 0 !important;
      padding: 1px !important;
      border-radius: inherit !important;
      background: linear-gradient(165deg, rgba(101,101,101,0) 0%, #656565 50%, rgba(101,101,101,0) 100%) !important;
      pointer-events: none !important;
      -webkit-mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor !important;
      mask-composite: exclude !important;
    }

    .switch-slot {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 48px;
      border-radius: 12px;
      cursor: pointer;
      position: relative;
      z-index: 1;
      transition: background 0.2s ease;
    }
    .switch-slot.active {
      background: rgba(255, 255, 255, 0.18);
    }
    .switch-slot img { width: 18px; height: 18px; }

    .switch-dot {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #ffffff;
    }

    .empty {
      color: rgba(255, 255, 255, 0.55);
      text-align: center;
      padding: 14px 10px;
      border: 1px dashed rgba(255, 255, 255, 0.12);
      border-radius: 16px;
    }
  `;

  constructor() {
    super();
    this._holdTimer = null;
    this._tapTimer = null;
    this._lastTap = 0;
  }

  setConfig(config) {
    this.config = {
      title: "",
      subtitle: "",
      entity: "",
      tap_action: { action: "more-info" },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
      base_path: "/local",
      ...clone(config || {})
    };
    this.base = this.config.base_path || "/local";
  }

  get hass() {
    return this._hass;
  }

  set hass(hass) {
    this._hass = hass;
    this.requestUpdate();
  }

  _isOn() {
    const entityId = this.config?.entity;
    if (!entityId || !this._hass) return false;
    return isEntityOn(this._hass, entityId);
  }

  _stateLabel() {
    const entityId = this.config?.entity;
    const stateObj = this._hass?.states?.[entityId];
    if (!stateObj) return "";
    return this._isOn() ? "Включено" : "Выключено";
  }

  _title() {
    if (this.config?.title) return this.config.title;
    const entityId = this.config?.entity;
    if (!entityId) return "<Device>";
    return this._hass?.states?.[entityId]?.attributes?.friendly_name || entityId;
  }

  _setState(turningOn) {
    const entityId = this.config?.entity;
    if (!entityId || !this._hass) return;
    const { domain, service } = getServiceCall(entityId, turningOn);
    this._hass.callService(domain, service, { entity_id: entityId });
  }

  _onSlotClick(e, turningOn) {
    e.stopPropagation();
    if (!this.config?.entity) return;
    const currentlyOn = this._isOn();
    if (currentlyOn === turningOn) return;
    this._setState(turningOn);
  }

  firstUpdated() {
    const frame = this.shadowRoot?.querySelector("ha-card");
    if (!frame) return;
    frame.addEventListener("pointerdown", this._onPointerDown.bind(this));
    frame.addEventListener("pointerup", this._onPointerUp.bind(this));
    frame.addEventListener("click", this._onClick.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
    if (this._tapTimer) { clearTimeout(this._tapTimer); this._tapTimer = null; }
  }

  _onPointerDown(e) {
    if (e.target.closest(".switch-wrap")) return;
    if (hasAction(this.config, "hold_action")) {
      this._holdTimer = setTimeout(() => this._performAction("hold"), 500);
    }
  }

  _onPointerUp() {
    if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
  }

  _onClick(e) {
    if (e.target.closest(".switch-wrap")) return;
    const now = Date.now();
    if (this._lastTap && now - this._lastTap < 300) {
      if (hasAction(this.config, "double_tap_action")) {
        clearTimeout(this._tapTimer);
        e.stopImmediatePropagation();
        this._performAction("double_tap");
        this._lastTap = 0;
        return;
      }
    }
    this._lastTap = now;
    clearTimeout(this._tapTimer);
    this._tapTimer = setTimeout(() => {
      if (this._lastTap === now) this._performAction("tap");
    }, 320);
  }

  _performAction(actionType) {
    if (!this.hass || !this.config) return;
    handleAction(this, this.hass, this.config, actionType);
  }

  render() {
    const entityId = this.config?.entity;
    const isOn = this._isOn();

    if (!entityId) {
      return html`
        <ha-card>
          <div class="empty">Выбери сущность в визуальном редакторе</div>
        </ha-card>
      `;
    }

    return html`
      <ha-card>
        <div class="header">
          <div class="icon-button ${isOn ? "on" : ""}">
            <img src="${this.base}/images/power.png" />
          </div>
          <div class="text-wrap">
            <div class="title">${this._title()}</div>
            <div class="subtitle">${this.config?.subtitle || this._stateLabel()}</div>
          </div>
        </div>

        <div class="switch-wrap">
          <div class="switch-slot ${!isOn ? "active" : ""}"
               @click=${(e) => this._onSlotClick(e, false)}>
            <div class="switch-dot"></div>
          </div>
          <div class="switch-slot ${isOn ? "active" : ""}"
               @click=${(e) => this._onSlotClick(e, true)}>
            <img src="${this.base}/images/power.png" />
          </div>
        </div>
      </ha-card>
    `;
  }

  static async getConfigElement() {
    await customElements.whenDefined("emelya-turn-on-off-card-editor");
    return document.createElement("emelya-turn-on-off-card-editor");
  }

  static getStubConfig() {
    return {
      title: "",
      subtitle: "",
      entity: "",
      base_path: "/local",
      tap_action: { action: "more-info" },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" }
    };
  }
}

if (!customElements.get("emelya-turn-on-off-card")) {
  customElements.define("emelya-turn-on-off-card", EmelyaTurnOnOffCard);
}

/* EDITOR */
class EmelyaTurnOnOffCardEditor extends LitElement {
  static properties = {
    hass: {},
    _config: {},
    _tab: { state: true }
  };

  static styles = css`
    :host { display: block; box-sizing: border-box; }
    .tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .tab {
      padding: 8px 12px; border-radius: 10px;
      border: 1px solid var(--divider-color);
      background: var(--secondary-background-color);
      cursor: pointer; user-select: none;
    }
    .tab.active { background: var(--primary-color); color: white; border-color: var(--primary-color); }
  `;

  constructor() {
    super();
    this._tab = 0;
  }

  setConfig(config) {
    this._config = {
      title: "",
      subtitle: "",
      entity: "",
      tap_action: { action: "more-info" },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
      base_path: "/local",
      ...clone(config || {})
    };
  }

  render() {
    if (!this._config) return html``;
    return html`
      <div class="tabs">
        ${["Объект", "Внешний вид", "Взаимодействия"].map((label, i) => html`
          <div class="tab ${this._tab === i ? "active" : ""}"
               @click=${() => { this._tab = i; }}>
            ${label}
          </div>
        `)}
      </div>
      ${this._tab === 0 ? this._objectTab() : ""}
      ${this._tab === 1 ? this._appearanceTab() : ""}
      ${this._tab === 2 ? this._actionsTab() : ""}
    `;
  }

  _objectTab() {
    return this._form([
      {
        name: "entity", label: "Сущность", required: true,
        selector: { entity: { domain: TURN_ON_OFF_DOMAINS.concat(Object.keys(DOMAIN_SERVICE_MAP)) } }
      },
      { name: "base_path", label: "Путь к ресурсам", selector: { text: {} } }
    ]);
  }

  _appearanceTab() {
    return this._form([
      { name: "title",    label: "Заголовок",    selector: { text: {} } },
      { name: "subtitle", label: "Подзаголовок", selector: { text: {} } }
    ]);
  }

  _actionsTab() {
    return this._form([
      {
        name: "tap_action",
        label: this.hass?.localize?.("ui.panel.lovelace.editor.card.generic.tap_action") || "При нажатии",
        selector: { ui_action: {} }
      },
      {
        name: "hold_action",
        label: this.hass?.localize?.("ui.panel.lovelace.editor.card.generic.hold_action") || "При удержании",
        selector: { ui_action: {} }
      },
      {
        name: "double_tap_action",
        label: this.hass?.localize?.("ui.panel.lovelace.editor.card.generic.double_tap_action") || "При двойном нажатии",
        selector: { ui_action: {} }
      }
    ]);
  }

  _form(schema) {
    return html`
      <ha-form .hass=${this.hass} .data=${this._config} .schema=${schema}
               @value-changed=${this._valueChanged}></ha-form>
    `;
  }

  _valueChanged = (e) => {
    this._config = clone({ ...this._config, ...e.detail.value });
    this._fire();
  };

  _fire() {
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: this._config },
      bubbles: true, composed: true
    }));
  }
}

if (!customElements.get("emelya-turn-on-off-card-editor")) {
  customElements.define("emelya-turn-on-off-card-editor", EmelyaTurnOnOffCardEditor);
}

/* REGISTER */
window.customCards = window.customCards || [];
window.customCards.push({
  type: "custom:emelya-turn-on-off-card",
  name: "Emelya Turn On/Off Card",
  description: "Универсальное вкл/выкл для любых toggleable сущностей",
  preview: true
});