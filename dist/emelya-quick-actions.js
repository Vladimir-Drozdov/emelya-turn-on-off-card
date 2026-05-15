import { LitElement, html, css } from "https://unpkg.com/lit@2.0.0/index.js?module";

// ─────────────────────────────────────────────
//  RUNTIME CARD
// ─────────────────────────────────────────────
class EmelyaQuickActions extends LitElement {

  static properties = {
    hass: {},
    config: {},
    activeActions: { type: Object, state: true },
    _modalAction: { state: true },
    _modalIndex: { state: true },
  };

  constructor() {
    super();
    this.activeActions = new Set();
    this.isDragging = false;
    this.startX = 0;
    this.scrollLeft = 0;
    this.dragStarted = false;
    this._expectedStates = {};
    this._lastUserChange = 0;
    this._modalAction = null;
    this._modalIndex = null;
  }

  setConfig(config) {
    this.config = config;
  }

  static getConfigElement() {
    return document.createElement("emelya-quick-actions-editor");
  }

  static getStubConfig() {
    return {
      actions: [
        { label: "Home", icon: "", entity: "", service: { domain: "input_select" } },
        { label: "Away", icon: "", entity: "", service: { domain: "input_select" } },
        { divider: true },
        { label: "Light", icon: "", entity: "light.example", service: { domain: "light" } },
      ]
    };
  }

  set hass(hass) {
    this._hass = hass;

    const actions = this.config?.actions || [];
    const newActive = new Set();

    actions.forEach((action, index) => {
      if (action.divider || !action.entity) return;
      const stateObj = hass.states?.[action.entity];
      if (!stateObj) return;
      if (["on", "home", "running"].includes(stateObj.state)) {
        newActive.add(index);
      }
    });

    // Для каждой группы между divider-ами — если несколько горят,
    // оставить только последнюю активную и выключить остальные
    const groups = [];
    let currentGroup = [];
    actions.forEach((action, index) => {
      if (action.divider) {
        if (currentGroup.length) groups.push(currentGroup);
        currentGroup = [];
      } else {
        currentGroup.push(index);
      }
    });
    if (currentGroup.length) groups.push(currentGroup);

    groups.forEach(group => {
      const activeInGroup = group.filter(i => newActive.has(i));
      if (activeInGroup.length > 1) {
        // оставляем последний активный, остальные выключаем
        const toTurnOff = activeInGroup.slice(0, -1);
        toTurnOff.forEach(i => {
          newActive.delete(i);
          const entity = actions[i].entity;
          if (entity) {
            this._hass.callService("input_boolean", "turn_off", { entity_id: entity });
          }
        });
      }
    });

    this.activeActions = newActive;
    this.requestUpdate();
  }

