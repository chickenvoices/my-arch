import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Shell from 'gi://Shell';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
const FADE_MS = 150;
const MODIFIER_KEYVALS = {
  Shift: [Clutter.KEY_Shift_L, Clutter.KEY_Shift_R],
  Control: [Clutter.KEY_Control_L, Clutter.KEY_Control_R],
  Alt: [Clutter.KEY_Alt_L, Clutter.KEY_Alt_R],
  Super: [Clutter.KEY_Super_L, Clutter.KEY_Super_R],
  Meta: [Clutter.KEY_Meta_L, Clutter.KEY_Meta_R],
  Hyper: [Clutter.KEY_Hyper_L, Clutter.KEY_Hyper_R]
};
function isReleaseOfOwnModifier(keyval, modifierNames) {
  return modifierNames.some(name => (MODIFIER_KEYVALS[name] || []).includes(keyval));
}
function resolveKeyval(keyName) {
  if (!keyName) return null;
  const keyval = Clutter[`KEY_${keyName}`];
  return typeof keyval === 'number' ? keyval : null;
}
export const ProfileSwitcherPopup = GObject.registerClass({
  GTypeName: 'TrueDisplayProfilesSwitcherPopup'
}, class ProfileSwitcherPopup extends St.Widget {
  _init(profiles, initialIndex, modifierNames, triggerKeyName, onSelect) {
    super._init({
      layout_manager: new Clutter.BinLayout(),
      reactive: true,
      visible: false,
      opacity: 0
    });
    this._profiles = profiles;
    this._modifierNames = modifierNames;
    this._triggerKeyval = resolveKeyval(triggerKeyName);
    this._onSelect = onSelect;
    this._selectedIndex = Math.max(0, Math.min(initialIndex, profiles.length - 1));
    this._finished = false;
    this._haveModal = false;
    this._buildUI();
    Main.uiGroup.add_child(this);
    this._reposition();
    const allocId = this.connect('notify::allocation', () => {
      this._reposition();
      this.disconnect(allocId);
    });
    this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', () => this._reposition());
    this.connect('destroy', () => this._onDestroy());
  }
  _buildUI() {
    this._card = new St.BoxLayout({
      orientation: Clutter.Orientation.VERTICAL,
      style_class: 'true-display-profiles-switcher',
      style: 'background-color: rgba(20,20,20,0.92); border-radius: 14px; ' + 'padding: 18px 10px; spacing: 4px; min-width: 220px;'
    });
    this.add_child(this._card);
    this._rows = this._profiles.map(name => new St.Label({
      text: name
    }));
    this._rows.forEach(row => this._card.add_child(row));
    this._updateHighlight();
  }
  _updateHighlight() {
    const plain = 'padding: 8px 20px; border-radius: 8px; font-size: 1.1em; color: #ddd;';
    const active = 'padding: 8px 20px; border-radius: 8px; font-size: 1.1em; ' + 'background-color: rgba(255,255,255,0.16); color: #fff; font-weight: bold;';
    this._rows.forEach((row, index) => {
      row.style = index === this._selectedIndex ? active : plain;
    });
  }
  _reposition() {
    const monitor = Main.layoutManager.primaryMonitor;
    if (!monitor) return;
    const [,, naturalWidth, naturalHeight] = this.get_preferred_size();
    this.set_position(Math.floor(monitor.x + (monitor.width - naturalWidth) / 2), Math.floor(monitor.y + (monitor.height - naturalHeight) / 2));
  }
  _next() {
    this._selectedIndex = (this._selectedIndex + 1) % this._rows.length;
    this._updateHighlight();
  }
  _previous() {
    this._selectedIndex = (this._selectedIndex - 1 + this._rows.length) % this._rows.length;
    this._updateHighlight();
  }
  open() {
    const grab = Main.pushModal(this, {
      actionMode: Shell.ActionMode.NONE
    });
    if (!grab) {
      this.destroy();
      return false;
    }
    this._haveModal = true;
    this._grab = grab;
    this.visible = true;
    this.ease({
      opacity: 255,
      duration: FADE_MS,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD
    });
    return true;
  }
  _finish(commit) {
    if (this._finished) return;
    this._finished = true;
    if (this._haveModal) {
      Main.popModal(this._grab);
      this._haveModal = false;
    }
    const chosen = commit ? this._profiles[this._selectedIndex] : null;
    this.ease({
      opacity: 0,
      duration: FADE_MS,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      onComplete: () => {
        if (chosen) this._onSelect(chosen);
        this.destroy();
      }
    });
  }
  _onDestroy() {
    if (this._monitorsChangedId) {
      Main.layoutManager.disconnect(this._monitorsChangedId);
      this._monitorsChangedId = null;
    }
    if (this._haveModal) {
      Main.popModal(this._grab);
      this._haveModal = false;
    }
  }
  vfunc_key_press_event(event) {
    const keyval = event.get_key_symbol();
    if (keyval === Clutter.KEY_Escape) {
      this._finish(false);
      return Clutter.EVENT_STOP;
    }
    if (keyval === Clutter.KEY_Return || keyval === Clutter.KEY_KP_Enter) {
      this._finish(true);
      return Clutter.EVENT_STOP;
    }
    if (keyval === this._triggerKeyval || keyval === Clutter.KEY_Tab || keyval === Clutter.KEY_Down || keyval === Clutter.KEY_Right) {
      this._next();
      return Clutter.EVENT_STOP;
    }
    if (keyval === Clutter.KEY_ISO_Left_Tab || keyval === Clutter.KEY_Up || keyval === Clutter.KEY_Left) {
      this._previous();
      return Clutter.EVENT_STOP;
    }
    if (isReleaseOfOwnModifier(keyval, this._modifierNames)) {
      return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_STOP;
  }
  vfunc_key_release_event(event) {
    const keyval = event.get_key_symbol();
    if (isReleaseOfOwnModifier(keyval, this._modifierNames)) {
      this._finish(true);
      return Clutter.EVENT_STOP;
    }
    return Clutter.EVENT_STOP;
  }
});
