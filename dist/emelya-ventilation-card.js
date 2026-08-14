import { LitElement, html, css } from "/local/lib/lit.js";
import { handleAction, hasAction } from "/local/lib/custom-card-helpers.js";

const LEVEL_MAP = {1:33, 2:66, 3:100};

class EmelyaVentilationCard extends LitElement {

  static properties = {
    hass: {}, 
    config: {},
    level: { type:Number },
    power: { type:Boolean },
    _selectedSlot: { state: true }
  };

  constructor(){
    super();
    this.level = 0;
    this.power = false;
    this._selectedSlot = 0;
    this._expectedPower = null;
    this._expectedLevel = null;
    this._holdTimer = null;
    this._lastTap = 0;
    this._preloadedBg = null;
    this._expectedLevelTimer = null;
    this._expectedPowerTimer = null;
  }

  set hass(hass){
    this._hass = hass;
    const entity = this.config?.entity;
    const stateObj = hass.states?.[entity];
    if(!stateObj) return;

    const powerEntity = this.config?.power_entity || entity;
    const powerStateObj = hass.states?.[powerEntity] || stateObj;
    const offStates = ["off", "unavailable", "unknown"];
    const newPower = !offStates.includes(powerStateObj.state);

    if(this._expectedPower !== null){
      if(newPower === this._expectedPower){
        this._expectedPower = null;
        this.power = newPower;
      }
    } else {
      this.power = newPower;
    }

    const speedEntity = this.config?.speed_entity || entity;
    const speedStateObj = hass.states?.[speedEntity] || stateObj;
    const speedDomain = speedEntity.split(".")[0];

    let newLevel = 0;

    if (speedDomain === "select" || speedDomain === "input_select") {
      // select: low/medium/high → 1/2/3
      const speedMap = this.config?.speed_map || { low: 1, medium: 2, high: 3 };
      newLevel = speedMap[speedStateObj.state] ?? 0;
    } else {
      // fan: пробуем preset_mode сначала, потом percentage
      const preset = speedStateObj.attributes?.preset_mode;
      if (preset) {
        const speedMap = this.config?.speed_map || { low: 1, medium: 2, high: 3 };
        newLevel = speedMap[preset] ?? 0;
      } else {
        const percentage = speedStateObj.attributes?.percentage ?? 0;
        if (percentage === 0) newLevel = 0;
        else if (percentage <= 33) newLevel = 1;
        else if (percentage <= 67) newLevel = 2;
        else newLevel = 3;
      }
    }

    if(this._expectedLevel !== null){
      if(newLevel === this._expectedLevel){
        this._expectedLevel = null;
        this.level = newLevel;
        this._selectedSlot = newLevel;  // синхронизируем индикатор, теперь изменения в модальном окне будут отображаться в ui
      }
    } else {
      this.level = newLevel;
      this._selectedSlot = newLevel;  // синхронизируем индикатор
    }
  }

  get hass(){ return this._hass; }

  setConfig(config){
    this.config = {
      tap_action: { action: "more-info" },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
      ...config,
    };
    this.base = this.config.base_path || "/local";
    this._preloadBackground();
  }

  _preloadBackground() {
    const bg = this.config.background_image;
    if (bg && this._preloadedBg !== bg) {
      this._preloadedBg = bg;
      const img = new Image();
      img.src = bg;
    }
  }