  get hass() { return this._hass; }

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .quick-actions {
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      gap: 8px;
      width: 100%;
      height: 100%;
      align-items: start;
      overflow-x: auto;
      overflow-y: hidden;
      scroll-behavior: auto;
      cursor: grab;
      user-select: none;
      -webkit-user-select: none;
      -ms-overflow-style: none;
      scrollbar-width: none;
      padding-top: 10px;
      padding-bottom: 16px;
    }
    .quick-actions::-webkit-scrollbar { display: none; }
    .quick-actions.dragging {
      cursor: grabbing;
      scroll-behavior: auto;
    }
    .action-btn {
      position: relative;
      background: #1C1B1F;
      border-radius: 24px;
      border: none;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0;
      transition: all 0.2s ease;
      height: 168px;
      flex-basis: auto;
      flex-shrink: 1;
      flex-grow: 1;
      min-width: 106px;
      max-width: 160px;
      pointer-events: auto;
      background-image:
        linear-gradient(#1C1B1F, #1C1B1F),
        linear-gradient(291.96deg, #4D4A54 0%, #1C1B1F 50%, #4D4A54 100%);
      border: 1px solid transparent;
      background-origin: border-box, border-box;
      background-clip: padding-box, border-box;
    }
    .quick-actions.dragging .action-btn {
      pointer-events: none;
      transition: none;
    }
    .action-btn.active { background: #343239; }
    .icon-bg {
      position: absolute;
      height: 64px;
      left: 8px;
      right: 7.57px;
      top: 8px;
      border: 1px solid transparent;
      border-radius: 20px;
      background-image:
        linear-gradient(#1C1B1F, #1C1B1F),
        linear-gradient(135deg, rgba(101,101,101,0) 0%, #656565 50%, rgba(101,101,101,0) 100%);
      background-origin: border-box, border-box;
      background-clip: padding-box, border-box;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; }
    .icon img { width: 24px; height: 24px; filter: brightness(0) invert(1); object-fit: contain; }
    .icon ha-icon { color: white; width: 32px; height: 32px; --mdc-icon-size: 32px; }
    .label {
      position: absolute;
      left: 4px;
      right: 3.57px;
      bottom: 24px;
      font-family: 'Roboto', sans-serif;
      font-weight: 400;
      font-size: 12px;
      line-height: 16px;
      text-align: center;
      color: #FFFFFF;
      white-space: pre-line;
      margin: 0;
    }
    .label.single-line { bottom: 40px; }
    .divider {
      width: 3px;
      min-width: 3px;
      max-width: 3px;
      height: 120px;
      background: #343239;
      border-radius: 8px;
      align-self: center;
      pointer-events: none;
    }

    /* ── Modal ── */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.55);
      z-index: 9999;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      animation: fadeIn .15s ease;
    }
    @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
    .modal-sheet {
      background: #1C1B1F;
      border-radius: 28px 28px 0 0;
      width: 100%;
      max-width: 480px;
      padding: 24px 20px 36px;
      box-sizing: border-box;
      animation: slideUp .2s ease;
      border: 1px solid #343239;
    }
    @keyframes slideUp { from { transform: translateY(60px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
    .modal-handle {
      width: 40px;
      height: 4px;
      background: #4D4A54;
      border-radius: 2px;
      margin: 0 auto 20px;
    }
    .modal-title {
      font-family: 'Roboto', sans-serif;
      font-size: 18px;
      font-weight: 600;
      color: #fff;
      margin: 0 0 4px;
    }
    .modal-entity {
      font-size: 12px;
      color: rgba(255,255,255,0.45);
      margin: 0 0 20px;
      font-family: monospace;
    }
    .modal-state-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: #28272C;
      border-radius: 16px;
      margin-bottom: 8px;
    }
    .modal-state-label {
      font-size: 13px;
      color: rgba(255,255,255,0.6);
    }
    .modal-state-value {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
    }
    .modal-attrs {
      margin-top: 16px;
    }
    .modal-attrs-title {
      font-size: 12px;
      color: rgba(255,255,255,0.35);
      text-transform: uppercase;
      letter-spacing: .08em;
      margin: 0 0 8px;
    }
    .modal-attr-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 16px;
      background: #28272C;
      border-radius: 10px;
      margin-bottom: 4px;
    }
    .modal-attr-key { font-size: 12px; color: rgba(255,255,255,0.5); }
    .modal-attr-val { font-size: 12px; color: #fff; max-width: 55%; text-align: right; word-break: break-all; }
    .modal-actions-row {
      display: flex;
      gap: 8px;
      margin-top: 20px;
    }
    .modal-btn {
      flex: 1;
      height: 48px;
      border-radius: 16px;
      border: 1px solid #4D4A54;
      background: #28272C;
      color: #fff;
      font-size: 14px;
      font-family: 'Roboto', sans-serif;
      cursor: pointer;
      transition: background .15s;
    }
    .modal-btn:hover { background: #343239; }
    .modal-btn.primary {
      background: #6750A4;
      border-color: #6750A4;
    }
    .modal-btn.primary:hover { background: #7965AF; }
    .modal-close-btn {
      position: absolute;
      top: 16px;
      right: 16px;
      background: #343239;
      border: none;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      color: #fff;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  `;

  _onMouseDown(e) {
    this.isDragging = false;
    this.dragStarted = false;
    this.startX = e.pageX - this.offsetLeft;
    this.scrollLeft = this.scrollLeft;

    const container = this.renderRoot.querySelector('.quick-actions');
    this.startScrollLeft = container.scrollLeft;

    this._dragStartTime = Date.now();
    this._dragStartX = e.pageX;

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
  }

  _onMouseMove = (e) => {
    if (!this._dragStartTime) return;
    const container = this.renderRoot.querySelector('.quick-actions');
    if (!container) return;

    const moveX = Math.abs(e.pageX - this._dragStartX);
    const moveTime = Date.now() - this._dragStartTime;

    if (!this.dragStarted && (moveX > 5 || moveTime > 200)) {
      this.dragStarted = true;
      container.classList.add('dragging');
    }

    if (this.dragStarted) {
      e.preventDefault();
      const x = e.pageX - container.offsetLeft;
      const walk = (x - this.startX) * 1.5;
      container.scrollLeft = this.startScrollLeft - walk;
    }
  }

  _onMouseUp = (e) => {
    const container = this.renderRoot.querySelector('.quick-actions');
    if (container) container.classList.remove('dragging');

    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);

    if (this.dragStarted) {
      e.preventDefault();
      e.stopPropagation();
    }

    this._dragStartTime = null;
    this.dragStarted = false;
  }

  // ── Click / hold / double-tap wiring ──

  _handleClick(action, index, e) {
    if (this.dragStarted) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // double-tap detection
    const now = Date.now();
    if (this._lastTapIndex === index && now - this._lastTapTime < 300) {
      this._lastTapIndex = null;
      this._lastTapTime = 0;
      clearTimeout(this._tapTimer);
      this._executeAction(action, index, action.double_tap_action || { action: "none" });
      return;
    }

    this._lastTapIndex = index;
    this._lastTapTime = now;

    // defer tap so double-tap can cancel it
    clearTimeout(this._tapTimer);
    this._tapTimer = setTimeout(() => {
      this._lastTapIndex = null;
      this._executeAction(action, index, action.tap_action || { action: "more-info" });
    }, 310);
  }

  _handleMouseDown(action, index) {
    this._holdTimer = setTimeout(() => {
      this._holdTimer = null;
      this._executeAction(action, index, action.hold_action || { action: "more-info" });
    }, 500);
  }

  _handleMouseUp() {
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }
  }

  _executeAction(action, index, actionConfig) {
    const type = actionConfig?.action || "more-info";

    if (type === "more-info") {
      // Fire HA native more-info dialog
      const event = new CustomEvent("hass-more-info", {
        detail: { entityId: action.entity },
        bubbles: true,
        composed: true,
      });
      this.dispatchEvent(event);
      return;
    }

    if (type === "toggle") {
      this._doToggle(action, index);
      return;
    }

    if (type === "navigate") {
      const path = actionConfig.navigation_path || actionConfig.url_path || "/";
      window.history.pushState(null, "", path);
      window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
      return;
    }

    if (type === "url") {
      const url = actionConfig.url_path || actionConfig.url || "";
      if (url) window.open(url, actionConfig.new_tab !== false ? "_blank" : "_self");
      return;
    }

    if (type === "call-service" || type === "perform-action") {
      const serviceStr = actionConfig.service || actionConfig.perform_action || "";
      if (!serviceStr) return;
      const [domain, service] = serviceStr.split(".", 2);
      const data = { ...(actionConfig.service_data || actionConfig.data || {}) };
      if (action.entity && !data.entity_id) data.entity_id = action.entity;
      this._hass?.callService(domain, service, data);
      return;
    }

    if (type === "assist") {
      const event = new CustomEvent("show-dialog", {
        detail: { dialogTag: "ha-voice-command-dialog", dialogImport: () => {}, dialogParams: {} },
        bubbles: true,
        composed: true,
      });
      this.dispatchEvent(event);
      return;
    }

    // "none" — do nothing
  }

  _doToggle(action, index) {
    if (!action?.entity) return;
    const [domain] = action.entity.split(".");
    const isActive = this.activeActions.has(index);
    const service = isActive ? "turn_off" : "turn_on";

    // если включаем — сначала выключаем все остальные в группе
    if (!isActive) {
      const actions = this.config?.actions || [];

      // найти границы группы для этого индекса
      let groupStart = 0;
      let groupEnd = actions.length;
      for (let i = index - 1; i >= 0; i--) {
        if (actions[i].divider) { groupStart = i + 1; break; }
      }
      for (let i = index + 1; i < actions.length; i++) {
        if (actions[i].divider) { groupEnd = i; break; }
      }

      // выключить все активные в группе кроме текущей
      for (let i = groupStart; i < groupEnd; i++) {
        if (i !== index && this.activeActions.has(i)) {
          const otherEntity = actions[i].entity;
          if (otherEntity) {
            const [otherDomain] = otherEntity.split(".");
            this._hass.callService(otherDomain, "turn_off", { entity_id: otherEntity });
          }
        }
      }
    }

    this._hass.callService(domain, service, { entity_id: action.entity });
  }

  _closeModal() {
    this._modalAction = null;
    this._modalIndex = null;
  }

  _renderModal() {
    if (!this._modalAction) return '';
    const action = this._modalAction;
    const index = this._modalIndex;
    const stateObj = this._hass?.states?.[action.entity];
    if (!stateObj) return '';

    const attrs = stateObj.attributes || {};
    const attrKeys = Object.keys(attrs).slice(0, 8); // show up to 8 attrs
    const isActive = this.activeActions.has(index);

    return html`
      <div class="modal-overlay" @click=${(e) => { if (e.target === e.currentTarget) this._closeModal(); }}>
        <div class="modal-sheet">
          <div class="modal-handle"></div>
          <div class="modal-title">${action.label || action.entity}</div>
          <div class="modal-entity">${action.entity}</div>

          <div class="modal-state-row">
            <span class="modal-state-label">Состояние</span>
            <span class="modal-state-value">${stateObj.state}</span>
          </div>

          ${attrs.friendly_name ? html`
            <div class="modal-state-row">
              <span class="modal-state-label">Имя</span>
              <span class="modal-state-value">${attrs.friendly_name}</span>
            </div>
          ` : ''}

          ${attrs.unit_of_measurement ? html`
            <div class="modal-state-row">
              <span class="modal-state-label">Единица</span>
              <span class="modal-state-value">${attrs.unit_of_measurement}</span>
            </div>
          ` : ''}

          <div class="modal-attrs">
            <div class="modal-attrs-title">Атрибуты</div>
            ${attrKeys.filter(k => k !== 'friendly_name' && k !== 'unit_of_measurement').map(k => html`
              <div class="modal-attr-row">
                <span class="modal-attr-key">${k}</span>
                <span class="modal-attr-val">${JSON.stringify(attrs[k])}</span>
              </div>
            `)}
          </div>

          <div class="modal-actions-row">
            <button class="modal-btn" @click=${this._closeModal}>Закрыть</button>
            <button class="modal-btn primary" @click=${() => { this._closeModal(); this._toggleAction(action, index); }}>
              ${isActive ? 'Выключить' : 'Включить'}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    const actions = this.config?.actions || [];

    return html`
      <div
        class="quick-actions"
        @mousedown=${this._onMouseDown}
      >
        ${actions.map((action, index) => {
          if (action.divider) return html`<div class="divider"></div>`;

          const isActive = this.activeActions.has(index);
          const labelClass = action.lines === 1 ? 'label single-line' : 'label';

          return html`
            <button
              class="action-btn ${isActive ? 'active' : ''}"
              @click=${(e) => this._handleClick(action, index, e)}
              @mousedown=${() => this._handleMouseDown(action, index)}
              @mouseup=${() => this._handleMouseUp()}
              @mouseleave=${() => this._handleMouseUp()}
              @touchstart=${() => this._handleMouseDown(action, index)}
              @touchend=${() => this._handleMouseUp()}
            >
              <div class="icon-bg">
                <div class="icon">
                  ${action.icon ? html`<img src="${action.icon}"/>` : ''}
                </div>
              </div>
              <span class="label">${action.label}</span>
            </button>
          `;
        })}
      </div>

      ${this._renderModal()}
    `;
  }
}

customElements.define("emelya-quick-actions", EmelyaQuickActions);


// ─────────────────────────────────────────────
//  VISUAL EDITOR
// ─────────────────────────────────────────────
const ICON_OPTIONS = [
  { label: "Спальня",        value: "/local/images/icons/bedroom.svg" },
  { label: "Гостиная",       value: "/local/images/icons/living_room.svg" },
  { label: "Душ, ванная",    value: "/local/images/icons/bathroom.svg" },
  { label: "Детская",        value: "/local/images/icons/kids_room.svg" }, //
  { label: "Гардероб",       value: "/local/images/icons/wardrobe.svg" }, //
  { label: "Кухня",          value: "/local/images/icons/kitchen.svg" },
  { label: "Котельная",      value: "/local/images/icons/boiler_room.svg" }, //
  { label: "Кабинет",        value: "/local/images/icons/office.svg" },
  { label: "Постирочная",    value: "/local/images/icons/laundry.svg" },
  { label: "Туалет",         value: "/local/images/icons/toilet.svg" },
  { label: "Холл",           value: "/local/images/icons/hall.svg" },
  { label: "Кладовая",       value: "/local/images/icons/storage.svg" }, //
  { label: "Коридор",        value: "/local/images/icons/corridor.svg" },
  { label: "Двор",           value: "/local/images/icons/yard.svg" },
  { label: "Баня, сауна",    value: "/local/images/icons/sauna.svg" }, //
  { label: "Столовая",       value: "/local/images/icons/dining_room.svg" },
  { label: "Кинотеатр",      value: "/local/images/icons/home_cinema.svg" },
  { label: "Бассейн",        value: "/local/images/icons/pool.svg" },
  { label: "Гараж",          value: "/local/images/icons/garage.svg" }, //
  { label: "Комната няни",   value: "/local/images/icons/nanny_room.svg" },
  { label: "Прихожая",       value: "/local/images/icons/entrance.svg" }, //
  { label: "Полумесяц",       value: "/local/images/icons/cresent_moon.svg" }, //
  { label: "Часы",       value: "/local/images/icons/clock.svg" }, //
  { label: "Холодный термостат",       value: "/local/images/icons/cool_thermostat.svg" }, //
  { label: "Горячий термостат",       value: "/local/images/icons/heat_thermostat.svg" }, //
  { label: "Дверь закрытая",       value: "/local/images/icons/door_front.svg" }, //
  { label: "Дверь открытая",       value: "/local/images/icons/door_open.svg" }, //
  { label: "Лампочка включенная",       value: "/local/images/icons/lightbulb.svg" }, //
  { label: "Лампочка выключенная",       value: "/local/images/icons/lightbulb_turnoff.svg" }, //
  { label: "Капля",       value: "/local/images/icons/no_drop.svg" }, //
  { label: "вкл/выкл",       value: "/local/images/icons/power.svg" }, //
];
class EmelyaQuickActionsEditor extends LitElement {

  static properties = {
    hass: {},
    config: {},
    _editingIndex: { state: true },
    _actionStates: { state: true },
  };

  static styles = css`
    :host { display: block; box-sizing: border-box; }

    .root {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    /* ── List ── */
    .list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--divider-color);
      border-radius: 14px;
      background: var(--secondary-background-color);
    }
    .row-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .row-label {
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .row-sub {
      font-size: 12px;
      color: var(--secondary-text-color);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .divider-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      border: 1px dashed var(--divider-color);
      border-radius: 10px;
      color: var(--secondary-text-color);
      font-size: 13px;
    }

    .btn-group {
      display: flex;
      gap: 2px;
      flex-shrink: 0;
    }
    .btn-group ha-icon-button {
      --mdc-icon-button-size: 34px;
      color: var(--secondary-text-color);
    }
    .btn-group ha-icon-button:hover {
      color: var(--primary-text-color);
    }

    /* ── Toolbar ── */
    .toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 4px;
    }
    .toolbar ha-button {
      --mdc-theme-primary: var(--primary-color);
    }

    /* ── Editor panel ── */
    .editor-header {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .editor-title {
      font-size: 15px;
      font-weight: 600;
      flex: 1;
    }
    .field-group {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-top: 8px;
    }
    ha-textfield,
    ha-select {
      display: block;
      width: 100%;
    }
    .section-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--secondary-text-color);
      text-transform: uppercase;
      letter-spacing: .06em;
      margin: 8px 0 2px;
    }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      color: var(--primary-text-color);
    }
  `;

  constructor() {
    super();
    this._editingIndex = null;
    this._actionStates = {}; // { "tap_action": "navigate", "hold_action": "none", ... }
  }




  setConfig(config) {
    this.config = {
      actions: [],
      ...config,
    };
  }
  _form(schema, data) {
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${data}
        .schema=${schema}
        @value-changed=${(e) => this._handleFormChange(e)}
      ></ha-form>
    `;
  }
  _handleFormChange(e) {
    const newData = e.detail.value;
    const actions = [...(this.config.actions || [])];

    actions[this._editingIndex] = {
      ...actions[this._editingIndex],
      ...newData
    };

    this.config = { ...this.config, actions };
    this._fire();
  }

  render() {
    if (!this.config) return html``;
    const actions = this.config.actions || [];

    if (this._editingIndex !== null) {
      return this._renderEditor(actions[this._editingIndex], this._editingIndex);
    }

    return html`
      <div class="root">
        <div class="list">
          ${actions.map((action, i) => this._renderRow(action, i, actions.length))}
        </div>
        <div class="toolbar">
          <ha-button raised @click=${this._addAction}>
            <ha-icon icon="mdi:plus" slot="icon"></ha-icon>
            Добавить кнопку
          </ha-button>
          <ha-button @click=${this._addDivider}>
            <ha-icon icon="mdi:minus" slot="icon"></ha-icon>
            Добавить разделитель
          </ha-button>
        </div>
      </div>
    `;
  }

  _renderRow(action, i, total) {
    if (action.divider) {
      return html`
        <div class="divider-row">
          <ha-icon icon="mdi:minus" style="width:16px;height:16px;"></ha-icon>
          <span style="flex:1">Разделитель</span>
          <div class="btn-group">
            <ha-icon-button @click=${() => this._moveUp(i)} ?disabled=${i === 0} title="Вверх">
              <ha-icon icon="mdi:arrow-up"></ha-icon>
            </ha-icon-button>
            <ha-icon-button @click=${() => this._moveDown(i)} ?disabled=${i === total - 1} title="Вниз">
              <ha-icon icon="mdi:arrow-down"></ha-icon>
            </ha-icon-button>
            <ha-icon-button @click=${() => this._remove(i)} title="Удалить">
              <ha-icon icon="mdi:delete"></ha-icon>
            </ha-icon-button>
          </div>
        </div>
      `;
    }

    return html`
      <div class="row">
        <div class="row-info">
          <div class="row-label">${action.label || '(без названия)'}</div>
          <div class="row-sub">${action.entity || 'entity не задан'}</div>
        </div>
        <div class="btn-group">
          <ha-icon-button @click=${() => this._moveUp(i)} ?disabled=${i === 0} title="Вверх">
            <ha-icon icon="mdi:arrow-up"></ha-icon>
          </ha-icon-button>
          <ha-icon-button @click=${() => this._moveDown(i)} ?disabled=${i === total - 1} title="Вниз">
            <ha-icon icon="mdi:arrow-down"></ha-icon>
          </ha-icon-button>
          <ha-icon-button @click=${() => this._edit(i)} title="Редактировать">
            <ha-icon icon="mdi:pencil"></ha-icon>
          </ha-icon-button>
          <ha-icon-button @click=${() => this._remove(i)} title="Удалить">
            <ha-icon icon="mdi:delete"></ha-icon>
          </ha-icon-button>
        </div>
      </div>
    `;
  }

  // ── Action options shared across all three interaction types ──
  get _actionOptions() {
    return [
      { value: "more-info",    label: "Действие по умолчанию (more-info)" },
      { value: "toggle",       label: "Переключить" },
      { value: "navigate",     label: "Перейти на страницу" },
      { value: "url",          label: "Открыть URL" },
      { value: "call-service", label: "Вызов сервиса" },
      { value: "assist",       label: "Голосовой помощник" },
      { value: "none",         label: "Ничего не делать" },
    ];
  }

  _renderActionSelect(index, actionKey, label) {
    const action = (this.config.actions || [])[index];
    const actionCfg = action?.[actionKey] || {};

    // Use _actionStates as source of truth so Lit re-renders on change
    const stateKey = `${index}_${actionKey}`;
    const savedInState = this._actionStates[stateKey];
    const defaultVal = actionKey === "tap_action" ? "more-info" : "none";
    const currentType = savedInState ?? actionCfg.action ?? defaultVal;

    const showNavigate = currentType === "navigate";
    const showUrl      = currentType === "url";
    const showService  = currentType === "call-service";

    return html`
      <div class="section-label">${label}</div>

      <ha-select
        label="Действие"
        .value=${currentType}
        naturalMenuWidth
        @selected=${(e) => {
          e.stopPropagation();
          const val = e.target.value;
          if (!val) return;
          // update local state first for immediate re-render
          this._actionStates = { ...this._actionStates, [stateKey]: val };
          this._updateActionType(index, actionKey, val);
        }}
        @closed=${(e) => e.stopPropagation()}
      >
        ${this._actionOptions.map(opt => html`
          <mwc-list-item value="${opt.value}">${opt.label}</mwc-list-item>
        `)}
      </ha-select>

      ${showNavigate ? html`
        <ha-textfield
          label="Путь навигации"
          helper="Например: /lovelace/0 или /lovelace/my-view"
          .value=${actionCfg.navigation_path || ''}
          @input=${(e) => this._updateActionField(index, actionKey, 'navigation_path', e.target.value)}
        ></ha-textfield>
      ` : ''}

      ${showUrl ? html`
        <ha-textfield
          label="URL"
          helper="Абсолютный: https://example.com  или относительный: /local/page"
          .value=${actionCfg.url_path || ''}
          @input=${(e) => this._updateActionField(index, actionKey, 'url_path', e.target.value)}
        ></ha-textfield>
        <div class="checkbox-row">
          <ha-checkbox
            .checked=${actionCfg.new_tab !== false}
            @change=${(e) => this._updateActionField(index, actionKey, 'new_tab', e.target.checked)}
          ></ha-checkbox>
          <span>Открыть в новой вкладке</span>
        </div>
      ` : ''}

      ${showService ? html`
        <ha-textfield
          label="Сервис"
          helper="Например: light.turn_on"
          .value=${actionCfg.service || ''}
          @input=${(e) => this._updateActionField(index, actionKey, 'service', e.target.value)}
        ></ha-textfield>
      ` : ''}
    `;
  }

  _renderEditor(action, index) {
    if (!action || action.divider) return html``;

    const schema = [
      {
        name: "label",
        selector: { text: {} }
      },
      {
        name: "entity",
        selector: { entity: { domain: ["input_boolean"] } }
      }
    ];

    return html`
      <div class="root">
        <div class="editor-header">
          <ha-icon-button @click=${this._closeEditor}>
            <ha-icon icon="mdi:arrow-left"></ha-icon>
          </ha-icon-button>
          <div class="editor-title">
            Редактирование: ${action.label || '(без названия)'}
          </div>
        </div>

        ${this._form(schema, action)}

        <div class="section-label">Иконка</div>
        <div style="display:flex; align-items:center; gap:10px;">
          ${action.icon ? html`
            <div style="
              width:40px; height:40px; border-radius:12px;
              background:#28272C; border:1px solid #4D4A54;
              display:flex; align-items:center; justify-content:center; flex-shrink:0;
            ">
              <img src=${action.icon} style="width:20px;height:20px;filter:brightness(0) invert(1);object-fit:contain;" />
            </div>
          ` : ''}
          <select
            style="flex:1; border:1px solid var(--divider-color); border-radius:10px; padding:10px 12px; background:var(--secondary-background-color); color:var(--primary-text-color); font:inherit; box-sizing:border-box; width:100%;"
            @change=${(e) => this._updateField(index, 'icon', e.target.value)}
          >
            <option value="">— Выберите иконку —</option>
            ${ICON_OPTIONS.map(opt => html`
              <option value=${opt.value} ?selected=${action.icon === opt.value}>
                ${opt.label}
              </option>
            `)}
          </select>
        </div>

        <div class="section-label" style="margin-top:16px">── Взаимодействие ──</div>

        ${this._renderActionSelect(index, 'tap_action', '👆 Tap')}
        ${this._renderActionSelect(index, 'hold_action', '✋ Hold')}
        ${this._renderActionSelect(index, 'double_tap_action', '👆👆 Double')}
      </div>
    `;
  }

  // ── Helpers ──

  _edit(i) {
    this._actionStates = {};
    this._editingIndex = i;
  }
  _closeEditor = () => {
    this._actionStates = {};
    this._editingIndex = null;
  };

  _updateField(index, key, value) {
    const actions = [...(this.config.actions || [])];
    actions[index] = { ...actions[index], [key]: value };
    this.config = { ...this.config, actions };
    this._fire();
  }

  _updateActionType(index, actionKey, type) {
    const actions = [...(this.config.actions || [])];
    const existing = actions[index][actionKey] || {};
    actions[index] = { ...actions[index], [actionKey]: { ...existing, action: type } };
    this.config = { ...this.config, actions };
    this._fire();
  }

  _updateActionField(index, actionKey, field, value) {
    const actions = [...(this.config.actions || [])];
    const existing = actions[index][actionKey] || {};
    actions[index] = { ...actions[index], [actionKey]: { ...existing, [field]: value } };
    this.config = { ...this.config, actions };
    this._fire();
  }

  _addAction() {
    const actions = [...(this.config.actions || [])];
    actions.push({
      label: 'Новая кнопка',
      icon: '',
      entity: '',
      tap_action: { action: 'more-info' },
      hold_action: { action: 'none' },
      double_tap_action: { action: 'none' },
    });
    this.config = { ...this.config, actions };
    this._editingIndex = actions.length - 1;
    this._fire();
  }

  _addDivider() {
    const actions = [...(this.config.actions || [])];
    actions.push({ divider: true });
    this.config = { ...this.config, actions };
    this._fire();
  }

  _remove(i) {
    const actions = [...(this.config.actions || [])];
    actions.splice(i, 1);
    this.config = { ...this.config, actions };
    if (this._editingIndex === i) this._editingIndex = null;
    this._fire();
  }

  _moveUp(i) {
    if (i <= 0) return;
    const actions = [...this.config.actions];
    [actions[i - 1], actions[i]] = [actions[i], actions[i - 1]];
    this.config = { ...this.config, actions };
    this._fire();
  }

  _moveDown(i) {
    const actions = [...this.config.actions];
    if (i >= actions.length - 1) return;
    [actions[i], actions[i + 1]] = [actions[i + 1], actions[i]];
    this.config = { ...this.config, actions };
    this._fire();
  }

  _fire() {
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: this.config },
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define("emelya-quick-actions-editor", EmelyaQuickActionsEditor);

window.customCards = window.customCards || [];
const existing = window.customCards.findIndex(c => c.type === "custom:emelya-quick-actions");
if (existing === -1) {
  window.customCards.push({
    type: "custom:emelya-quick-actions",
    name: "Emelya Quick Actions",
    description: "Горизонтальные быстрые действия с визуальным редактором",
    preview: true,
  });
}