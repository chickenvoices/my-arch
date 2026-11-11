import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { MprisClient } from './mprisClient.js';
import { ArtCache } from './artCache.js';
import { PillWidget } from './pillWidget.js';
import { waitForAllDashToDocks } from './dashLocator.js';
import { DashSettings } from './dashSettings.js';
const ART_GRACE_MS = 250;
const ART_POLL_MS = 150;
const ART_POLL_MAX_MS = 1000;
export default class PillForSpotifyExtension extends Extension {
  enable() {
    this._mpris = new MprisClient();
    this._artCache = new ArtCache(GLib.build_filenamev([GLib.get_user_cache_dir(), 'pill-for-spotify', 'art']));
    this._dashSettings = new DashSettings();
    this._active = false;
    this._trackId = null;
    this._artUrl = null;
    this._artIcon = null;
    this._graceId = 0;
    this._pollId = 0;
    this._pills = [];
    this._dashSettings.connect('changed', () => this._applyDashMetricsToAll());
    this._cancelDashWait = waitForAllDashToDocks((container, iconsBox) => this._createPillFor(iconsBox));
    this._mpris.connect('availability-changed', available => {
      if (!available) this._deactivate();
    });
    this._mpris.connect('state-changed', () => this._onStateChanged());
  }
  disable() {
    this._cancelDashWait?.();
    this._cancelDashWait = null;
    this._stopArtTimers();
    this._mpris?.destroy();
    this._mpris = null;
    this._artCache?.destroy();
    this._artCache = null;
    this._dashSettings?.destroy();
    this._dashSettings = null;
    for (const pill of [...this._pills]) pill.destroy();
    this._pills = [];
  }
  _forEachPill(fn) {
    for (const pill of this._pills) fn(pill);
  }
  _createPillFor(iconsBox) {
    if (!iconsBox) return;
    const pill = new PillWidget();
    pill.connect('play-pause-clicked', () => this._mpris?.playPause());
    pill.connect('next-clicked', () => this._mpris?.next());
    pill.connect('previous-clicked', () => this._mpris?.previous());
    pill.connect('pill-clicked', () => this._mpris?.raise());
    iconsBox.add_child(pill);
    this._pills.push(pill);
    pill.connect('destroy', () => {
      this._pills = this._pills.filter(p => p !== pill);
    });
    pill.setDashMetrics(this._dashSettings.getOrientation(), this._dashSettings.getIconSize());
    this._onStateChanged();
  }
  _applyDashMetricsToAll() {
    const orientation = this._dashSettings.getOrientation();
    const iconSize = this._dashSettings.getIconSize();
    this._forEachPill(pill => pill.setDashMetrics(orientation, iconSize));
  }
  _onStateChanged() {
    const state = this._mpris?.getState();
    if (!state || !state.title) {
      this._deactivate();
      return;
    }
    if (!this._active) {
      if (state.status !== 'Playing') return;
      this._active = true;
    }
    const trackChanged = state.trackId !== this._trackId;
    if (trackChanged) this._onTrackChanged(state);
    this._forEachPill(pill => {
      pill.setTrackInfo(state.title, state.artist);
      pill.setPlaying(state.status === 'Playing');
      if (this._artIcon) pill.setArt(this._artIcon);
      pill.setShown(true);
    });
    if (!trackChanged) this._onArtUrlUpdate(state.artUrl);
  }
  _deactivate() {
    this._stopArtTimers();
    this._active = false;
    this._trackId = null;
    this._artUrl = null;
    this._artIcon = null;
    this._forEachPill(pill => {
      pill.setShown(false);
      pill.setArt(null);
    });
  }
  _onTrackChanged(state) {
    const previousUrl = this._artUrl;
    this._stopArtTimers();
    this._trackId = state.trackId;
    this._artIcon = null;
    this._graceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ART_GRACE_MS, () => {
      this._graceId = 0;
      if (!this._artIcon) this._forEachPill(pill => pill.setArt(null));
      return GLib.SOURCE_REMOVE;
    });
    if (state.artUrl && state.artUrl !== previousUrl) this._loadArt(state.artUrl);else this._waitForFreshArtUrl(previousUrl);
  }
  _onArtUrlUpdate(artUrl) {
    if (this._pollId) return;
    if (artUrl && artUrl !== this._artUrl) {
      this._loadArt(artUrl);
    } else if (!artUrl && this._artUrl) {
      this._artUrl = null;
      this._artIcon = null;
      this._forEachPill(pill => pill.setArt(null));
    }
  }
  _waitForFreshArtUrl(staleUrl) {
    this._artUrl = staleUrl;
    const trackId = this._trackId;
    let waited = 0;
    this._pollId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ART_POLL_MS, () => {
      waited += ART_POLL_MS;
      const state = this._mpris?.getState();
      if (!state || state.trackId !== trackId) {
        this._pollId = 0;
        return GLib.SOURCE_REMOVE;
      }
      const fresh = state.artUrl && state.artUrl !== staleUrl;
      if (!fresh && waited < ART_POLL_MAX_MS) return GLib.SOURCE_CONTINUE;
      this._pollId = 0;
      if (state.artUrl) this._loadArt(state.artUrl);else this._artUrl = null;
      return GLib.SOURCE_REMOVE;
    });
  }
  _loadArt(url) {
    if (this._pollId) {
      GLib.source_remove(this._pollId);
      this._pollId = 0;
    }
    this._artUrl = url;
    const trackId = this._trackId;
    this._artCache.fetch(url, icon => {
      if (trackId !== this._trackId || url !== this._artUrl) return;
      this._artIcon = icon;
      this._forEachPill(pill => pill.setArt(icon));
    });
  }
  _stopArtTimers() {
    if (this._graceId) {
      GLib.source_remove(this._graceId);
      this._graceId = 0;
    }
    if (this._pollId) {
      GLib.source_remove(this._pollId);
      this._pollId = 0;
    }
  }
}