  static styles = css`
    :host { display:block; max-width:450px; min-width:320px; font-family:Roboto; color:white; }

    .frame {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 16px;
      height: 264px;
      border-radius: 24px;
      position: relative;
      background: #1C1B1F;
    }
    .frame::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 24px;
      padding: 1px;
      background: linear-gradient(291.96deg, #4D4A54 0%, #1C1B1F 50%, #4D4A54 100%) border-box;
      -webkit-mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor !important;
      mask-composite: exclude !important;
      pointer-events: none; 
      z-index:3;
    }
    .frame::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 24px;
      background-image:
        linear-gradient(0deg, rgba(28, 27, 31, 0.16) 83.75%, #1C1B1F 100%),
        var(--frame-bg, none),
        linear-gradient(0deg, #1C1B1F, #1C1B1F);
      background-size: auto, 135.625% 164.394%, auto;
      background-position: center, 52.763px -213.194px, center;
      background-repeat: no-repeat, no-repeat, no-repeat;
      background-blend-mode: normal, luminosity, normal;
      opacity: 0;
      transition: opacity 0.35s ease;
      pointer-events: none;
      z-index: 0;
    }
    .frame.bg-loaded::after {
      opacity: 1;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index:1;
    }
    .title { font-weight:600; font-size:16px; }
    .state { font-size:15px; color: rgba(255,255,255,0.6); }

    .controls {
      position: relative;
      display: flex;
      height: 56px;
      padding-right: 4px;
      padding-left: 4px;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      align-self: stretch;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.10);
      backdrop-filter: blur(12px);
      z-index: 2 !important;
    }
    .controls::before {
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

    /* заливка-индикатор */
    .btn.active {
      background: rgba(255, 255, 255, 0.18);
    }

    .btn {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 48px;
      border-radius: 12px;
      cursor: pointer;
      position: relative;
      z-index: 1;
    }
    .btn img {
      width:18px;
      height:18px;
    }

    .btn.power {
      border: none;
      flex-grow: 1;
      flex-shrink: 0;
      padding: 16px;
      box-sizing: border-box;
      width: 64px;
      max-width: 64px;
    }

    .speed-icon.small  { width:16px; height:16px; }
    .speed-icon.medium { width:20px; height:20px; }
    .speed-icon.big    { width:24px; height:24px; }
  `;

  get _activeSlot() {
    return this._selectedSlot ?? 0;
  }

  firstUpdated() {
    const frame = this.shadowRoot?.querySelector(".frame");
    if (!frame) return;

    frame.addEventListener("pointerdown", this._onPointerDown.bind(this));
    frame.addEventListener("pointerup",   this._onPointerUp.bind(this));
    frame.addEventListener("click",       this._onClick.bind(this));

  }

  updated() {
    // Фон
    const frame = this.renderRoot?.querySelector(".frame[data-bg]");
    if (frame) {
      const bgUrl = frame.dataset.bg;
      if (bgUrl && frame._bgInitialized !== bgUrl) {
        frame._bgInitialized = bgUrl;
        frame.style.setProperty("--frame-bg", `url("${bgUrl}")`);
        const img = new Image();
        img.onload = () => frame.classList.add("bg-loaded");
        img.src = bgUrl;
      }
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._holdTimer) { clearTimeout(this._holdTimer); this._holdTimer = null; }
    if (this._expectedLevelTimer) { clearTimeout(this._expectedLevelTimer); this._expectedLevelTimer = null; }
    if (this._expectedPowerTimer) { clearTimeout(this._expectedPowerTimer); this._expectedPowerTimer = null; }
  }

  _onPointerDown(e) {
    if (e.target.closest('.btn')) return;
    if (hasAction(this.config, 'hold_action')) {
      this._holdTimer = setTimeout(() => this._performAction('hold'), 500);
    }
  }

