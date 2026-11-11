import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';
import { CtrlButton } from './ctrlButton.js';
import { ArtButton } from './artButton.js';
import * as metrics from './layoutMetrics.js';
const SHOW_MS = 300;
const RESIZE_MS = 260;
const TEXT_OUT_MS = 120;
const TEXT_IN_MS = 220;
const TEXT_SHIFT_PX = 6;
const BOX_PADDING_RIGHT = 6;
const LABELS_MARGIN_H = 14 + 10;
const VERTICAL_PADDING = 2 + 2;
const VERTICAL_SPACING = 6;
export const PillWidget = GObject.registerClass({
  Signals: {
    'play-pause-clicked': {},
    'next-clicked': {},
    'previous-clicked': {},
    'pill-clicked': {}
  }
}, class PillWidget extends St.Button {
  _init() {
    super._init({
      style_class: 'pill-for-spotify-container',
      reactive: true,
      can_focus: true,
      track_hover: true,
      visible: false,
      clip_to_allocation: true,
      width: 0,
      x_align: Clutter.ActorAlign.START,
      y_align: Clutter.ActorAlign.CENTER
    });
    this._orientation = 'horizontal';
    this._iconSize = 48;
    this._forceHidden = false;
    this._wantsShown = false;
    this._hiding = false;
    this._destroyed = false;
    this._shownText = {
      title: '',
      artist: ''
    };
    this._targetText = {
      title: '',
      artist: ''
    };
    this._textAnimating = false;
    this.connect('destroy', () => {
      this._destroyed = true;
    });
    this._buildActors();
    this._applyLayout();
  }
  _buildActors() {
    this._box = new St.BoxLayout({
      style_class: 'pill-for-spotify-box',
      x_expand: true,
      y_expand: true
    });
    this.set_child(this._box);
    this._art = new ArtButton();
    this._art.connect('clicked', () => this.emit('pill-clicked'));
    this._labelsBox = new St.BoxLayout({
      style_class: 'pill-for-spotify-labels',
      orientation: Clutter.Orientation.VERTICAL,
      y_align: Clutter.ActorAlign.CENTER,
      x_expand: true
    });
    this._titleLabel = new St.Label({
      style_class: 'pill-for-spotify-title',
      text: ''
    });
    this._titleLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
    this._artistLabel = new St.Label({
      style_class: 'pill-for-spotify-artist',
      text: ''
    });
    this._artistLabel.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
    this._labelsBox.add_child(this._titleLabel);
    this._labelsBox.add_child(this._artistLabel);
    this._labelsButton = new St.Button({
      style_class: 'pill-for-spotify-labels-button',
      reactive: true,
      child: this._labelsBox,
      clip_to_allocation: true,
      x_expand: true,
      y_expand: true
    });
    this._labelsButton.connect('clicked', () => this.emit('pill-clicked'));
    this._controlsBox = new St.BoxLayout({
      style_class: 'pill-for-spotify-controls',
      x_align: Clutter.ActorAlign.CENTER,
      y_align: Clutter.ActorAlign.CENTER,
      x_expand: false,
      y_expand: true
    });
    this._prevButton = new CtrlButton('media-skip-backward-symbolic');
    this._playPauseButton = new CtrlButton('media-playback-start-symbolic');
    this._nextButton = new CtrlButton('media-skip-forward-symbolic');
    this._prevButton.connect('clicked', () => this.emit('previous-clicked'));
    this._playPauseButton.connect('clicked', () => this.emit('play-pause-clicked'));
    this._nextButton.connect('clicked', () => this.emit('next-clicked'));
    this._controlsBox.add_child(this._prevButton);
    this._controlsBox.add_child(this._playPauseButton);
    this._controlsBox.add_child(this._nextButton);
    this.connect('clicked', () => this.emit('pill-clicked'));
  }
  _alive() {
    return !this._destroyed;
  }
  setTrackInfo(title, artist) {
    if (!this._alive()) return;
    this._targetText = {
      title: title || '',
      artist: artist || ''
    };
    if (this._sameText(this._targetText, this._shownText) && !this._textAnimating) return;
    if (!this.mapped || this._hiding) {
      this._snapText();
      return;
    }
    this._startTextTransition();
  }
  setPlaying(isPlaying) {
    if (!this._alive()) return;
    this._playPauseButton.setIconName(isPlaying ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic');
  }
  setArt(gicon) {
    if (!this._alive()) return;
    this._art.setArt(gicon);
  }
  _sameText(a, b) {
    return a.title === b.title && a.artist === b.artist;
  }
  _snapText() {
    this._labelsBox.remove_all_transitions();
    this._textAnimating = false;
    this._applyText(this._targetText);
    this._labelsBox.opacity = 255;
    this._labelsBox.translation_y = 0;
  }
  _applyText(text) {
    this._shownText = {
      ...text
    };
    this._titleLabel.text = text.title;
    this._artistLabel.text = text.artist;
  }
  _startTextTransition() {
    if (this._textAnimating) return;
    this._textAnimating = true;
    const box = this._labelsBox;
    box.ease({
      opacity: 0,
      translation_y: -TEXT_SHIFT_PX,
      duration: TEXT_OUT_MS,
      mode: Clutter.AnimationMode.EASE_IN_QUAD,
      onStopped: finished => {
        if (!finished) {
          this._textAnimating = false;
          return;
        }
        this._applyText(this._targetText);
        box.translation_y = TEXT_SHIFT_PX;
        box.ease({
          opacity: 255,
          translation_y: 0,
          duration: TEXT_IN_MS,
          mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
          onStopped: () => {
            this._textAnimating = false;
            if (!this._sameText(this._targetText, this._shownText) && this.mapped) this._startTextTransition();
          }
        });
      }
    });
  }
  setShown(shown) {
    if (!this._alive()) return;
    this._wantsShown = shown;
    if (shown && !this._forceHidden) this._animateIn();else this._animateOut();
  }
  _animateIn() {
    if (this.visible && !this._hiding) return;
    this._hiding = false;
    this.remove_all_transitions();
    this._snapText();
    this._art.snapToFinalState();
    const prop = this._growProp();
    this.visible = true;
    this.opacity = 0;
    this[prop] = 0;
    this.ease({
      opacity: 255,
      [prop]: this._fixedSize(),
      duration: SHOW_MS,
      mode: Clutter.AnimationMode.EASE_OUT_CUBIC
    });
  }
  _animateOut() {
    if (!this.visible || this._hiding) return;
    this._hiding = true;
    this.remove_all_transitions();
    this.ease({
      opacity: 0,
      [this._growProp()]: 0,
      duration: SHOW_MS,
      mode: Clutter.AnimationMode.EASE_IN_QUAD,
      onStopped: finished => {
        if (!finished) return;
        this.visible = false;
        this._hiding = false;
      }
    });
  }
  setDashMetrics(orientation, iconSize) {
    if (!this._alive()) return;
    this._orientation = orientation;
    this._iconSize = iconSize;
    const shouldForceHide = metrics.isTooSmallToShow(iconSize);
    const forceHideChanged = shouldForceHide !== this._forceHidden;
    this._forceHidden = shouldForceHide;
    if (shouldForceHide) {
      if (forceHideChanged) this._animateOut();
      return;
    }
    this._applyLayout();
    if (this.visible && !this._hiding) {
      this.ease({
        [this._growProp()]: this._fixedSize(),
        duration: RESIZE_MS,
        mode: Clutter.AnimationMode.EASE_OUT_CUBIC
      });
    }
    if (forceHideChanged && this._wantsShown) this._animateIn();
  }
  _applyLayout() {
    const horizontal = this._orientation === 'horizontal';
    const compact = metrics.isCompact(this._iconSize);
    this._box.orientation = horizontal ? Clutter.Orientation.HORIZONTAL : Clutter.Orientation.VERTICAL;
    this._box.remove_all_children();
    this._box[horizontal ? 'remove_style_class_name' : 'add_style_class_name']('vertical');
    this._art.setSize(metrics.artSize(this._orientation, this._iconSize), !horizontal);
    const ctrlSize = metrics.controlIconSize(this._orientation, this._iconSize);
    this._prevButton.setIconSize(ctrlSize);
    this._playPauseButton.setIconSize(ctrlSize);
    this._nextButton.setIconSize(ctrlSize);
    this._titleLabel.set_style(`font-size: ${metrics.titleFontSize(this._iconSize)}px;`);
    this._artistLabel.set_style(`font-size: ${metrics.artistFontSize(this._iconSize)}px;`);
    if (compact) {
      this._box.add_child(this._controlsBox);
    } else if (horizontal) {
      this._box.add_child(this._art);
      this._box.add_child(this._labelsButton);
      this._box.add_child(this._controlsBox);
    } else {
      this._box.add_child(this._art);
      this._box.add_child(this._controlsBox);
    }
    const showSkip = horizontal && !compact;
    this._prevButton.visible = showSkip;
    this._nextButton.visible = showSkip;
    if (horizontal) {
      this._art.x_align = Clutter.ActorAlign.START;
      this._art.y_align = Clutter.ActorAlign.CENTER;
      this._controlsBox.y_align = Clutter.ActorAlign.CENTER;
      this.x_align = Clutter.ActorAlign.START;
      this.y_align = Clutter.ActorAlign.CENTER;
      this.set_height(this._iconSize);
    } else {
      this._art.x_align = Clutter.ActorAlign.CENTER;
      this._art.y_align = Clutter.ActorAlign.START;
      this._controlsBox.y_align = Clutter.ActorAlign.START;
      this.x_align = Clutter.ActorAlign.CENTER;
      this.y_align = Clutter.ActorAlign.START;
      this.set_width(this._iconSize);
    }
  }
  _growProp() {
    return this._orientation === 'horizontal' ? 'width' : 'height';
  }
  _fixedSize() {
    const art = metrics.artSize(this._orientation, this._iconSize);
    const compact = metrics.isCompact(this._iconSize);
    if (this._orientation !== 'horizontal') {
      const [, controlsHeight] = this._controlsBox.get_preferred_height(-1);
      return Math.round(compact ? controlsHeight + VERTICAL_PADDING : art + controlsHeight + VERTICAL_PADDING + VERTICAL_SPACING);
    }
    const [, controlsWidth] = this._controlsBox.get_preferred_width(-1);
    if (compact) return Math.round(controlsWidth + BOX_PADDING_RIGHT);
    return Math.round(art + LABELS_MARGIN_H + metrics.labelsWidth(this._iconSize) + controlsWidth + BOX_PADDING_RIGHT);
  }
});
