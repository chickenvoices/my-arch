import Gio from 'gi://Gio';
const MPRIS_BUS_NAME = 'org.mpris.MediaPlayer2.spotify';
const MPRIS_OBJECT_PATH = '/org/mpris/MediaPlayer2';
const MprisPlayerIface = `
<node>
  <interface name="org.mpris.MediaPlayer2.Player">
    <method name="PlayPause"/>
    <method name="Next"/>
    <method name="Previous"/>
    <method name="Play"/>
    <method name="Pause"/>
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="Metadata" type="a{sv}" access="read"/>
  </interface>
</node>`;
const MprisAppIface = `
<node>
  <interface name="org.mpris.MediaPlayer2">
    <method name="Raise"/>
    <property name="CanRaise" type="b" access="read"/>
  </interface>
</node>`;
const PlayerProxyWrapper = Gio.DBusProxy.makeProxyWrapper(MprisPlayerIface);
const AppProxyWrapper = Gio.DBusProxy.makeProxyWrapper(MprisAppIface);
export class MprisClient {
  constructor() {
    this._playerProxy = null;
    this._appProxy = null;
    this._propsChangedId = 0;
    this._available = false;
    this._proxyCancellable = null;
    this._listeners = {
      'availability-changed': [],
      'state-changed': []
    };
    this._nameWatcherId = Gio.DBus.session.watch_name(MPRIS_BUS_NAME, Gio.BusNameWatcherFlags.NONE, this._onNameAppeared.bind(this), this._onNameVanished.bind(this));
  }
  connect(signal, callback) {
    if (!this._listeners[signal]) this._listeners[signal] = [];
    this._listeners[signal].push(callback);
    return callback;
  }
  disconnectAll() {
    this._listeners = {
      'availability-changed': [],
      'state-changed': []
    };
  }
  _emit(signal, ...args) {
    for (const cb of this._listeners[signal] ?? []) cb(...args);
  }
  get available() {
    return this._available;
  }
  _onNameAppeared(_conn, _name, _owner) {
    this._proxyCancellable?.cancel();
    const cancellable = new Gio.Cancellable();
    this._proxyCancellable = cancellable;
    new PlayerProxyWrapper(Gio.DBus.session, MPRIS_BUS_NAME, MPRIS_OBJECT_PATH, (proxy, error) => {
      if (cancellable.is_cancelled()) return;
      if (error !== null) {
        logError(error, 'pill-for-spotify: failed to create MPRIS player proxy');
        this._available = false;
        this._emit('availability-changed', false);
        return;
      }
      this._playerProxy = proxy;
      this._propsChangedId = this._playerProxy.connect('g-properties-changed', () => this._emit('state-changed'));
      this._available = true;
      this._emit('availability-changed', true);
      this._emit('state-changed');
    }, cancellable);
    new AppProxyWrapper(Gio.DBus.session, MPRIS_BUS_NAME, MPRIS_OBJECT_PATH, (proxy, error) => {
      if (cancellable.is_cancelled()) return;
      if (error === null) this._appProxy = proxy;
    }, cancellable);
  }
  _onNameVanished() {
    this._teardownProxy();
    this._available = false;
    this._emit('availability-changed', false);
  }
  _teardownProxy() {
    this._proxyCancellable?.cancel();
    this._proxyCancellable = null;
    if (this._playerProxy && this._propsChangedId) {
      try {
        this._playerProxy.disconnect(this._propsChangedId);
      } catch (e) {}
    }
    this._propsChangedId = 0;
    this._playerProxy = null;
    this._appProxy = null;
  }
  getState() {
    if (!this._available || !this._playerProxy) return null;
    let metadata;
    try {
      metadata = this._playerProxy.Metadata;
    } catch (e) {
      return null;
    }
    if (!metadata) return null;
    const lookup = key => {
      const v = metadata[key];
      return v ? v.deep_unpack() : null;
    };
    const artistArray = lookup('xesam:artist');
    const artist = Array.isArray(artistArray) && artistArray.length > 0 ? artistArray.join(', ') : '';
    return {
      title: lookup('xesam:title') || '',
      artist,
      artUrl: lookup('mpris:artUrl') || '',
      trackId: lookup('mpris:trackid') || '',
      status: this._playerProxy.PlaybackStatus || 'Stopped'
    };
  }
  playPause() {
    this._safeCall(() => this._playerProxy.PlayPauseSync());
  }
  next() {
    this._safeCall(() => this._playerProxy.NextSync());
  }
  previous() {
    this._safeCall(() => this._playerProxy.PreviousSync());
  }
  raise() {
    this._safeCall(() => {
      if (this._appProxy) this._appProxy.RaiseSync();
    });
  }
  _safeCall(fn) {
    if (!this._available) return;
    try {
      fn();
    } catch (e) {
      logError(e, 'pill-for-spotify: MPRIS call failed');
    }
  }
  destroy() {
    if (this._nameWatcherId) {
      Gio.DBus.session.unwatch_name(this._nameWatcherId);
      this._nameWatcherId = 0;
    }
    this._teardownProxy();
    this.disconnectAll();
  }
}