  _onPointerUp() {
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }
  }

  _onClick(e) {
    if (e.target.closest('.btn')) return;

    const now = Date.now();

    if (this._lastTap && now - this._lastTap < 300) {
      if (hasAction(this.config, 'double_tap_action')) {
        e.stopImmediatePropagation();
        this._performAction('double_tap');
        this._lastTap = 0;
        return;
      }
    }

    this._lastTap = now;
    setTimeout(() => {
      if (this._lastTap === now) this._performAction('tap');
    }, 320);
  }

  _performAction(actionType) {
    if (!this.hass || !this.config) return;
    handleAction(this, this.hass, this.config, actionType);
  }

  _togglePower(e){
    e.stopPropagation();
    this._selectedSlot = 0;

    const entity = this.config?.entity;
    const newPower = !this.power;

    this.power = newPower;
    this._expectedPower = newPower;
    if (this._expectedPowerTimer) clearTimeout(this._expectedPowerTimer);
    this._expectedPowerTimer = setTimeout(() => {
      this._expectedPower = null;
    }, 3000);

    if(!newPower){
      this.level = 0;
      this._expectedLevel = null;
    }

    if(!this.hass || !entity) return;
    const powerEntity = this.config?.power_entity || entity;
    const powerDomain = powerEntity.split(".")[0];
    const readOnly = ["sensor", "binary_sensor"];
    if (readOnly.includes(powerDomain)) return;
    this.hass.callService(powerDomain, newPower ? "turn_on" : "turn_off", { entity_id: powerEntity });
  }

  _stopPropagation(e){ e.stopPropagation(); }

  _setLevel(level){
    this._selectedSlot = level;
    this.level = level;

    if(!this.power){
      this._expectedLevel = null;
      return;
    }

    this._expectedLevel = level;
    if (this._expectedLevelTimer) clearTimeout(this._expectedLevelTimer);
    this._expectedLevelTimer = setTimeout(() => {
      this._expectedLevel = null;
    }, 3000);

    const entity = this.config?.entity;
    if(!this.hass || !entity) return;

    const speedEntity = this.config?.speed_entity || entity;
    const speedDomain = speedEntity.split(".")[0];

    if (speedDomain === "select" || speedDomain === "input_select") {
      // Ищем ключ по значению в speed_map
      const speedMap = this.config?.speed_map || { low: 1, medium: 2, high: 3 };
      const option = Object.keys(speedMap).find(k => speedMap[k] === level);
      if (option) this.hass.callService(speedDomain, "select_option", {
        entity_id: speedEntity,
        option
      });
    } else {
      if (speedDomain !== "fan") {
        console.warn("emelya-ventilation: speed_entity domain not supported:", speedDomain);
        return;
      }
      const speedStateObj = this.hass?.states?.[speedEntity];
      if (speedStateObj?.attributes?.preset_modes?.length) {
        const speedMap = this.config?.speed_map || { low: 1, medium: 2, high: 3 };
        const preset = Object.keys(speedMap).find(k => speedMap[k] === level);
        if (preset) this.hass.callService("fan", "set_preset_mode", {
          entity_id: speedEntity,
          preset_mode: preset
        });
      } else {
        this.hass.callService("fan", "set_percentage", {
          entity_id: speedEntity,
          percentage: LEVEL_MAP[level]
        });
      }
    }
  }

  render(){
    const bg = this.config.background_image || "";

    return html`
      <div
        class="frame"
        tabindex="0"
        data-bg="${bg}"
      >
        <div class="header">
          <div class="title">${this.config?.title || "Вентиляция"}</div>
          <div class="state">${this.power ? "Включено" : "Выключено"}</div>
        </div>

        <div class="controls">
          <div class="btn power ${this._activeSlot === 0 ? 'active' : ''}" id="btn-0"
              @pointerdown=${this._stopPropagation}
              @click=${this._togglePower}>
            <img class="icon" src="${this.base}/images/power.png">
          </div>

          <div class="btn ${this._activeSlot === 1 ? 'active' : ''}" id="btn-1"
              @pointerdown=${this._stopPropagation}
              @click=${()=>this._setLevel(1)}>
            <img class="speed-icon small" src="${this.base}/images/toys.svg">
          </div>

          <div class="btn ${this._activeSlot === 2 ? 'active' : ''}" id="btn-2"
              @pointerdown=${this._stopPropagation}
              @click=${()=>this._setLevel(2)}>
            <img class="speed-icon medium" src="${this.base}/images/toys.svg">
          </div>

          <div class="btn ${this._activeSlot === 3 ? 'active' : ''}" id="btn-3"
              @pointerdown=${this._stopPropagation}
              @click=${()=>this._setLevel(3)}>
            <img class="speed-icon big" src="${this.base}/images/toys.svg">
          </div>
        </div>
      </div>
    `;
  }
}

/* EDITOR */

class EmelyaVentilationCardEditor extends LitElement {
  static properties = {
    hass: {},
    _config: { state: true },
    _tab: { state: true },
    _uploadState: { state: true },
    _uploadError: { state: true },
    _dragOver: { state: true }
  };

