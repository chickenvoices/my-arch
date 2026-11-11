import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Adw from 'gi://Adw';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { _ } from './i18n.js';
const MODIFIER_KEYVALS = new Set([Gdk.KEY_Shift_L, Gdk.KEY_Shift_R, Gdk.KEY_Control_L, Gdk.KEY_Control_R, Gdk.KEY_Alt_L, Gdk.KEY_Alt_R, Gdk.KEY_Super_L, Gdk.KEY_Super_R, Gdk.KEY_Meta_L, Gdk.KEY_Meta_R, Gdk.KEY_ISO_Level3_Shift, Gdk.KEY_ISO_Level5_Shift, Gdk.KEY_Caps_Lock, Gdk.KEY_Num_Lock]);
function modifierBitFor(keyval) {
  switch (keyval) {
    case Gdk.KEY_Shift_L:
    case Gdk.KEY_Shift_R:
      return Gdk.ModifierType.SHIFT_MASK;
    case Gdk.KEY_Control_L:
    case Gdk.KEY_Control_R:
      return Gdk.ModifierType.CONTROL_MASK;
    case Gdk.KEY_Alt_L:
    case Gdk.KEY_Alt_R:
      return Gdk.ModifierType.ALT_MASK;
    case Gdk.KEY_Super_L:
    case Gdk.KEY_Super_R:
      return Gdk.ModifierType.SUPER_MASK;
    case Gdk.KEY_Meta_L:
    case Gdk.KEY_Meta_R:
      return Gdk.ModifierType.META_MASK;
    default:
      return 0;
  }
}
function captureShortcut(parentWindow, onCaptured) {
  const dialog = new Adw.Window({
    transient_for: parentWindow,
    modal: true,
    default_width: 420,
    default_height: 240,
    title: _('Record Shortcut')
  });
  const toolbarView = new Adw.ToolbarView();
  toolbarView.add_top_bar(new Adw.HeaderBar({
    show_title: true
  }));
  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
    spacing: 12,
    margin_top: 24,
    margin_bottom: 24,
    margin_start: 24,
    margin_end: 24,
    valign: Gtk.Align.CENTER
  });
  const promptLabel = new Gtk.Label({
    label: _('Hold a modifier (Super, Ctrl, Alt…) and press a key…'),
    wrap: true
  });
  box.append(promptLabel);
  const layoutWarning = new Gtk.Label({
    label: _('Switch to a Latin (e.g. English) keyboard layout before recording, or the shortcut may not work once you switch layouts back.'),
    wrap: true,
    justify: Gtk.Justification.CENTER,
    css_classes: ['dim-label']
  });
  box.append(layoutWarning);
  const cancelButton = new Gtk.Button({
    label: _('Cancel'),
    halign: Gtk.Align.CENTER
  });
  cancelButton.connect('clicked', () => dialog.close());
  box.append(cancelButton);
  toolbarView.set_content(box);
  dialog.set_content(toolbarView);
  let heldMods = 0;
  const keyController = new Gtk.EventControllerKey();
  dialog.add_controller(keyController);
  keyController.connect('key-pressed', (_controller, keyval, keycode, state) => {
    if (keyval === Gdk.KEY_Escape) {
      dialog.close();
      return Gdk.EVENT_STOP;
    }
    const bit = modifierBitFor(keyval);
    if (bit) {
      heldMods |= bit;
      return Gdk.EVENT_STOP;
    }
    if (MODIFIER_KEYVALS.has(keyval)) {
      return Gdk.EVENT_STOP;
    }
    const reportedMods = state & Gtk.accelerator_get_default_mod_mask();
    const mask = heldMods | reportedMods;
    if (mask === 0) {
      promptLabel.label = _('This shortcut needs at least one modifier key — try again holding Super, Ctrl, or Alt.');
      return Gdk.EVENT_STOP;
    }
    const accel = Gtk.accelerator_name(keyval, mask);
    if (!accel || !Gtk.accelerator_valid(keyval, mask)) {
      promptLabel.label = _('That combination can\'t be used — try another.');
      return Gdk.EVENT_STOP;
    }
    try {
      onCaptured(accel);
    } catch (e) {
      logError(e, 'DisplayLayouts: shortcut capture callback failed');
    }
    dialog.close();
    return Gdk.EVENT_STOP;
  });
  keyController.connect('key-released', (_controller, keyval) => {
    const bit = modifierBitFor(keyval);
    if (bit) heldMods &= ~bit;
  });
  dialog.present();
}
function accelToLabel(accel) {
  const [ok, keyval, mods] = Gtk.accelerator_parse(accel);
  if (!ok) return accel;
  return Gtk.accelerator_get_label(keyval, mods).replace(/\+/g, ' + ');
}
export default class DisplayLayoutsPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings('org.gnome.shell.extensions.true-display-profiles');
    const page = new Adw.PreferencesPage();
    window.add(page);
    const generalGroup = new Adw.PreferencesGroup({
      title: _('General Settings')
    });
    page.add(generalGroup);
    const indicatorRow = new Adw.SwitchRow({
      title: _('Show Top Bar Icon'),
      subtitle: _('Toggle the visibility of the display profiles menu indicator')
    });
    generalGroup.add(indicatorRow);
    settings.bind('show-indicator', indicatorRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    const notificationRow = new Adw.SwitchRow({
      title: _('Show Notifications'),
      subtitle: _('Show system notifications for profile and display events')
    });
    generalGroup.add(notificationRow);
    settings.bind('show-notifications', notificationRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    const switcherGroup = new Adw.PreferencesGroup({
      title: _('Profile Switcher'),
      description: _('Hold this shortcut to see a picker of your saved profiles, and release it to switch to the highlighted one — like Alt+Tab.')
    });
    page.add(switcherGroup);
    const savedAccel = settings.get_strv('switcher-shortcut')[0];
    const shortcutRow = new Adw.ActionRow({
      title: _('Keyboard Shortcut'),
      subtitle: savedAccel ? accelToLabel(savedAccel) : _('Not set'),
      use_markup: false
    });
    shortcutRow.add_prefix(new Gtk.Image({
      icon_name: 'input-keyboard-symbolic'
    }));
    const recordButton = new Gtk.Button({
      label: _('Record…'),
      valign: Gtk.Align.CENTER
    });
    recordButton.connect('clicked', () => {
      captureShortcut(window, accel => {
        settings.set_strv('switcher-shortcut', [accel]);
        shortcutRow.set_subtitle(accelToLabel(accel));
      });
    });
    shortcutRow.add_suffix(recordButton);
    const clearButton = new Gtk.Button({
      icon_name: 'edit-clear-symbolic',
      valign: Gtk.Align.CENTER,
      tooltip_text: _('Clear shortcut')
    });
    clearButton.connect('clicked', () => {
      settings.set_strv('switcher-shortcut', []);
      shortcutRow.set_subtitle(_('Not set'));
    });
    shortcutRow.add_suffix(clearButton);
    switcherGroup.add(shortcutRow);
  }
}
