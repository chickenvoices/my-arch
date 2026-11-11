import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';
import { _ } from './i18n.js';
export const SaveLayoutDialog = GObject.registerClass({
  GTypeName: 'DisplayLayoutsSaveDialog'
}, class SaveLayoutDialog extends ModalDialog.ModalDialog {
  _init(monitors, suggestedName, callback, hdrActive = false) {
    super._init({
      styleClass: 'save-layout-dialog',
      destroyOnClose: true
    });
    this._callback = callback;
    const titleLabel = new St.Label({
      text: _('Save Display Profile'),
      style: 'font-weight: bold; font-size: 1.3em; margin-bottom: 15px;'
    });
    this.contentLayout.add_child(titleLabel);
    const nameLabel = new St.Label({
      text: _('Profile Name'),
      style: 'font-weight: bold; margin-bottom: 5px;'
    });
    this.contentLayout.add_child(nameLabel);
    this._nameEntry = new St.Entry({
      can_focus: true,
      text: suggestedName || '',
      hint_text: _('Give it a name'),
      style: 'margin-bottom: 5px; width: 335px;'
    });
    this._nameEntry.clutter_text.connect('activate', () => this._saveAction());
    this._nameEntry.clutter_text.connect('text-changed', () => this._clearNameError());
    this.contentLayout.add_child(this._nameEntry);
    this._nameErrorLabel = new St.Label({
      text: _('Error: Profile name is required.'),
      style: 'margin-bottom: 15px; font-size: 0.85em; color: #e0645c;',
      visible: false
    });
    this.contentLayout.add_child(this._nameErrorLabel);
    if (hdrActive) {
      const hdrHint = new St.Label({
        text: `\u2713 ${_('HDR is active (state will be saved)')}`,
        style: 'margin-bottom: 15px; font-size: 0.85em; color: #8fd694;'
      });
      this.contentLayout.add_child(hdrHint);
    }
    this.setInitialKeyFocus(this._nameEntry);
    const aliasesHeader = new St.Label({
      text: _('Assign Display Aliases (e.g. left, tv):'),
      style: 'font-weight: bold; margin-bottom: 10px;'
    });
    this.contentLayout.add_child(aliasesHeader);
    this._monitorEntries = [];
    monitors.forEach(m => {
      const row = new St.BoxLayout({
        style: 'margin-bottom: 10px; align-items: center;'
      });
      const labelText = `${m.manufacturer} ${m.modelName} (${m.connector})`;
      const label = new St.Label({
        text: labelText,
        style: 'width: 200px; font-size: 0.9em; margin-right: 15px;'
      });
      row.add_child(label);
      const entry = new St.Entry({
        can_focus: true,
        hint_text: m.defaultAlias,
        text: m.connector,
        style: 'width: 120px;'
      });
      entry.clutter_text.connect('activate', () => this._saveAction());
      row.add_child(entry);
      this.contentLayout.add_child(row);
      this._monitorEntries.push({
        connector: m.connector,
        entry,
        defaultAlias: m.defaultAlias
      });
    });
    this.addButton({
      label: _('Cancel'),
      action: () => this.close(),
      key: Clutter.KEY_Escape
    });
    this.addButton({
      label: _('Save Profile'),
      action: () => this._saveAction(),
      key: Clutter.KEY_Return
    });
  }
  _showNameError() {
    this._nameErrorLabel.visible = true;
    this._nameEntry.style = 'margin-bottom: 5px; width: 335px; border: 1px solid #e0645c;';
  }
  _clearNameError() {
    if (!this._nameErrorLabel.visible) return;
    this._nameErrorLabel.visible = false;
    this._nameEntry.style = 'margin-bottom: 5px; width: 335px;';
  }
  _saveAction() {
    const name = this._nameEntry.get_text().trim();
    if (!name) {
      this._showNameError();
      this._nameEntry.grab_key_focus();
      return;
    }
    const aliasMap = {};
    this._monitorEntries.forEach(item => {
      const enteredAlias = item.entry.get_text().trim();
      aliasMap[item.connector] = enteredAlias || item.defaultAlias;
    });
    this._callback(name, aliasMap);
    this.close();
  }
});
export const DeleteLayoutDialog = GObject.registerClass({
  GTypeName: 'DisplayLayoutsDeleteDialog'
}, class DeleteLayoutDialog extends ModalDialog.ModalDialog {
  _init(profiles, callback) {
    super._init({
      styleClass: 'delete-layout-dialog',
      destroyOnClose: true
    });
    this._callback = callback;
    this._profiles = profiles || [];
    this._selected = this._profiles[0] || null;
    const titleLabel = new St.Label({
      text: _('Delete Display Profile'),
      style: 'font-weight: bold; font-size: 1.3em; margin-bottom: 15px;'
    });
    this.contentLayout.add_child(titleLabel);
    if (this._profiles.length === 0) {
      const emptyLabel = new St.Label({
        text: _('No profiles to delete.'),
        style: 'margin-bottom: 15px;'
      });
      this.contentLayout.add_child(emptyLabel);
      this.addButton({
        label: _('Cancel'),
        action: () => this.close(),
        key: Clutter.KEY_Escape
      });
      return;
    }
    const listHeader = new St.Label({
      text: _('Select a profile to delete:'),
      style: 'font-weight: bold; margin-bottom: 8px;'
    });
    this.contentLayout.add_child(listHeader);
    const listBox = new St.BoxLayout({
      orientation: Clutter.Orientation.VERTICAL,
      style: 'spacing: 4px; margin-bottom: 10px;'
    });
    this._profileButtons = [];
    this._profiles.forEach(name => {
      const btn = new St.Button({
        label: name,
        style_class: 'button',
        can_focus: true,
        x_expand: true,
        style: 'padding: 6px 10px; text-align: left;'
      });
      btn.connect('clicked', () => {
        this._selected = name;
        this._profileButtons.forEach(b => {
          b.style = b.label === name ? 'padding: 6px 10px; text-align: left; font-weight: bold; border: 1px solid #e05c5c;' : 'padding: 6px 10px; text-align: left;';
        });
      });
      this._profileButtons.push(btn);
      listBox.add_child(btn);
    });
    if (this._selected) {
      this._profileButtons[0].style = 'padding: 6px 10px; text-align: left; font-weight: bold; border: 1px solid #e05c5c;';
    }
    this.contentLayout.add_child(listBox);
    const warnLabel = new St.Label({
      text: _('This will permanently remove the selected profile.'),
      style: 'font-size: 0.85em; color: #e0a0a0; margin-bottom: 10px;'
    });
    this.contentLayout.add_child(warnLabel);
    this.addButton({
      label: _('Cancel'),
      action: () => this.close(),
      key: Clutter.KEY_Escape
    });
    this.addButton({
      label: _('Delete'),
      action: () => this._deleteAction()
    });
  }
  _deleteAction() {
    if (!this._selected) {
      this.close();
      return;
    }
    this._callback(this._selected);
    this.close();
  }
});
