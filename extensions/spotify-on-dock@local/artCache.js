import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
export class ArtCache {
  constructor(cacheDir) {
    this._cacheDir = cacheDir;
    this._memCache = new Map();
    this._pending = new Map();
    GLib.mkdir_with_parents(this._cacheDir, 0o700);
  }
  _hashUrl(url) {
    return GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, url, -1);
  }
  fetch(url, callback) {
    if (!url) {
      callback(null);
      return;
    }
    if (this._memCache.has(url)) {
      callback(this._memCache.get(url));
      return;
    }
    if (url.startsWith('file://')) {
      const file = Gio.File.new_for_uri(url);
      const icon = new Gio.FileIcon({
        file
      });
      this._memCache.set(url, icon);
      callback(icon);
      return;
    }
    const localPath = GLib.build_filenamev([this._cacheDir, this._hashUrl(url) + '.jpg']);
    const localFile = Gio.File.new_for_path(localPath);
    if (localFile.query_exists(null)) {
      const icon = new Gio.FileIcon({
        file: localFile
      });
      this._memCache.set(url, icon);
      callback(icon);
      return;
    }
    this._download(url, localFile, icon => {
      if (icon) this._memCache.set(url, icon);
      callback(icon);
    });
  }
  _download(url, destFile, callback) {
    const cancellable = new Gio.Cancellable();
    this._pending.set(url, cancellable);
    const remote = Gio.File.new_for_uri(url);
    remote.load_bytes_async(cancellable, (source, res) => {
      this._pending.delete(url);
      let bytes;
      try {
        [bytes] = source.load_bytes_finish(res);
      } catch (e) {
        if (!cancellable.is_cancelled()) logError(e, `pill-for-spotify: failed to download art ${url}`);
        callback(null);
        return;
      }
      try {
        destFile.replace_contents(bytes.get_data(), null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        callback(new Gio.FileIcon({
          file: destFile
        }));
      } catch (e) {
        logError(e, 'pill-for-spotify: failed to write art cache file');
        callback(null);
      }
    });
  }
  destroy() {
    for (const cancellable of this._pending.values()) cancellable.cancel();
    this._pending.clear();
    this._memCache.clear();
  }
}