  static styles = css`
    :host { display: block; box-sizing: border-box; }

    .tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
    .tab {
      padding: 8px 12px; border-radius: 10px;
      border: 1px solid var(--divider-color);
      background: var(--secondary-background-color);
      cursor: pointer; font-size: 14px;
    }
    .tab.active { background: var(--primary-color); color: white; border-color: var(--primary-color); }

    .img-field { display: flex; flex-direction: column; gap: 12px; }
    .img-label { font-size: 13px; font-weight: 600; color: var(--primary-text-color); }

    .img-preview {
      width: 100%; height: 160px; border-radius: 20px; overflow: hidden;
      background: #1C1B1F; border: 1px solid rgba(101,101,101,0.3);
      display: flex; align-items: center; justify-content: center;
    }
    .img-preview img { width: 120px; height: 120px; object-fit: contain; display: block; }
    .img-preview-empty {
      font-size: 12px; color: var(--secondary-text-color);
      text-align: center; padding: 16px; line-height: 1.5;
    }

    .drop-zone {
      width: 100%; box-sizing: border-box; min-height: 96px;
      border: 2px dashed var(--divider-color); border-radius: 16px;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 8px; padding: 16px; cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
      background: var(--secondary-background-color); text-align: center;
    }
    .drop-zone.dragover {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    }
    .drop-zone.loading { opacity: 0.6; pointer-events: none; }

    .drop-icon { font-size: 28px; line-height: 1; }
    .drop-text { font-size: 13px; color: var(--primary-text-color); line-height: 1.4; }
    .drop-sub  { font-size: 11px; color: var(--secondary-text-color); }

    .drop-btn {
      margin-top: 4px; padding: 6px 14px; border-radius: 8px;
      border: 1px solid var(--primary-color); background: transparent;
      color: var(--primary-color); font-size: 13px; cursor: pointer;
      transition: background 0.15s;
    }
    .drop-btn:hover { background: color-mix(in srgb, var(--primary-color) 15%, transparent); }

    .status-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
    .status-row.success { color: var(--success-color, #43a047); }
    .status-row.error   { color: var(--error-color, #db4437); }

    .current-path {
      display: flex; align-items: center; gap: 8px; font-size: 12px;
      color: var(--secondary-text-color); background: var(--secondary-background-color);
      border: 1px solid var(--divider-color); border-radius: 10px;
      padding: 8px 10px; box-sizing: border-box;
    }
    .current-path span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .path-clear {
      width: 24px; height: 24px; border: none; border-radius: 6px;
      background: transparent; color: var(--secondary-text-color);
      cursor: pointer; font-size: 14px; display: flex;
      align-items: center; justify-content: center; flex-shrink: 0; transition: color 0.15s;
    }
    .path-clear:hover { color: var(--error-color, #db4437); }

    input[type="file"] { display: none; }
  `;

  constructor() {
    super();
    this._tab = 0;
    this._uploadState = "idle"; // idle | loading | success | error
    this._uploadError = "";
    this._dragOver = false;
  }

  setConfig(config) { this._config = { ...config }; }

  render() {
    if (!this._config) return html``;
    return html`
      <div class="tabs">
        ${["Объект", "Внешний вид", "Взаимодействия"].map((t, i) => html`
          <div class="tab ${this._tab === i ? "active" : ""}" @click=${() => this._tab = i}>${t}</div>
        `)}
      </div>
      ${this._tab === 0 ? this._objectTab() : ""}
      ${this._tab === 1 ? this._appearanceTab() : ""}
      ${this._tab === 2 ? this._actionsTab() : ""}
    `;
  }

  _objectTab() {
    return this._form([
      { name: "title",        label: "Название",          selector: { text: {} } },
      { name: "entity",       required: true,  label: "Основная сущность", selector: { entity: { domain: ["fan", "switch", "input_boolean"] } } },
      { name: "power_entity", required: false, label: "Сущность питания",  selector: { entity: { domain: ["switch", "fan", "input_boolean"] } } },
      { name: "speed_entity", required: false, label: "Сущность скорости", selector: { entity: { domain: ["select", "input_select", "fan"] } } },
      { name: "base_path",    selector: { text: {} } }
    ]);
  }

  _actionsTab() {
    return this._form([
      { name: "tap_action",        label: "При нажатии",         selector: { ui_action: {} } },
      { name: "hold_action",       label: "При удержании",       selector: { ui_action: {} } },
      { name: "double_tap_action", label: "При двойном нажатии", selector: { ui_action: {} } }
    ]);
  }

