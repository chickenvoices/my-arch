import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import Shell from 'gi://Shell';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
const DISSOLVE_DURATION = 420;
const BANNER_FADE_DURATION = 260;
const CARD_WIDTH = 420;
const CARD_SCREEN_MARGIN = 16;
const MAX_BODY_CHARS = 120;
const NOTIFICATION_LIFETIME_MS = 10000;
const STACK_PEEK_PX = 10;
const STACK_MAX_PLATES = 4;
const STACK_PLATE_SHRINK = 0.04;
const STACK_CARD_GAP = 10;
const STACK_RELAYOUT_DURATION = 220;
const CLOSE_BUTTON_FADE_DURATION = 120;
const CLOSE_BUTTON_REARM_DELAY = STACK_RELAYOUT_DURATION + 300;
const CARD_PADDING_H = 16;
const ICON_SIZE = 32;
const ICON_TEXT_SPACING = 12;
const CARD_RADIUS = 14;
const CLOSE_ICON_SIZE = 10;
const CLOSE_BUTTON_OVERHANG = 7;
const MAX_ACTIONS = 3;
const GSCONNECT_APP_ID = 'org.gnome.Shell.Extensions.GSConnect';
const GSCONNECT_APP_PATH = '/org/gnome/Shell/Extensions/GSConnect';
const SHADOW_LAYERS = [{
  offsetY: 12,
  blur: 30,
  alpha: 0.36
}, {
  offsetY: 2,
  blur: 6,
  alpha: 0.25
}];
const SHADOW_PAD = Math.max(...SHADOW_LAYERS.map(l => l.offsetY + l.blur)) + 4;
function truncateText(text, maxChars) {
  if (!text || text.length <= maxChars) return text ?? '';
  return `${text.slice(0, maxChars)}…`;
}
function setMarkupOrPlainText(clutterText, text) {
  if (!text) {
    clutterText.set_text('');
    return;
  }
  let escaped = text.replace(/&(?!amp;|quot;|apos;|lt;|gt;)/g, '&amp;');
  escaped = escaped.replace(/<(?!\/?[biu]>)/g, '&lt;');
  try {
    Pango.parse_markup(escaped, -1, '');
    clutterText.set_markup(escaped);
  } catch (e) {
    clutterText.set_use_markup(false);
    clutterText.set_text(text);
  }
}
function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-z * z);
  return x >= 0 ? y : 2 - y;
}
function roundedRect(cr, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (w <= 0 || h <= 0) return;
  cr.newSubPath();
  cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
  cr.closePath();
}
function drawSoftShadow(cr, x, y, w, h, radius, {
  offsetY,
  blur,
  alpha
}) {
  const sigma = Math.max(1, blur / 2);
  const coverage = d => alpha * 0.5 * erfc(d / (sigma * Math.SQRT2));
  for (let e = blur; e >= -blur; e--) {
    const outer = e === blur ? 0 : coverage(e + 1);
    const a = 1 - (1 - coverage(e)) / (1 - outer);
    if (a <= 0) continue;
    cr.setSourceRGBA(0, 0, 0, a);
    roundedRect(cr, x - e, y - e + offsetY, w + 2 * e, h + 2 * e, radius + e);
    cr.fill();
  }
}
function paintCardShadow(area) {
  const cr = area.get_context();
  const [w, h] = area.get_surface_size();
  const cardW = w - 2 * SHADOW_PAD;
  const cardH = h - 2 * SHADOW_PAD;
  if (cardW > 0 && cardH > 0) {
    for (const layer of SHADOW_LAYERS) drawSoftShadow(cr, SHADOW_PAD, SHADOW_PAD, cardW, cardH, CARD_RADIUS, layer);
    cr.setOperator(0);
    roundedRect(cr, SHADOW_PAD, SHADOW_PAD, cardW, cardH, CARD_RADIUS);
    cr.fill();
  }
  cr.$dispose();
}
const ShadowedCard = GObject.registerClass(class ShadowedCard extends St.Widget {
  _init(content, params) {
    super._init(params);
    this._shadow = new St.DrawingArea({
      reactive: false
    });
    this._shadow.connect('repaint', paintCardShadow);
    this._content = content;
    this.add_child(this._shadow);
    this.add_child(content);
  }
  setOverlapping(overlapping) {
    if (overlapping) this._content.add_style_class_name('overlapping');else this._content.remove_style_class_name('overlapping');
  }
  vfunc_get_preferred_width(forHeight) {
    return this._content.get_preferred_width(forHeight);
  }
  vfunc_get_preferred_height(forWidth) {
    return this._content.get_preferred_height(forWidth);
  }
  vfunc_allocate(box) {
    this.set_allocation(box);
    const w = box.get_width();
    const h = box.get_height();
    const contentBox = new Clutter.ActorBox();
    contentBox.set_origin(0, 0);
    contentBox.set_size(w, h);
    this._content.allocate(contentBox);
    const shadowBox = new Clutter.ActorBox();
    shadowBox.set_origin(-SHADOW_PAD, -SHADOW_PAD);
    shadowBox.set_size(w + 2 * SHADOW_PAD, h + 2 * SHADOW_PAD);
    this._shadow.allocate(shadowBox);
  }
});
function fadeIn(card) {
  card.opacity = 0;
  card.show();
  card.ease({
    opacity: 255,
    duration: BANNER_FADE_DURATION,
    mode: Clutter.AnimationMode.EASE_OUT_QUAD
  });
}
function fadeOut(card, onComplete) {
  card.ease({
    opacity: 0,
    duration: DISSOLVE_DURATION,
    mode: Clutter.AnimationMode.EASE_IN_QUAD,
    onComplete: () => onComplete?.()
  });
}
function sendGSConnectReply(notification, text) {
  const target = new GLib.Variant('(ssbv)', [notification.deviceId, 'replyNotification', true, new GLib.Variant('(ssa{ss})', [notification.requestReplyId, text, {}])]);
  const platformData = {
    'desktop-startup-id': GLib.Variant.new('s', `_TIME${global.get_current_time()}`)
  };
  Gio.DBus.session.call(GSCONNECT_APP_ID, GSCONNECT_APP_PATH, 'org.freedesktop.Application', 'ActivateAction', GLib.Variant.new('(sava{sv})', ['device', [target], platformData]), null, Gio.DBusCallFlags.NO_AUTO_START, -1, null, (connection, res) => {
    try {
      connection.call_finish(res);
    } catch (e) {
      logError(e, 'wide-notifications: GSConnect reply failed');
    }
  });
}
function buildGSConnectReplyButton(card, notification, actionsBox, content) {
  const button = new St.Button({
    style_class: 'wide-notifications-action',
    label: 'Ответить',
    x_expand: true,
    can_focus: true
  });
  button.connect('clicked', () => {
    const entry = new St.Entry({
      style_class: 'wide-notifications-reply',
      hint_text: 'Сообщение…',
      can_focus: true,
      x_expand: true
    });
    actionsBox.hide();
    content.add_child(entry);
    card.isReplying = true;
    const grab = Main.pushModal(card, {
      actionMode: Shell.ActionMode.POPUP
    });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      card.isReplying = false;
      Main.popModal(grab);
      try {
        entry.destroy();
        actionsBox.show();
      } catch {}
    };
    entry.clutter_text.connect('activate', () => {
      const text = entry.get_text();
      if (!text) return;
      sendGSConnectReply(notification, text);
      finish();
      notification.destroy(MessageTray.NotificationDestroyedReason.DISMISSED);
    });
    entry.clutter_text.connect('key-press-event', (_actor, event) => {
      if (event.get_key_symbol() === Clutter.KEY_Escape) {
        finish();
        return Clutter.EVENT_STOP;
      }
      return Clutter.EVENT_PROPAGATE;
    });
    entry.connect('destroy', () => finish());
    entry.grab_key_focus();
  });
  return button;
}
function buildCard(notification) {
  const content = new St.BoxLayout({
    style_class: 'wide-notifications-card',
    orientation: Clutter.Orientation.VERTICAL
  });
  const card = new ShadowedCard(content, {
    width: CARD_WIDTH,
    reactive: true,
    track_hover: true
  });
  card.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS_FOR_OPACITY);
  const row = new St.BoxLayout({
    style_class: 'wide-notifications-row',
    x_expand: true
  });
  const icon = new St.Icon({
    style_class: 'wide-notifications-icon',
    icon_size: ICON_SIZE,
    y_align: Clutter.ActorAlign.START,
    visible: false
  });
  row.add_child(icon);
  const textWidth = () => CARD_WIDTH - CARD_PADDING_H * 2 - (icon.visible ? ICON_SIZE + ICON_TEXT_SPACING : 0);
  const textBox = new St.BoxLayout({
    style_class: 'wide-notifications-textbox',
    orientation: Clutter.Orientation.VERTICAL,
    x_expand: true
  });
  const title = new St.Label({
    style_class: 'wide-notifications-title',
    x_expand: true
  });
  title.clutter_text.set_line_wrap(true);
  title.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
  const body = new St.Label({
    style_class: 'wide-notifications-bodytext',
    x_expand: true
  });
  body.clutter_text.set_line_wrap(true);
  body.clutter_text.set_line_wrap_mode(Pango.WrapMode.WORD_CHAR);
  body.clutter_text.set_ellipsize(Pango.EllipsizeMode.NONE);
  const applyWidths = () => {
    const w = textWidth();
    textBox.set_width(w);
    title.clutter_text.set_width(w);
    title.set_width(w);
    body.clutter_text.set_width(w);
    body.set_width(w);
  };
  const refreshIcon = () => {
    const gicon = notification.gicon ?? notification.source?.icon ?? null;
    icon.visible = !!gicon;
    if (gicon) icon.set_gicon(gicon);
    applyWidths();
  };
  const refreshTitle = () => setMarkupOrPlainText(title.clutter_text, notification.title ?? '');
  const refreshBody = () => setMarkupOrPlainText(body.clutter_text, truncateText(notification.body ?? notification.bannerBodyText ?? '', MAX_BODY_CHARS));
  refreshIcon();
  refreshTitle();
  refreshBody();
  applyWidths();
  textBox.add_child(title);
  textBox.add_child(body);
  row.add_child(textBox);
  const clickArea = new St.Button({
    style_class: 'wide-notifications-clickarea',
    child: row,
    x_expand: true,
    can_focus: true
  });
  content.add_child(clickArea);
  card.clickArea = clickArea;
  const actionsBox = new St.BoxLayout({
    style_class: 'wide-notifications-actions',
    x_expand: true,
    visible: false
  });
  const refreshActions = () => {
    actionsBox.destroy_all_children();
    const actions = (notification.actions ?? []).slice(0, MAX_ACTIONS);
    for (const action of actions) {
      const button = new St.Button({
        style_class: 'wide-notifications-action',
        label: action.label,
        x_expand: true,
        can_focus: true
      });
      button.connect('notify::pressed', () => {
        if (button.pressed) console.log(`wide-notifications: action "${action.label}" pressed`);
      });
      button.connect('clicked', () => {
        console.log(`wide-notifications: action "${action.label}" clicked`);
        try {
          action.activate();
        } catch (e) {
          logError(e, 'wide-notifications: action.activate() failed');
        }
      });
      actionsBox.add_child(button);
    }
    if (notification.requestReplyId !== undefined && notification.deviceId) actionsBox.add_child(buildGSConnectReplyButton(card, notification, actionsBox, content));
    actionsBox.visible = actionsBox.get_n_children() > 0;
  };
  refreshActions();
  content.add_child(actionsBox);
  card.actionsBox = actionsBox;
  card.isReplying = false;
  const signalIds = [notification.connect('notify::title', refreshTitle), notification.connect('notify::body', refreshBody), notification.connect('notify::gicon', refreshIcon), notification.connect('action-added', refreshActions), notification.connect('action-removed', refreshActions)];
  card.notificationGone = false;
  card.connect('destroy', () => {
    if (card.notificationGone) return;
    for (const id of signalIds) notification.disconnect(id);
  });
  return card;
}
class CardStack {
  constructor(parentContainer, onPlateClicked) {
    this._parent = parentContainer;
    this._onPlateClicked = onPlateClicked;
    this._cards = [];
    this._plates = [];
    this._expanded = false;
  }
  get count() {
    return this._cards.length;
  }
  get isExpanded() {
    return this._expanded;
  }
  isFrontCard(card) {
    if (this._expanded) return this._cards.includes(card);
    return this._cards[this._cards.length - 1] === card;
  }
  add(card) {
    this._cards.push(card);
    this._expanded = false;
    this.relayout();
  }
  remove(card) {
    this._cards = this._cards.filter(c => c !== card);
    if (this._cards.length < 2) this._expanded = false;
    this.relayout();
  }
  expand() {
    if (this._expanded || this._cards.length < 2) return;
    this._expanded = true;
    this.relayout();
  }
  collapse() {
    if (!this._expanded) return;
    this._expanded = false;
    this.relayout();
  }
  static origin(monitor) {
    const panelHeight = Main.panel?.height ?? 32;
    return {
      baseX: monitor.x + monitor.width - CARD_WIDTH - CARD_SCREEN_MARGIN,
      baseY: monitor.y + panelHeight + CARD_SCREEN_MARGIN
    };
  }
  static _naturalHeight(card) {
    const [, h] = card.get_preferred_height(CARD_WIDTH);
    return h > 0 ? h : 80;
  }
  _createPlate(baseX, baseY, height) {
    const plate = new ShadowedCard(new St.Widget({
      style_class: 'wide-notifications-card wide-notifications-plate'
    }), {
      width: CARD_WIDTH,
      height,
      reactive: true,
      x: baseX,
      y: baseY,
      opacity: 0
    });
    plate.set_pivot_point(0.5, 1);
    const click = new Clutter.ClickGesture();
    click.connect('recognize', () => this._onPlateClicked?.());
    plate.add_action(click);
    this._parent.add_child(plate);
    return plate;
  }
  _syncPlates(wanted, baseX, baseY, frontHeight) {
    while (this._plates.length > wanted) {
      const plate = this._plates.pop();
      plate.ease({
        y: baseY,
        scale_x: 1,
        scale_y: 1,
        opacity: 0,
        duration: STACK_RELAYOUT_DURATION,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onStopped: () => plate.destroy()
      });
    }
    while (this._plates.length < wanted) this._plates.push(this._createPlate(baseX, baseY, frontHeight));
    this._plates.forEach((plate, i) => {
      const level = i + 1;
      plate.set_height(frontHeight);
      plate.ease({
        x: baseX,
        y: baseY + level * STACK_PEEK_PX,
        scale_x: 1 - level * STACK_PLATE_SHRINK,
        scale_y: 1 - level * STACK_PLATE_SHRINK,
        opacity: 255 - (level - 1) * 40,
        duration: STACK_RELAYOUT_DURATION,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD
      });
    });
  }
  relayout(monitor = Main.layoutManager.primaryMonitor) {
    if (!monitor) return;
    const {
      baseX,
      baseY
    } = CardStack.origin(monitor);
    const ordered = [...this._cards].reverse();
    if (!this._expanded) {
      const front = ordered[0];
      const frontHeight = front ? CardStack._naturalHeight(front) : 80;
      const plateCount = Math.min(Math.max(ordered.length - 1, 0), STACK_MAX_PLATES);
      this._syncPlates(plateCount, baseX, baseY, frontHeight);
      ordered.forEach((card, index) => {
        const isFront = index === 0;
        card.setOverlapping(!isFront ? false : ordered.length > 1);
        card.set_pivot_point(0.5, 0);
        card.visible = isFront;
        card.ease({
          x: baseX,
          y: baseY,
          scale_x: 1,
          scale_y: 1,
          duration: STACK_RELAYOUT_DURATION,
          mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
      });
      for (let i = this._plates.length - 1; i >= 0; i--) this._parent.set_child_above_sibling(this._plates[i], null);
      if (front) this._parent.set_child_above_sibling(front, null);
    } else {
      this._syncPlates(0, baseX, baseY, 80);
      let y = baseY;
      for (const card of ordered) {
        card.setOverlapping(false);
        card.visible = true;
        card.set_pivot_point(0.5, 0);
        const height = CardStack._naturalHeight(card);
        card.ease({
          x: baseX,
          y,
          scale_x: 1,
          scale_y: 1,
          duration: STACK_RELAYOUT_DURATION,
          mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
        y += height + STACK_CARD_GAP;
        this._parent.set_child_above_sibling(card, null);
      }
    }
  }
  destroy() {
    for (const card of this._cards) card.destroy();
    for (const plate of this._plates) plate.destroy();
    this._cards = [];
    this._plates = [];
    this._expanded = false;
  }
}
class CloseButton {
  constructor(card, stack, onDismiss) {
    this._card = card;
    this._stack = stack;
    this._onDismiss = onDismiss;
    this._revealTimeoutId = null;
    this._revealArmed = true;
    this.actor = new St.Button({
      style_class: 'wide-notifications-close',
      child: new St.Icon({
        icon_name: 'window-close-symbolic',
        icon_size: CLOSE_ICON_SIZE
      }),
      reactive: true,
      opacity: 0,
      visible: false
    });
    Main.layoutManager.uiGroup.add_child(this.actor);
    this.actor.add_constraint(new Clutter.BindConstraint({
      source: card,
      coordinate: Clutter.BindCoordinate.X,
      offset: -CLOSE_BUTTON_OVERHANG
    }));
    this.actor.add_constraint(new Clutter.BindConstraint({
      source: card,
      coordinate: Clutter.BindCoordinate.Y,
      offset: -CLOSE_BUTTON_OVERHANG
    }));
    card.track_hover = true;
    card.connect('notify::hover', () => this.update());
    this.actor.track_hover = true;
    this.actor.connect('notify::hover', () => this.update());
    this.actor.connect('clicked', () => this._onDismiss());
  }
  _isPointerOverCardOrButton() {
    const [x, y] = global.get_pointer();
    const actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
    return !!actor && (actor === this.actor || this._card.contains(actor));
  }
  update() {
    const isFront = this._stack.isFrontCard(this._card);
    this.actor.reactive = isFront;
    const shouldShow = this._revealArmed && isFront && this._isPointerOverCardOrButton();
    this._setVisible(shouldShow);
  }
  rearm() {
    if (this._revealTimeoutId) {
      GLib.source_remove(this._revealTimeoutId);
      this._revealTimeoutId = null;
    }
    this._revealArmed = false;
    this.actor.reactive = false;
    this._setVisible(false, {
      immediate: true
    });
    this._revealTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, CLOSE_BUTTON_REARM_DELAY, () => {
      this._revealTimeoutId = null;
      this._revealArmed = true;
      this.update();
      return GLib.SOURCE_REMOVE;
    });
  }
  _setVisible(visible, {
    immediate = false
  } = {}) {
    if (visible) Main.layoutManager.uiGroup.set_child_above_sibling(this.actor, null);
    if (immediate) {
      this.actor.opacity = visible ? 255 : 0;
      this.actor.visible = visible;
      return;
    }
    this.actor.visible = true;
    this.actor.ease({
      opacity: visible ? 255 : 0,
      duration: CLOSE_BUTTON_FADE_DURATION,
      mode: Clutter.AnimationMode.EASE_OUT_QUAD,
      onComplete: () => {
        this.actor.visible = visible;
      }
    });
  }
  dismiss() {
    this.actor.ease({
      opacity: 0,
      duration: DISSOLVE_DURATION,
      mode: Clutter.AnimationMode.EASE_IN_QUAD
    });
  }
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    if (this._revealTimeoutId) {
      GLib.source_remove(this._revealTimeoutId);
      this._revealTimeoutId = null;
    }
    this.actor.destroy();
  }
}
export default class WideNotificationsExtension extends Extension {
  enable() {
    this._cardForNotification = new Map();
    this._closeButtons = new Set();
    this._sourceAddedId = null;
    this._holdBannerBlocked();
    try {
      this._injectStylesheet();
    } catch (e) {
      logError(e, 'wide-notifications: stylesheet failed');
    }
    try {
      this._createOutsideClickCatcher();
    } catch (e) {
      logError(e, 'wide-notifications: outside-click catcher failed');
    }
    this._stack = new CardStack(Main.layoutManager.uiGroup, () => {
      this._stack?.expand();
      this._afterStackChange();
    });
    try {
      this._connectTray();
    } catch (e) {
      logError(e, 'wide-notifications: tray connect failed');
    }
  }
  disable() {
    if (this._monitorsChangedId) {
      Main.layoutManager.disconnect(this._monitorsChangedId);
      this._monitorsChangedId = null;
    }
    if (this._outsideClickCatcher) {
      this._outsideClickCatcher.destroy();
      this._outsideClickCatcher = null;
    }
    this._releaseBannerBlocked();
    if (this._sourceAddedId) {
      Main.messageTray.disconnect(this._sourceAddedId);
      this._sourceAddedId = null;
    }
    if (this._perSourceIds) {
      for (const [source, ids] of this._perSourceIds) {
        for (const id of ids) source.disconnect(id);
      }
      this._perSourceIds = null;
    }
    this._removeStylesheet();
    for (const closeButton of this._closeButtons ?? []) closeButton.destroy();
    this._closeButtons?.clear();
    this._closeButtons = null;
    this._stack?.destroy();
    this._stack = null;
    this._cardForNotification = null;
    this._notificationSettings = null;
  }
  _holdBannerBlocked() {
    try {
      const tray = Main.messageTray;
      const proto = Object.getPrototypeOf(tray);
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'bannerBlocked');
      this._originalBannerBlockedDescriptor = descriptor;
      this._trayForBannerBlocked = tray;
      if (descriptor?.set) {
        const originalSet = descriptor.set.bind(tray);
        Object.defineProperty(tray, 'bannerBlocked', {
          configurable: true,
          get: descriptor.get ? descriptor.get.bind(tray) : () => true,
          set: () => originalSet(true)
        });
        originalSet(true);
      } else {
        tray.bannerBlocked = true;
        log('wide-notifications: bannerBlocked has no setter on this GNOME version');
      }
    } catch (e) {
      logError(e, 'wide-notifications: failed to hold bannerBlocked');
    }
  }
  _releaseBannerBlocked() {
    if (!this._trayForBannerBlocked || !this._originalBannerBlockedDescriptor) return;
    try {
      Object.defineProperty(this._trayForBannerBlocked, 'bannerBlocked', this._originalBannerBlockedDescriptor);
      this._trayForBannerBlocked.bannerBlocked = false;
    } catch (e) {
      logError(e, 'wide-notifications: failed to restore bannerBlocked');
    }
    this._trayForBannerBlocked = null;
    this._originalBannerBlockedDescriptor = null;
  }
  _injectStylesheet() {
    const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
    const cssFile = this.dir.get_child('stylesheet.css');
    theme.load_stylesheet(cssFile);
    this._stylesheet = cssFile;
  }
  _removeStylesheet() {
    if (this._stylesheet) {
      const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
      theme.unload_stylesheet(this._stylesheet);
      this._stylesheet = null;
    }
  }
  _createOutsideClickCatcher() {
    this._outsideClickCatcher = new St.Widget({
      reactive: false,
      visible: false
    });
    Main.layoutManager.uiGroup.add_child(this._outsideClickCatcher);
    const catcherClick = new Clutter.ClickGesture();
    catcherClick.connect('recognize', () => {
      this._stack?.collapse();
      this._afterStackChange();
    });
    this._outsideClickCatcher.add_action(catcherClick);
    const syncCatcherSize = () => {
      const monitor = Main.layoutManager.primaryMonitor;
      if (monitor && this._outsideClickCatcher) {
        this._outsideClickCatcher.set_position(monitor.x, monitor.y);
        this._outsideClickCatcher.set_size(monitor.width, monitor.height);
      }
    };
    syncCatcherSize();
    this._monitorsChangedId = Main.layoutManager.connect('monitors-changed', syncCatcherSize);
  }
  _syncOutsideClickCatcherState() {
    if (!this._outsideClickCatcher || !this._stack) return;
    this._outsideClickCatcher.reactive = this._stack.isExpanded;
    this._outsideClickCatcher.visible = this._stack.isExpanded;
  }
  _afterStackChange() {
    this._syncOutsideClickCatcherState();
    for (const closeButton of this._closeButtons ?? []) closeButton.rearm();
  }
  _connectTray() {
    this._perSourceIds = new Map();
    this._sourceAddedId = Main.messageTray.connect('source-added', (tray, source) => {
      this._watchSource(source);
    });
    if (typeof Main.messageTray.getSources === 'function') {
      for (const source of Main.messageTray.getSources()) this._watchSource(source);
    }
  }
  _watchSource(source) {
    if (this._perSourceIds.has(source)) return;
    const requestId = source.connect('notification-request-banner', (_source, notification) => {
      if (this._shouldShowBanner(notification)) this._showCustomBanner(notification);
    });
    const destroyId = source.connect('destroy', () => {
      this._perSourceIds?.delete(source);
    });
    this._perSourceIds.set(source, [requestId, destroyId]);
  }
  _shouldShowBanner(notification) {
    if (notification.acknowledged) return false;
    if (notification.urgency === MessageTray.Urgency.LOW) return false;
    if (!this._notificationSettings) this._notificationSettings = new Gio.Settings({
      schema_id: 'org.gnome.desktop.notifications'
    });
    const systemShowBanners = this._notificationSettings.get_boolean('show-banners');
    const isCritical = notification.urgency === MessageTray.Urgency.CRITICAL;
    if (!systemShowBanners && !isCritical) return false;
    const policy = notification.source?.policy ?? notification.policy;
    if (policy?.enable === false) return false;
    if (policy?.showBanners === false && !isCritical) return false;
    return true;
  }
  _showCustomBanner(notification) {
    try {
      if (!this._stack) return;
      notification.acknowledged = true;
      try {
        notification.playSound();
      } catch (e) {
        logError(e, 'wide-notifications: playSound() failed');
      }
      const existing = this._cardForNotification.get(notification);
      if (existing) {
        existing.restartTimer();
        return;
      }
      const card = buildCard(notification);
      Main.layoutManager.uiGroup.add_child(card);
      let dismissed = false;
      const dismiss = () => {
        if (dismissed) return;
        dismissed = true;
        this._closeButtons?.delete(closeButton);
        closeButton.dismiss();
        fadeOut(card, () => card.destroy());
        if (this._cardForNotification?.get(notification)?.card === card) this._cardForNotification.delete(notification);
        this._stack?.remove(card);
        this._afterStackChange();
      };
      const closeButton = new CloseButton(card, this._stack, dismiss);
      this._closeButtons.add(closeButton);
      card.connect('destroy', () => closeButton.destroy());
      const entry = {
        card,
        notification,
        dismiss,
        restartTimer: () => {}
      };
      this._cardForNotification.set(notification, entry);
      const relayoutIds = [notification.connect('notify::title', () => this._stack?.relayout()), notification.connect('notify::body', () => this._stack?.relayout()), notification.connect('action-added', () => this._stack?.relayout()), notification.connect('action-removed', () => this._stack?.relayout())];
      card.connect('destroy', () => {
        if (card.notificationGone) return;
        for (const id of relayoutIds) notification.disconnect(id);
      });
      this._stack.add(card);
      this._afterStackChange();
      fadeIn(card);
      const isPersistent = notification.resident || notification.urgency === MessageTray.Urgency.CRITICAL;
      if (!isPersistent) {
        let timeoutId = 0;
        const arm = delay => {
          timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
            timeoutId = 0;
            if (card.hover || card.isReplying) arm(1500);else dismiss();
            return GLib.SOURCE_REMOVE;
          });
        };
        arm(NOTIFICATION_LIFETIME_MS);
        entry.restartTimer = () => {
          if (timeoutId) GLib.source_remove(timeoutId);
          arm(NOTIFICATION_LIFETIME_MS);
        };
        card.connect('destroy', () => {
          if (timeoutId) GLib.source_remove(timeoutId);
          timeoutId = 0;
        });
      }
      card.clickArea.connect('clicked', () => {
        if (card.isReplying) return;
        if (!this._stack.isExpanded && this._stack.count > 1) {
          this._stack.expand();
          this._afterStackChange();
          return;
        }
        try {
          notification.activate();
        } catch (e) {
          logError(e, 'wide-notifications: notification.activate() failed');
        }
        dismiss();
      });
      const destroyId = notification.connect('destroy', () => {
        card.notificationGone = true;
        dismiss();
      });
      card.connect('destroy', () => {
        if (!card.notificationGone) notification.disconnect(destroyId);
      });
    } catch (e) {
      logError(e, 'wide-notifications: _showCustomBanner failed');
    }
  }
}
