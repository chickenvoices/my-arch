import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import { _ } from './i18n.js';
const PNP_VENDOR_NAMES = {
  AUS: 'ASUS',
  GSM: 'LG Electronics',
  SAM: 'Samsung',
  DEL: 'Dell',
  LEN: 'Lenovo',
  HPQ: 'HP',
  HPN: 'HP',
  ACI: 'Ancor Communications',
  ACR: 'Acer',
  BNQ: 'BenQ',
  CMN: 'Chimei Innolux',
  CMO: 'Chi Mei Optoelectronics',
  AUO: 'AU Optronics',
  LGD: 'LG Display',
  BOE: 'BOE',
  SDC: 'Samsung Display',
  SEC: 'Samsung',
  SNY: 'Sony',
  PHL: 'Philips',
  VSC: 'ViewSonic',
  IVM: 'Iiyama',
  HSD: 'HannStar',
  HSP: 'HannStar',
  NEC: 'NEC',
  MSI: 'Micro-Star (MSI)',
  GBT: 'Gigabyte',
  TSB: 'Toshiba',
  TOS: 'Dynabook (Toshiba)',
  APP: 'Apple',
  FUJ: 'Fujitsu',
  HIT: 'Hitachi',
  SHP: 'Sharp',
  ENC: 'EIZO',
  EIZ: 'EIZO'
};
export function resolveVendorName(pnpCode) {
  if (!pnpCode) return pnpCode;
  return PNP_VENDOR_NAMES[pnpCode.toUpperCase()] || pnpCode;
}
export function parseAccelerator(accel) {
  if (!accel) return null;
  const modifiers = [];
  let rest = accel;
  const modPattern = /^<(Shift|Control|Ctrl|Alt|Super|Meta|Hyper|Primary)>/i;
  let match;
  while (match = rest.match(modPattern)) {
    let name = match[1];
    if (name.toLowerCase() === 'ctrl') name = 'Control';
    if (name.toLowerCase() === 'primary') name = 'Control';
    modifiers.push(name);
    rest = rest.slice(match[0].length);
  }
  if (!rest) return null;
  return {
    modifiers,
    key: rest
  };
}
export const CONFIG_DIR = `${GLib.get_home_dir()}/.config/display-layouts`;
export const ACTIVE_PROFILE_FILE = `${CONFIG_DIR}/.active_profile`;
export const HARDWARE_HISTORY_FILE = `${CONFIG_DIR}/.hardware_history.json`;
const DBUS_NAME = 'org.gnome.Mutter.DisplayConfig';
const DBUS_PATH = '/org/gnome/Mutter/DisplayConfig';
const DBUS_IFACE = 'org.gnome.Mutter.DisplayConfig';
async function callMutterAsync(methodName, variantArgs) {
  return await Gio.DBus.session.call(DBUS_NAME, DBUS_PATH, DBUS_IFACE, methodName, variantArgs, null, Gio.DBusCallFlags.NONE, -1, null);
}
export async function getCurrentDisplayStateAsync() {
  const reply = await callMutterAsync("GetCurrentState", null);
  return reply.recursiveUnpack();
}
async function writeTextFileAsync(filePath, content) {
  const file = Gio.File.new_for_path(filePath);
  const parent = file.get_parent();
  if (parent) {
    await new Promise(resolve => {
      parent.make_directory_async(GLib.PRIORITY_DEFAULT, null, (p, res) => {
        try {
          p.make_directory_finish(res);
        } catch (e) {}
        resolve();
      });
    });
  }
  const bytes = new TextEncoder().encode(content);
  return new Promise((resolve, reject) => {
    file.replace_contents_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null, (f, res) => {
      try {
        f.replace_contents_finish(res);
        resolve(true);
      } catch (e) {
        reject(e);
      }
    });
  });
}
export function readTextFileAsync(filePath) {
  return new Promise(resolve => {
    Gio.File.new_for_path(filePath).load_contents_async(null, (f, res) => {
      try {
        const [success, contents] = f.load_contents_finish(res);
        resolve(success ? new TextDecoder().decode(contents) : null);
      } catch (e) {
        resolve(null);
      }
    });
  });
}
export function getProfilesAsync() {
  return new Promise(resolve => {
    const dir = Gio.File.new_for_path(CONFIG_DIR);
    dir.enumerate_children_async('standard::name', Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null, (d, res) => {
      try {
        const enumerator = d.enumerate_children_finish(res);
        const profiles = [];
        const fetchNext = () => {
          enumerator.next_files_async(100, GLib.PRIORITY_DEFAULT, null, (e, enumRes) => {
            try {
              const files = e.next_files_finish(enumRes);
              if (files.length === 0) {
                enumerator.close(null);
                return resolve(profiles.sort());
              }
              files.forEach(file => {
                const name = file.get_name();
                if (name.endsWith('.json') && !name.startsWith('.')) {
                  profiles.push(name.substring(0, name.length - 5));
                }
              });
              fetchNext();
            } catch (err) {
              try {
                enumerator.close(null);
              } catch (c) {}
              resolve(profiles.sort());
            }
          });
        };
        fetchNext();
      } catch (err) {
        resolve([]);
      }
    });
  });
}
export function getHwSig(physInfo) {
  const [_, vendor, prod, serial] = physInfo;
  return `${vendor}_${prod}_${serial}`.replace(/\s+/g, '');
}
export function getConnectedHwSetString(phys) {
  return phys.map(p => getHwSig(p[0])).sort().join(',');
}
export function buildConnToHwMap(phys) {
  const counts = {};
  return Object.fromEntries(phys.map(p => {
    const base = getHwSig(p[0]);
    counts[base] = (counts[base] || 0) + 1;
    const uniqueSig = `${base}_${counts[base]}`;
    return [p[0][0], uniqueSig];
  }));
}
export function buildHwToConnMap(phys) {
  return Object.fromEntries(Object.entries(buildConnToHwMap(phys)).map(([conn, hwSig]) => [hwSig, conn]));
}
function getActiveMode(modes) {
  const current = modes.find(m => m[6] && m[6]['is-current']);
  if (current) return current[0];
  const preferred = modes.find(m => m[6] && m[6]['is-preferred']);
  return preferred ? preferred[0] : modes.length ? modes[0][0] : "";
}
function getMonitorHdrState(monitorProps) {
  if (!monitorProps) return null;
  if ('color-mode' in monitorProps) {
    const mode = monitorProps['color-mode'];
    return {
      kind: 'color-mode',
      value: mode
    };
  }
  if ('is-hdr-enabled' in monitorProps) {
    return {
      kind: 'is-hdr-enabled',
      value: !!monitorProps['is-hdr-enabled']
    };
  }
  return null;
}
function buildMonitorProps(savedMonitor) {
  const props = {
    ...(savedMonitor.props || {})
  };
  if (savedMonitor.hdr) {
    if (savedMonitor.hdr.kind === 'color-mode') {
      props['color-mode'] = new GLib.Variant('u', savedMonitor.hdr.value);
    } else if (savedMonitor.hdr.kind === 'is-hdr-enabled') {
      props['is-hdr-enabled'] = new GLib.Variant('b', savedMonitor.hdr.value);
    }
  }
  return props;
}
function resolvePrimaryHwSigs(logical, profile, connToHw) {
  const livePrimary = logical.find(lm => lm[4] && lm[5].length > 0);
  const profilePrimary = profile.logical_monitors.find(slm => slm.primary && slm.monitors.length > 0);
  return {
    livePrimaryHwSig: livePrimary ? connToHw[livePrimary[5][0][0]] : null,
    profilePrimaryHwSig: profilePrimary ? profilePrimary.monitors[0].hw_sig : null
  };
}
async function applyLayoutToDBus(serial, logicalMonitors, livePrimaryHwSig, profilePrimaryHwSig) {
  if (!logicalMonitors || logicalMonitors.length === 0) throw new Error(_('No logical monitors to apply.'));
  const lmList = logicalMonitors.map(lm => [lm[0], lm[1], lm[2], lm[3], false, lm[5], lm[6]]);
  let primaryIndex = -1;
  if (profilePrimaryHwSig) primaryIndex = lmList.findIndex(lm => lm[6] && lm[6].includes(profilePrimaryHwSig));
  if (primaryIndex === -1 && livePrimaryHwSig) primaryIndex = lmList.findIndex(lm => lm[6] && lm[6].includes(livePrimaryHwSig));
  if (primaryIndex === -1) primaryIndex = 0;
  lmList[primaryIndex][4] = true;
  const minX = Math.min(...lmList.map(lm => lm[0]));
  const minY = Math.min(...lmList.map(lm => lm[1]));
  lmList.forEach(lm => {
    lm[0] -= minX;
    lm[1] -= minY;
  });
  const finalLm = lmList.map(lm => [Number(lm[0]), Number(lm[1]), Number(lm[2]), Number(lm[3]), lm[4], lm[5].map(m => [m[0], m[1], m[2] || {}])]);
  const variant = new GLib.Variant("(uua(iiduba(ssa{sv}))a{sv})", [Number(serial), 3, finalLm, {}]);
  await callMutterAsync("ApplyMonitorsConfig", variant);
}
export async function getProfilesForHardwareAsync(phys) {
  const connectedHwSet = new Set(Object.values(buildConnToHwMap(phys)));
  const profiles = await getProfilesAsync();
  const matching = [];
  for (const name of profiles) {
    const content = await readTextFileAsync(`${CONFIG_DIR}/${name}.json`);
    if (!content) continue;
    try {
      const data = JSON.parse(content);
      const profHws = data.logical_monitors.flatMap(lm => lm.monitors.map(m => m.hw_sig));
      if (profHws.every(hw => connectedHwSet.has(hw))) {
        matching.push(name);
      }
    } catch (e) {}
  }
  return matching;
}
export async function recordHardwareHistory(phys, profileName) {
  const hwSetString = getConnectedHwSetString(phys);
  let history = {};
  const content = await readTextFileAsync(HARDWARE_HISTORY_FILE);
  if (content) {
    try {
      history = JSON.parse(content);
    } catch (e) {}
  }
  history[hwSetString] = profileName;
  await writeTextFileAsync(HARDWARE_HISTORY_FILE, JSON.stringify(history, null, 2));
}
export async function resolveAutoApplyProfileAsync(phys) {
  const matching = await getProfilesForHardwareAsync(phys);
  if (matching.length === 0) return null;
  const hwSetString = getConnectedHwSetString(phys);
  const historyJson = await readTextFileAsync(HARDWARE_HISTORY_FILE);
  if (historyJson) {
    try {
      const history = JSON.parse(historyJson);
      if (history[hwSetString] && matching.includes(history[hwSetString])) {
        return history[hwSetString];
      }
    } catch (e) {}
  }
  return matching[0];
}
export async function saveLayout(name, aliasResolver) {
  const [, phys, logical] = await getCurrentDisplayStateAsync();
  const connToHw = buildConnToHwMap(phys);
  const activeModes = Object.fromEntries(phys.map(p => [connToHw[p[0][0]], getActiveMode(p[1])]));
  const hdrStates = Object.fromEntries(phys.map(p => [connToHw[p[0][0]], getMonitorHdrState(p[2])]));
  const labels = {};
  const savedLogical = [];
  for (let idx = 0; idx < logical.length; idx++) {
    const [x, y, scale, transform, primary, physList] = logical[idx];
    const savedPhys = [];
    for (const p of physList) {
      const hwSig = connToHw[p[0]];
      const hdr = hdrStates[hwSig];
      savedPhys.push({
        hw_sig: hwSig,
        mode_id: activeModes[hwSig] || "",
        props: {},
        ...(hdr ? {
          hdr
        } : {})
      });
      labels[await aliasResolver(p[0], p[1], p[2], x, y, String(idx + 1))] = hwSig;
    }
    savedLogical.push({
      x,
      y,
      scale,
      transform,
      primary,
      monitors: savedPhys
    });
  }
  const profile = {
    name,
    labels,
    logical_monitors: savedLogical
  };
  await writeTextFileAsync(`${CONFIG_DIR}/${name}.json`, JSON.stringify(profile, null, 2));
  await writeTextFileAsync(ACTIVE_PROFILE_FILE, name);
  await recordHardwareHistory(phys, name);
}
export async function applyLayout(name) {
  const content = await readTextFileAsync(`${CONFIG_DIR}/${name}.json`);
  if (!content) throw new Error(_('Profile \'%s\' does not exist.', name));
  let profile;
  try {
    profile = JSON.parse(content);
  } catch (err) {
    throw new Error(_('Profile \'%s\' has a corrupted configuration file.', name));
  }
  const [serial, phys, logical] = await getCurrentDisplayStateAsync();
  const connToHw = buildConnToHwMap(phys);
  const {
    livePrimaryHwSig,
    profilePrimaryHwSig
  } = resolvePrimaryHwSigs(logical, profile, connToHw);
  const hwToConn = buildHwToConnMap(phys);
  const newLogical = [];
  for (const slm of profile.logical_monitors) {
    const monitorsArray = [],
      lmHwSigs = [];
    for (const sm of slm.monitors) {
      if (!(sm.hw_sig in hwToConn)) throw new Error(_('Monitor \'%s\' is disconnected or asleep.', sm.hw_sig));
      monitorsArray.push([hwToConn[sm.hw_sig], sm.mode_id, buildMonitorProps(sm)]);
      lmHwSigs.push(sm.hw_sig);
    }
    newLogical.push([slm.x, slm.y, slm.scale, slm.transform, slm.primary, monitorsArray, lmHwSigs]);
  }
  await applyLayoutToDBus(serial, newLogical, livePrimaryHwSig, profilePrimaryHwSig);
  await writeTextFileAsync(ACTIVE_PROFILE_FILE, name);
  await recordHardwareHistory(phys, name);
}
export async function deleteLayout(name) {
  const filePath = `${CONFIG_DIR}/${name}.json`;
  const file = Gio.File.new_for_path(filePath);
  if (!file.query_exists(null)) throw new Error(_('Profile \'%s\' does not exist.', name));
  await new Promise((resolve, reject) => {
    file.delete_async(GLib.PRIORITY_DEFAULT, null, (f, res) => {
      try {
        f.delete_finish(res);
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  });
  const activeName = (await readTextFileAsync(ACTIVE_PROFILE_FILE))?.trim();
  if (activeName === name) {
    await writeTextFileAsync(ACTIVE_PROFILE_FILE, '');
  }
  const historyJson = await readTextFileAsync(HARDWARE_HISTORY_FILE);
  if (historyJson) {
    try {
      const history = JSON.parse(historyJson);
      let changed = false;
      for (const key of Object.keys(history)) {
        if (history[key] === name) {
          delete history[key];
          changed = true;
        }
      }
      if (changed) {
        await writeTextFileAsync(HARDWARE_HISTORY_FILE, JSON.stringify(history, null, 2));
      }
    } catch (e) {}
  }
}
function findModeDimensions(phys, connector, modeId) {
  const monitor = phys.find(p => p[0][0] === connector);
  if (!monitor) return null;
  const mode = monitor[1].find(m => m[0] === modeId);
  if (!mode) return null;
  return {
    width: mode[1],
    height: mode[2]
  };
}
function repackLogicalMonitors(logicalMonitors, phys) {
  const sorted = [...logicalMonitors].sort((a, b) => a[0] - b[0]);
  let cursorX = sorted.length ? sorted[0][0] : 0;
  return sorted.map(lm => {
    const [, y, scale, transform, primary, monitorsArray, hwSigs] = lm;
    const thisX = cursorX;
    let logicalWidth = 0;
    for (const [connector, modeId] of monitorsArray) {
      const dims = findModeDimensions(phys, connector, modeId);
      if (!dims) continue;
      const isRotated = transform === 1 || transform === 3 || transform === 5 || transform === 7;
      const rawWidth = isRotated ? dims.height : dims.width;
      logicalWidth = Math.max(logicalWidth, rawWidth / scale);
    }
    cursorX += Math.round(logicalWidth);
    return [thisX, y, scale, transform, primary, monitorsArray, hwSigs];
  });
}
export async function toggleLayouts(aliases) {
  let activeName = await readTextFileAsync(ACTIVE_PROFILE_FILE);
  if (!activeName) throw new Error(_('No active profile.'));
  activeName = activeName.trim();
  const content = await readTextFileAsync(`${CONFIG_DIR}/${activeName}.json`);
  if (!content) throw new Error(_('Profile \'%s\' missing.', activeName));
  let profile;
  try {
    profile = JSON.parse(content);
  } catch (err) {
    throw new Error(_('Profile \'%s\' has a corrupted configuration file.', activeName));
  }
  const [serial, phys, logical] = await getCurrentDisplayStateAsync();
  const hwToConn = buildHwToConnMap(phys);
  const connToHw = buildConnToHwMap(phys);
  const {
    livePrimaryHwSig,
    profilePrimaryHwSig
  } = resolvePrimaryHwSigs(logical, profile, connToHw);
  const desiredHws = new Set(logical.flatMap(lm => lm[5].map(p => connToHw[p[0]])));
  const toggleResults = [];
  for (const alias of aliases) {
    const targetHwSig = profile.labels?.[alias];
    if (!targetHwSig) throw new Error(_('Alias \'%s\' not found.', alias));
    if (!(targetHwSig in hwToConn)) throw new Error(_('Display \'%s\' is disconnected or asleep.', alias));
    if (desiredHws.has(targetHwSig)) {
      desiredHws.delete(targetHwSig);
      toggleResults.push({
        alias,
        on: false
      });
    } else {
      desiredHws.add(targetHwSig);
      toggleResults.push({
        alias,
        on: true
      });
    }
  }
  if (desiredHws.size === 0) throw new Error(_('Cannot disable the last active monitor.'));
  const newLogical = [];
  for (const slm of profile.logical_monitors) {
    const keptMons = [],
      lmHwSigs = [];
    for (const sm of slm.monitors) {
      if (desiredHws.has(sm.hw_sig) && sm.hw_sig in hwToConn) {
        keptMons.push([hwToConn[sm.hw_sig], sm.mode_id, buildMonitorProps(sm)]);
        lmHwSigs.push(sm.hw_sig);
      }
    }
    if (keptMons.length > 0) {
      newLogical.push([slm.x, slm.y, slm.scale, slm.transform, slm.primary, keptMons, lmHwSigs]);
    }
  }
  const repackedLogical = repackLogicalMonitors(newLogical, phys);
  await applyLayoutToDBus(serial, repackedLogical, livePrimaryHwSig, profilePrimaryHwSig);
  return toggleResults;
}