  _appearanceTab() {
    const src = this._config?.background_image;
    return html`
      <div class="img-field">
        <div class="img-label">Фоновое изображение</div>

        <div class="img-preview">
          ${src ? html`
            <img src=${src} alt="preview" @error=${() => { this._uploadState = "error"; this._uploadError = "Файл не найден"; }} />
          ` : html`
            <div class="img-preview-empty">Изображение не задано.<br>Будет использована картинка по умолчанию.</div>
          `}
        </div>

        <div
          class="drop-zone ${this._dragOver ? "dragover" : ""} ${this._uploadState === "loading" ? "loading" : ""}"
          @dragover=${this._onDragOver}
          @dragleave=${this._onDragLeave}
          @drop=${this._onDrop}
          @click=${this._onZoneClick}
        >
          <div class="drop-icon">${this._uploadState === "loading" ? "⏳" : "🖼️"}</div>
          <div class="drop-text">${this._uploadState === "loading" ? "Загрузка..." : "Перетащите изображение сюда"}</div>
          <div class="drop-sub">PNG, JPG, WebP, AVIF, SVG</div>
          ${this._uploadState !== "loading" ? html`
            <button class="drop-btn" @click=${this._onZoneClick}>Выбрать файл</button>
          ` : ""}
        </div>

        <input type="file" id="fileInput" accept="image/*" @change=${this._onFileInput} />

        ${this._uploadState === "success" ? html`<div class="status-row success">✓ Изображение загружено</div>` : ""}
        ${this._uploadState === "error"   ? html`<div class="status-row error">⚠ ${this._uploadError}</div>` : ""}

        ${src ? html`
          <div class="current-path">
            <span title=${src}>${src}</span>
            <button class="path-clear" @click=${this._clearImage}>✕</button>
          </div>
        ` : ""}
      </div>
    `;
  }

  /* Drag & Drop */

  _onDragOver(e) { e.preventDefault(); this._dragOver = true; }
  _onDragLeave()  { this._dragOver = false; }

  _onDrop(e) {
    e.preventDefault();
    this._dragOver = false;
    const file = e.dataTransfer?.files?.[0];
    if (file) this._uploadFile(file);
  }

  _onZoneClick(e) {
    e.stopPropagation();
    this.shadowRoot?.getElementById("fileInput")?.click();
  }

  _onFileInput(e) {
    const file = e.target?.files?.[0];
    if (file) this._uploadFile(file);
    e.target.value = "";
  }
  _normalizeFileForUpload(file) {
    const unsupportedByHA = ["image/avif", "image/jxl", "image/heic", "image/heif"];
    if (unsupportedByHA.includes(file.type)) {
      return new File([file], file.name, { type: "image/png" });
    }
    return file;
  }

  /* Загрузка файла */

  async _uploadFile(file) {
    if (!file.type.startsWith("image/")) {
      this._uploadState = "error";
      this._uploadError = "Файл не является изображением";
      return;
    }

    this._uploadState = "loading";
    this._uploadError = "";
    const uploadFile = this._normalizeFileForUpload(file);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);

      const resp = await this.hass.fetchWithAuth(
        `/api/config/core/store_image`,
        { method: "POST", body: formData }
      );

      if (resp.ok) {
        const json = await resp.json();
        this._setImage(json.url || `/local/${file.name}`);
        this._uploadState = "success";
        return;
      }
    } catch (_) {}

    // Fallback
    try {
      const token = this.hass?.auth?.data?.access_token;
      const formData = new FormData();
      formData.append("file", uploadFile);

      const resp = await fetch(`${window.location.origin}/api/image/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (resp.ok) {
        const json = await resp.json();
        const imgPath = `/api/image/serve/${json.id}/original`;
        this._setImage(imgPath);
        this._uploadState = "success";
        return;
      }

      throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      this._uploadState = "error";
      this._uploadError = `Не удалось загрузить файл (${err.message}).`;
    }
  }

  _setImage(path) {
    this._config = { ...this._config, background_image: path };
    this._fire();
  }

  _clearImage() {
    this._uploadState = "idle";
    this._uploadError = "";
    const config = { ...this._config };
    delete config.background_image;
    this._config = config;
    this._fire();
  }

  _form(schema) {
    return html`
      <ha-form .hass=${this.hass} .data=${this._config} .schema=${schema} @value-changed=${this._valueChanged}></ha-form>
    `;
  }

  _valueChanged = (e) => { this._config = e.detail.value; this._fire(); };

  _fire() {
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: this._config },
      bubbles: true,
      composed: true
    }));
  }
}

EmelyaVentilationCard.getConfigElement = function () { return document.createElement("emelya-ventilation-card-editor"); };
EmelyaVentilationCard.getStubConfig = function () { return { entity: "", base_path: "/local" }; };

customElements.define("emelya-ventilation-card-editor", EmelyaVentilationCardEditor);
customElements.define("emelya-ventilation-card", EmelyaVentilationCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "custom:emelya-ventilation-card",
  name: "Emelya Ventilation Card",
  description: "Управление вентиляцией",
  preview: true
});