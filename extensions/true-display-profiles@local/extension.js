import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as LayoutEngine from './layoutEngine.js';
import { SaveLayoutDialog, DeleteLayoutDialog } from './dialogs.js';
import { ProfileSwitcherPopup } from './profileSwitcher.js';
import { _ } from './i18n.js';
const DBUS_XML = `
<node>
  <interface name="org.gnome.Shell.Extensions.DisplayLayouts">
    <method name="Apply"><arg type="s" name="name" direction="in"/></method>
    <method name="Toggle"><arg type="as" name="aliases" direction="in"/><arg type="as" name="toggles" direction="out"/></method>
    <method name="Save"><arg type="s" name="name" direction="in"/></method>
  </interface>
</node>`;
let _settings = null;
let _notificationSource = null;
function _getNotificationSource() {
  if (!_notificationSource) {
    _notificationSource = new MessageTray.Source({
      title: _('Display Profiles'),
      iconName: 'video-display-symbolic'
    });
    _notificationSource.connect('destroy', () => {
      _notificationSource = null;
    });
    Main.messageTray.add(_notificationSource);
  }
  return _notificationSource;
}
function _logError(error, context) {
  console.error(`[Display Layouts] ${context}: ${error.message || error}`);
}
function _notify(message, isError = false) {
  if (!isError && !(_settings && _settings.get_boolean('show-notifications'))) return;
  const source = _getNotificationSource();
  const notification = new MessageTray.Notification({
    source,
    title: _('Display Profiles'),
    body: message
  });
  source.addNotification(notification);
}
async function _callSafe(fn) {
  try {
    return await fn();
  } catch (e) {
    throw new Error(e.message);
  }
}
function _describeToggles(toggleResults) {
  return toggleResults.map(t => t.on ? _('%s turned on', t.alias) : _('%s turned off', t.alias)).join(', ');
}
class DisplayLayoutsDBusService {
  constructor() {
    this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(DBUS_XML, this);
    this._dbusImpl.export(Gio.DBus.session, '/org/gnome/Shell/Extensions/DisplayLayouts');
  }
  destroy() {
    if (this._dbusImpl) {
      this._dbusImpl.unexport();
      this._dbusImpl = null;
    }
  }
  async Apply(name) {
    return _callSafe(() => LayoutEngine.applyLayout(name));
  }
  async Toggle(aliases) {
    const results = await _callSafe(() => LayoutEngine.toggleLayouts(aliases));
    return results.map(r => `${r.alias}:${r.on ? 'on' : 'off'}`);
  }
  async Save(name) {
    return _callSafe(() => LayoutEngine.saveLayout(name, async (conn, v, p, x, y, def) => conn || def));
  }
}
const LayoutIndicator = GObject.registerClass({
  GTypeName: 'DisplayLayoutsIndicator'
}, class LayoutIndicator extends PanelMenu.Button {
  _init() {
    super._init(0.0, _('Display Profiles'));
    this._displayStateCache = null;
    this._destroyed = false;
    this._saveDialog = null;
    this._deleteDialog = null;
    this._rebuildEpoch = 0;
    this._icon = new St.Icon({
      icon_name: 'video-display-symbolic',
      style_class: 'system-status-icon'
    });
    this.add_child(this._icon);
    this.menu.connectObject('open-state-changed', async (menu, open) => {
      if (open) await this.updateCacheAndRebuild(true);
    }, this);
    this._initDisplayTracking();
  }
  async _initDisplayTracking() {
    await this.updateCacheAndRebuild(false);
  }
  _isStale(epoch) {
    return this._destroyed || epoch !== this._rebuildEpoch;
  }
  async updateCacheAndRebuild(fromCache = false) {
    this._rebuildEpoch = (this._rebuildEpoch || 0) + 1;
    const epoch = this._rebuildEpoch;
    try {
      const queryRequired = !fromCache || !this._displayStateCache;
      if (queryRequired) {
        const state = await LayoutEngine.getCurrentDisplayStateAsync();
        if (this._isStale(epoch)) return;
        this._displayStateCache = state;
      }
      await this._refreshAndRebuild(epoch);
    } catch (e) {
      _logError(e, 'Cache update failed');
    }
  }
  async _refreshAndRebuild(epoch) {
    if (this._isStale(epoch)) return;
    try {
      const activeProfile = (await LayoutEngine.readTextFileAsync(LayoutEngine.ACTIVE_PROFILE_FILE))?.trim() || '';
      if (this._isStale(epoch)) return;
      const profiles = await LayoutEngine.getProfilesAsync();
      if (this._isStale(epoch)) return;
      const [, phys] = this._displayStateCache;
      const matchingProfiles = await LayoutEngine.getProfilesForHardwareAsync(phys);
      if (this._isStale(epoch)) return;
      const activeJsonStr = activeProfile ? await LayoutEngine.readTextFileAsync(`${LayoutEngine.CONFIG_DIR}/${activeProfile}.json`) : null;
      if (this._isStale(epoch)) return;
      this._rebuildMenuFromData(activeProfile, profiles, matchingProfiles, activeJsonStr);
    } catch (e) {
      _logError(e, 'Rebuild background sequence failed');
    }
  }
  _addSectionHeader(text) {
    const item = new PopupMenu.PopupMenuItem(text, {
      reactive: false
    });
    item.label.style = 'font-weight: bold; color: #888;';
    this.menu.addMenuItem(item);
  }
  _rebuildMenuFromData(activeProfile, profiles, matchingProfiles, activeJsonStr) {
    if (this._destroyed) return;
    this.menu.removeAll();
    const matchingSet = new Set(matchingProfiles);
    this._addSectionHeader(_('Profiles'));
    if (profiles.length === 0) {
      const emptyItem = new PopupMenu.PopupMenuItem(_('No profiles to delete.'), {
        reactive: false
      });
      emptyItem.label.style = 'color: #888;';
      this.menu.addMenuItem(emptyItem);
    }
    profiles.forEach(profile => {
      const isMissingMonitor = !matchingSet.has(profile);
      const item = isMissingMonitor ? new PopupMenu.PopupImageMenuItem(profile, 'action-unavailable-symbolic') : new PopupMenu.PopupMenuItem(profile);
      if (profile === activeProfile) item.setOrnament(PopupMenu.Ornament.CHECK);
      item.connect('activate', async () => {
        try {
          await LayoutEngine.applyLayout(profile);
          if (this._destroyed) return;
          _notify(_('Applied profile: %s', profile));
        } catch (err) {
          _notify(_('Error: %s', err.message), true);
        }
      });
      this.menu.addMenuItem(item);
    });
    this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    if (activeProfile && this._displayStateCache && activeJsonStr) {
      try {
        const profileData = JSON.parse(activeJsonStr);
        const labels = profileData.labels || {};
        const aliases = Object.keys(labels);
        if (aliases.length > 0) {
          this._addSectionHeader(_('Toggle Displays'));
          const [, phys, logicalMonitors] = this._displayStateCache;
          const connToHw = LayoutEngine.buildConnToHwMap(phys);
          const activeHwSigs = new Set(logicalMonitors.flatMap(lm => lm[5].map(p => connToHw[p[0]])));
          aliases.forEach(alias => {
            const item = new PopupMenu.PopupMenuItem(alias);
            if (activeHwSigs.has(labels[alias])) item.setOrnament(PopupMenu.Ornament.CHECK);
            item.connect('activate', async () => {
              try {
                const toggleResults = await LayoutEngine.toggleLayouts([alias]);
                if (this._destroyed) return;
                _notify(_describeToggles(toggleResults));
              } catch (err) {
                _notify(_('Error: %s', err.message), true);
              }
            });
            this.menu.addMenuItem(item);
          });
          this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        }
      } catch (e) {
        _logError(e, 'Failed to build toggles');
      }
    }
    const saveItem = new PopupMenu.PopupMenuItem(_('Save Current Profile...'));
    saveItem.connect('activate', () => this.triggerSaveDialog());
    this.menu.addMenuItem(saveItem);
    const deleteItem = new PopupMenu.PopupMenuItem(_('Delete Profile...'));
    deleteItem.connect('activate', () => this.triggerDeleteDialog(profiles));
    this.menu.addMenuItem(deleteItem);
  }
  async triggerSaveDialog() {
    if (this._destroyed) return;
    if (!this._displayStateCache) return _notify(_('Error: No active display state cached.'), true);
    if (this._saveDialog) {
      this._saveDialog.close();
    }
    const [, phys, logicalMonitors] = this._displayStateCache;
    const monitorsToLabel = logicalMonitors.flatMap((lm, idx) => lm[5].map(p => ({
      connector: p[0],
      manufacturer: LayoutEngine.resolveVendorName(p[1]),
      modelName: p[2],
      x: lm[0],
      y: lm[1],
      defaultAlias: String(idx + 1)
    })));
    const hdrActive = phys.some(p => {
      const props = p[2] || {};
      if ('color-mode' in props) return Number(props['color-mode']) !== 0;
      if ('is-hdr-enabled' in props) return !!props['is-hdr-enabled'];
      return false;
    });
    try {
      const matchingProfiles = await LayoutEngine.getProfilesForHardwareAsync(phys);
      if (this._destroyed) return;
      const suggestedName = matchingProfiles.length > 0 ? matchingProfiles[0] : '';
      this._saveDialog = new SaveLayoutDialog(monitorsToLabel, suggestedName, async (name, aliasMap) => {
        try {
          await LayoutEngine.saveLayout(name, async (conn, v, p, x, y, def) => aliasMap[conn] || def);
          if (this._destroyed) return;
          _notify(_('Saved profile \'%s\'.', name));
          await this.updateCacheAndRebuild(true);
        } catch (err) {
          _notify(_('Failed to save: %s', err.message), true);
        }
      }, hdrActive);
      this._saveDialog.connect('destroy', () => {
        this._saveDialog = null;
      });
      this._saveDialog.open();
    } catch (err) {
      _logError(err, 'Failed to prepare save dialog');
    }
  }
  async triggerDeleteDialog(knownProfiles = null) {
    if (this._destroyed) return;
    if (this._deleteDialog) {
      this._deleteDialog.close();
    }
    try {
      const profiles = knownProfiles || (await LayoutEngine.getProfilesAsync());
      if (this._destroyed) return;
      this._deleteDialog = new DeleteLayoutDialog(profiles, async name => {
        try {
          await LayoutEngine.deleteLayout(name);
          if (this._destroyed) return;
          _notify(_('Deleted profile \'%s\'.', name));
          await this.updateCacheAndRebuild(true);
        } catch (err) {
          _notify(_('Failed to delete: %s', err.message), true);
        }
      });
      this._deleteDialog.connect('destroy', () => {
        this._deleteDialog = null;
      });
      this._deleteDialog.open();
    } catch (err) {
      _logError(err, 'Failed to prepare delete dialog');
    }
  }
  destroy() {
    this._destroyed = true;
    if (this._saveDialog) {
      this._saveDialog.close();
      this._saveDialog = null;
    }
    if (this._deleteDialog) {
      this._deleteDialog.close();
      this._deleteDialog = null;
    }
    this.menu.disconnectObject(this);
    super.destroy();
  }
});
export default class DisplayLayoutsExtension extends Extension {
  enable() {
    _settings = this.getSettings('org.gnome.shell.extensions.true-display-profiles');
    this._indicator = null;
    this._lastConnectedHwSigs = null;
    this._dbusService = new DisplayLayoutsDBusService();
    Main.wm.addKeybinding('switcher-shortcut', _settings, Meta.KeyBindingFlags.NONE, Shell.ActionMode.NORMAL, () => this._openProfileSwitcher());
    this._handleAutoApply().then(() => {
      if (this._indicator) {
        this._indicator.updateCacheAndRebuild(false).catch(e => _logError(e, 'Initial indicator build failed'));
      }
    });
    this._signalId = Gio.DBus.session.signal_subscribe('org.gnome.Mutter.DisplayConfig', 'org.gnome.Mutter.DisplayConfig', 'MonitorsChanged', '/org/gnome/Mutter/DisplayConfig', null, Gio.DBusSignalFlags.NONE, async () => {
      const applied = await this._handleAutoApply();
      if (!applied && this._indicator) {
        try {
          await this._indicator.updateCacheAndRebuild(false);
        } catch (err) {
          _logError(err, 'Centralized cache update failed');
        }
      }
    });
    _settings.connectObject('changed::show-indicator', () => this._updateIndicatorVisibility(), this);
    this._updateIndicatorVisibility();
  }
  async _openProfileSwitcher() {
    if (this._switcherPopup) return;
    try {
      const profiles = await LayoutEngine.getProfilesAsync();
      if (profiles.length === 0) return;
      const shortcutStrv = _settings.get_strv('switcher-shortcut');
      const parsed = LayoutEngine.parseAccelerator(shortcutStrv[0]);
      if (!parsed || parsed.modifiers.length === 0) {
        return;
      }
      const activeProfile = (await LayoutEngine.readTextFileAsync(LayoutEngine.ACTIVE_PROFILE_FILE))?.trim() || '';
      const initialIndex = Math.max(0, profiles.indexOf(activeProfile));
      const popup = new ProfileSwitcherPopup(profiles, initialIndex, parsed.modifiers, parsed.key, async chosen => {
        try {
          await LayoutEngine.applyLayout(chosen);
          _notify(_('Applied profile: %s', chosen));
        } catch (e) {
          _notify(_('Error: %s', e.message), true);
        }
      });
      this._switcherPopup = popup;
      popup.connect('destroy', () => {
        this._switcherPopup = null;
      });
      if (!popup.open()) {
        this._switcherPopup = null;
      }
    } catch (e) {
      _logError(e, 'Failed to open profile switcher');
    }
  }
  async _handleAutoApply() {
    if (this._autoApplyLock) {
      await this._autoApplyLock.catch(() => {});
    }
    let releaseLock;
    this._autoApplyLock = new Promise(resolve => {
      releaseLock = resolve;
    });
    try {
      const [, phys] = await LayoutEngine.getCurrentDisplayStateAsync();
      const currentHwSet = LayoutEngine.getConnectedHwSetString(phys);
      if (currentHwSet === this._lastConnectedHwSigs) return false;
      this._lastConnectedHwSigs = currentHwSet;
      this._latestAutoApplyId = (this._latestAutoApplyId || 0) + 1;
      const runId = this._latestAutoApplyId;
      const targetProfile = await LayoutEngine.resolveAutoApplyProfileAsync(phys);
      if (runId !== this._latestAutoApplyId || !targetProfile) {
        return false;
      }
      await LayoutEngine.applyLayout(targetProfile);
      _notify(_('Auto-applied profile: %s', targetProfile));
      return true;
    } catch (e) {
      _logError(e, 'Auto-apply sequence failed');
    } finally {
      releaseLock();
    }
    return false;
  }
  _updateIndicatorVisibility() {
    const show = _settings.get_boolean('show-indicator');
    if (show && !this._indicator) {
      this._indicator = new LayoutIndicator();
      Main.panel.addToStatusArea(this.uuid, this._indicator);
    } else if (!show && this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
  }
  disable() {
    if (this._switcherPopup) {
      this._switcherPopup.destroy();
      this._switcherPopup = null;
    }
    Main.wm.removeKeybinding('switcher-shortcut');
    if (this._signalId) {
      Gio.DBus.session.signal_unsubscribe(this._signalId);
      this._signalId = null;
    }
    _settings?.disconnectObject(this);
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
    if (this._dbusService) {
      this._dbusService.destroy();
      this._dbusService = null;
    }
    if (_notificationSource) {
      _notificationSource.destroy();
      _notificationSource = null;
    }
    _settings = null;
  }
}
