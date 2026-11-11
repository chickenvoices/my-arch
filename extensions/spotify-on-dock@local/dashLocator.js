import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
const DASH_CONTAINER_NAME = 'dashtodockContainer';
const FAST_RETRY_INTERVAL_MS = 1500;
const MAX_FAST_RETRIES = 20;
const SLOW_RETRY_INTERVAL_MS = 30000;
function findActorsByName(root, name, results, depth = 0) {
  if (depth > 12 || !root) return;
  if (root.name === name) results.push(root);
  const children = root.get_children ? root.get_children() : [];
  for (const child of children) findActorsByName(child, name, results, depth + 1);
}
function findAllDashToDockContainers() {
  const roots = [Main.layoutManager.uiGroup, Main.layoutManager._backgroundGroup].filter(Boolean);
  const results = [];
  const seen = new Set();
  for (const root of roots) {
    const found = [];
    findActorsByName(root, DASH_CONTAINER_NAME, found);
    for (const actor of found) {
      if (!seen.has(actor)) {
        seen.add(actor);
        results.push(actor);
      }
    }
  }
  return results;
}
function findIconsBox(dashContainer) {
  const dashActors = [];
  findActorsByName(dashContainer, 'dash', dashActors);
  const dashActor = dashActors[0];
  if (!dashActor) return dashContainer;
  const candidates = [];
  const stack = [...(dashActor.get_children ? dashActor.get_children() : [])];
  while (stack.length > 0) {
    const actor = stack.shift();
    if (actor instanceof St.BoxLayout) candidates.push(actor);
    if (actor.get_children) stack.push(...actor.get_children());
  }
  for (const box of candidates) {
    const hasIcons = box.get_children().some(child => {
      const styleClass = child.get_style_class_name?.() || '';
      return styleClass.includes('dash-item-container') || styleClass.includes('app-well-app');
    });
    if (hasIcons) return box;
  }
  return candidates[0] || dashContainer;
}
export function waitForAllDashToDocks(onFound) {
  let retries = 0;
  let sourceId = 0;
  let cancelled = false;
  const seen = new Set();
  const tryFind = () => {
    if (cancelled) return GLib.SOURCE_REMOVE;
    for (const container of findAllDashToDockContainers()) {
      if (seen.has(container)) continue;
      seen.add(container);
      onFound(container, findIconsBox(container));
    }
    retries++;
    if (retries === MAX_FAST_RETRIES) {
      sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SLOW_RETRY_INTERVAL_MS, tryFind);
      return GLib.SOURCE_REMOVE;
    }
    return GLib.SOURCE_CONTINUE;
  };
  sourceId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FAST_RETRY_INTERVAL_MS, tryFind);
  tryFind();
  return () => {
    cancelled = true;
    if (sourceId) {
      GLib.source_remove(sourceId);
      sourceId = 0;
    }
  };
}
