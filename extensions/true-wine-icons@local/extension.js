import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
const APP_DIR = GLib.get_home_dir() + '/.local/share/applications';
const UMU_DIR = GLib.get_home_dir() + '/.local/share/lutris/runtime/umu';
const UMU_RUN = UMU_DIR + '/umu-run';
const UMU_RUN_REAL = UMU_DIR + '/umu-run.real';
const WRAPPER_MARKER = 'WMCLASS_FIXER_UMU_WRAPPER_VERSION=1.0';
const WRAPPER_SCRIPT = `#!/bin/bash
${WRAPPER_MARKER}
set -euo pipefail

REAL_UMU="$(dirname "$0")/umu-run.real"
DB="$HOME/.local/share/lutris/pga.db"

if [[ -n "\${GAME_DIRECTORY:-}" && -f "$DB" ]] && command -v sqlite3 >/dev/null; then
    id="$(sqlite3 "$DB" "SELECT id FROM games WHERE directory='\${GAME_DIRECTORY//\\'/\\'\\'}' LIMIT 1;" 2>/dev/null || true)"
    if [[ "$id" =~ ^[0-9]+$ ]]; then
        export GAMEID="umu-$id"
    fi
fi

exec "$REAL_UMU" "$@"
`;
function ensureUmuWrapperInstalled() {
  if (!GLib.file_test(UMU_DIR, GLib.FileTest.IS_DIR)) return;
  const currentRun = readFileSafe(UMU_RUN);
  if (currentRun && currentRun.includes(WRAPPER_MARKER)) return;
  if (currentRun !== null && !GLib.file_test(UMU_RUN_REAL, GLib.FileTest.EXISTS)) {
    try {
      const src = Gio.File.new_for_path(UMU_RUN);
      const dst = Gio.File.new_for_path(UMU_RUN_REAL);
      src.move(dst, Gio.FileCopyFlags.NONE, null, null);
    } catch (e) {
      return;
    }
  }
  if (!GLib.file_test(UMU_RUN_REAL, GLib.FileTest.EXISTS)) return;
  try {
    GLib.file_set_contents(UMU_RUN, WRAPPER_SCRIPT);
    const f = Gio.File.new_for_path(UMU_RUN);
    f.set_attribute_uint32('unix::mode', 0o755, Gio.FileQueryInfoFlags.NONE, null);
  } catch (e) {}
}
const RETRY_SCHEDULE_MS = [500, 1000, 2000, 4000, 8000, 15000];
function readFileSafe(path) {
  try {
    const [ok, contents] = GLib.file_get_contents(path);
    if (!ok) return null;
    return new TextDecoder('utf-8').decode(contents);
  } catch (e) {
    return null;
  }
}
function listDir(path) {
  try {
    const dir = Gio.File.new_for_path(path);
    const enumerator = dir.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
    const names = [];
    let info;
    while ((info = enumerator.next_file(null)) !== null) names.push(info.get_name());
    enumerator.close(null);
    return names;
  } catch (e) {
    return [];
  }
}
function procCmdline(pid) {
  const raw = readFileSafe(`/proc/${pid}/cmdline`);
  if (!raw) return [];
  return raw.split('\0').filter(s => s.length > 0);
}
function procEnviron(pid) {
  const raw = readFileSafe(`/proc/${pid}/environ`);
  if (!raw) return {};
  const out = {};
  for (const entry of raw.split('\0')) {
    if (!entry) continue;
    const idx = entry.indexOf('=');
    if (idx === -1) continue;
    out[entry.slice(0, idx)] = entry.slice(idx + 1);
  }
  return out;
}
function procPpid(pid) {
  const stat = readFileSafe(`/proc/${pid}/stat`);
  if (!stat) return null;
  const close = stat.lastIndexOf(')');
  if (close === -1) return null;
  const rest = stat.slice(close + 2).trim().split(/\s+/);
  const ppid = parseInt(rest[1], 10);
  return Number.isNaN(ppid) ? null : ppid;
}
function allPids() {
  return listDir('/proc').filter(n => /^\d+$/.test(n)).map(n => parseInt(n, 10));
}
function ancestorChain(pid, maxDepth = 12) {
  const chain = [];
  let cur = pid;
  for (let i = 0; i < maxDepth && cur && cur > 1; i++) {
    chain.push(cur);
    cur = procPpid(cur);
  }
  return chain;
}
function descendantChain(pid, maxDepth = 6) {
  const found = [];
  const all = allPids();
  const childrenOf = new Map();
  for (const p of all) {
    const ppid = procPpid(p);
    if (ppid === null) continue;
    if (!childrenOf.has(ppid)) childrenOf.set(ppid, []);
    childrenOf.get(ppid).push(p);
  }
  let frontier = [pid];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next = [];
    for (const p of frontier) {
      const kids = childrenOf.get(p) || [];
      for (const k of kids) {
        found.push(k);
        next.push(k);
      }
    }
    frontier = next;
  }
  return found;
}
function relevantPids(seedPid) {
  const up = ancestorChain(seedPid);
  const down = descendantChain(seedPid);
  return [...new Set([seedPid, ...up, ...down])];
}
function findSteamAppId(pids) {
  for (const pid of pids) {
    const env = procEnviron(pid);
    const id = env['SteamAppId'] || env['SteamGameId'];
    if (id && /^\d+$/.test(id)) return id;
  }
  return null;
}
function findLutrisGameDirectory(pids) {
  for (const pid of pids) {
    const env = procEnviron(pid);
    if (env['GAME_DIRECTORY']) return env['GAME_DIRECTORY'];
  }
  return null;
}
function findLutrisGameByDirectory(directory) {
  const dbPath = `${GLib.get_home_dir()}/.local/share/lutris/pga.db`;
  if (!GLib.file_test(dbPath, GLib.FileTest.EXISTS)) return null;
  try {
    const escaped = directory.replace(/'/g, "''");
    const [ok, stdout] = GLib.spawn_command_line_sync(`sqlite3 "${dbPath}" "SELECT id, slug FROM games WHERE directory='${escaped}' LIMIT 1;"`);
    if (ok && stdout) {
      const text = new TextDecoder('utf-8').decode(stdout).trim();
      const [id, slug] = text.split('|');
      if (id && /^\d+$/.test(id)) return {
        id,
        slug: slug || null
      };
    }
  } catch (e) {}
  return null;
}
function findLutrisSlugFromPaths(pids) {
  for (const pid of pids) {
    const env = procEnviron(pid);
    const prefix = env['WINEPREFIX'] || '';
    let m = prefix.match(/\/lutris\/runners\/wine\/[^/]+\/prefixes\/([^/]+)/);
    if (m) return m[1];
    m = prefix.match(/\/lutris\/[^/]+\/([^/]+)\/prefix/);
    if (m) return m[1];
    const cmd = procCmdline(pid).join(' ');
    m = cmd.match(/\/lutris\/games\/([^/]+)\//);
    if (m) return m[1];
  }
  return null;
}
function findExeBasename(pids) {
  for (const pid of pids) {
    const cmd = procCmdline(pid);
    for (const arg of cmd) {
      if (/\.exe$/i.test(arg)) {
        const normalized = arg.replace(/\\/g, '/');
        const parts = normalized.split('/');
        return parts[parts.length - 1];
      }
    }
  }
  return null;
}
function parseDesktopExec(content) {
  const m = content.match(/^Exec\s*=\s*(.*)$/m);
  return m ? m[1].trim() : null;
}
function parseDesktopKey(content, key) {
  const re = new RegExp(`^${key}\\s*=\\s*(.*)$`, 'm');
  const m = content.match(re);
  return m ? m[1].trim() : null;
}
function findDesktopFileByPredicate(predicate) {
  const matches = [];
  for (const name of listDir(APP_DIR)) {
    if (!name.endsWith('.desktop')) continue;
    const path = `${APP_DIR}/${name}`;
    const content = readFileSafe(path);
    if (!content) continue;
    const exec = parseDesktopExec(content);
    if (exec && predicate(exec)) matches.push({
      path,
      content
    });
  }
  return matches;
}
function execMatchesId(exec, prefix, id) {
  const idx = exec.indexOf(`${prefix}${id}`);
  if (idx === -1) return false;
  const afterEnd = idx + prefix.length + String(id).length;
  const nextChar = exec[afterEnd];
  return nextChar === undefined || !/[0-9]/.test(nextChar);
}
function findDesktopForSteamAppId(appId) {
  return findDesktopFileByPredicate(exec => execMatchesId(exec, 'rungameid/', appId) || execMatchesId(exec, 'run/', appId));
}
function findDesktopForLutrisSlug(slug, gameId) {
  return findDesktopFileByPredicate(exec => {
    if (exec.includes(`rungame/${slug}`) && !exec.includes(`rungameid/${slug}`)) return true;
    if (gameId && execMatchesId(exec, 'rungameid/', gameId)) return true;
    return false;
  });
}
function findDesktopForExeBasename(basename) {
  return findDesktopFileByPredicate(exec => exec.toLowerCase().includes(basename.toLowerCase()));
}
function patchStartupWMClass(path, content, wmClass) {
  let newContent;
  if (/^StartupWMClass\s*=.*$/m.test(content)) {
    newContent = content.replace(/^StartupWMClass\s*=.*$/m, `StartupWMClass=${wmClass}`);
  } else {
    newContent = content.replace(/^\[Desktop Entry\]\s*$/m, `[Desktop Entry]\nStartupWMClass=${wmClass}`);
  }
  try {
    GLib.file_set_contents(path, newContent);
  } catch (e) {}
}
function handleWindow(win) {
  if (!win || !win.get_window_type) return 'abandon';
  if (win.get_window_type() !== Meta.WindowType.NORMAL) return 'abandon';
  const wmClass = win.get_wm_class();
  if (!wmClass) return 'retry';
  const pid = win.get_pid();
  if (!pid || pid <= 0) return 'retry';
  const pids = relevantPids(pid);
  let matches = [];
  const steamId = findSteamAppId(pids);
  if (steamId) matches = findDesktopForSteamAppId(steamId);
  if (matches.length === 0) {
    const directory = findLutrisGameDirectory(pids);
    if (directory) {
      const game = findLutrisGameByDirectory(directory);
      if (game) matches = findDesktopForLutrisSlug(game.slug, game.id);
    }
    if (matches.length === 0) {
      const slug = findLutrisSlugFromPaths(pids);
      if (slug) matches = findDesktopForLutrisSlug(slug, null);
    }
  }
  if (matches.length === 0) {
    const exeBase = findExeBasename(pids);
    if (exeBase) matches = findDesktopForExeBasename(exeBase);
  }
  if (matches.length !== 1) return 'retry';
  const {
    path,
    content
  } = matches[0];
  const current = parseDesktopKey(content, 'StartupWMClass');
  if (current !== wmClass) patchStartupWMClass(path, content, wmClass);
  return 'done';
}
export default class WMClassFixerExtension extends Extension {
  enable() {
    this._timeouts = new Set();
    ensureUmuWrapperInstalled();
    this._wrapperCheckId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 3600, () => {
      ensureUmuWrapperInstalled();
      return GLib.SOURCE_CONTINUE;
    });
    this._windowCreatedId = global.display.connect('window-created', (display, win) => {
      this._scheduleAttempt(win, 0);
    });
  }
  _scheduleAttempt(win, attemptIndex) {
    if (attemptIndex >= RETRY_SCHEDULE_MS.length) return;
    const delay = RETRY_SCHEDULE_MS[attemptIndex];
    const sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
      this._timeouts.delete(sourceId);
      let status;
      try {
        if (!win || win.is_destroyed?.()) status = 'abandon';else status = handleWindow(win);
      } catch (e) {
        status = 'abandon';
      }
      if (status === 'retry') this._scheduleAttempt(win, attemptIndex + 1);
      return GLib.SOURCE_REMOVE;
    });
    this._timeouts.add(sourceId);
  }
  disable() {
    if (this._windowCreatedId) {
      global.display.disconnect(this._windowCreatedId);
      this._windowCreatedId = null;
    }
    if (this._wrapperCheckId) {
      GLib.source_remove(this._wrapperCheckId);
      this._wrapperCheckId = null;
    }
    for (const id of this._timeouts) GLib.source_remove(id);
    this._timeouts.clear();
  }
}
