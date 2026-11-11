import Gio from 'gi://Gio';
const DASH_TO_DOCK_SCHEMA = 'org.gnome.shell.extensions.dash-to-dock';
export class DashSettings {
  constructor() {
    this._settings = null;
    this._changedIds = [];
    this._listeners = [];
    const schemaSource = Gio.SettingsSchemaSource.get_default();
    const schema = schemaSource?.lookup(DASH_TO_DOCK_SCHEMA, true);
    if (schema) {
      this._settings = new Gio.Settings({
        settings_schema: schema
      });
      for (const key of ['dock-position', 'dash-max-icon-size', 'icon-size-fixed']) {
        if (schema.has_key(key)) {
          const id = this._settings.connect(`changed::${key}`, () => this._emit());
          this._changedIds.push(id);
        }
      }
    }
  }
  connect(signal, callback) {
    if (signal !== 'changed') return;
    this._listeners.push(callback);
  }
  _emit() {
    for (const cb of this._listeners) cb();
  }
  getOrientation() {
    if (!this._settings) return 'horizontal';
    const position = this._settings.get_string('dock-position');
    return position === 'LEFT' || position === 'RIGHT' ? 'vertical' : 'horizontal';
  }
  getIconSize() {
    if (!this._settings) return 48;
    const size = this._settings.get_int('dash-max-icon-size');
    return size > 0 ? size : 48;
  }
  destroy() {
    if (this._settings) {
      for (const id of this._changedIds) this._settings.disconnect(id);
    }
    this._changedIds = [];
    this._settings = null;
    this._listeners = [];
  }
}
