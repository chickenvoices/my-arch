export const COMPACT_THRESHOLD = 32;
export const HIDDEN_THRESHOLD = 16;
export function isTooSmallToShow(iconSize) {
  return iconSize < HIDDEN_THRESHOLD;
}
export function isCompact(iconSize) {
  return iconSize < COMPACT_THRESHOLD;
}
export function artSize(orientation, iconSize) {
  if (orientation === 'horizontal') return iconSize;
  return Math.max(1, iconSize - 4);
}
export function controlIconSize(orientation, iconSize) {
  const compact = isCompact(iconSize);
  if (orientation === 'horizontal') {
    return compact ? Math.max(10, Math.round(iconSize * 0.55)) : Math.max(10, Math.round(iconSize * 0.34));
  }
  return compact ? Math.max(10, Math.round(iconSize * 0.6)) : Math.max(10, Math.round(iconSize * 0.42));
}
export function titleFontSize(iconSize) {
  return Math.max(9, Math.round(iconSize * 0.28));
}
export function artistFontSize(iconSize) {
  return Math.max(8, Math.round(iconSize * 0.24));
}
export function labelsWidth(iconSize) {
  return Math.round(Math.min(240, Math.max(110, iconSize * 3.4)));
}
