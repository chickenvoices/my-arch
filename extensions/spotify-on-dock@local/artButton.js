import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
const RESIZE_MS = 220;
const SWAP_OUT_MS = 100;
const SWAP_IN_MS = 160;
export const ArtButton = GObject.registerClass(class ArtButton extends St.Button {
  _init() {
    super._init({
      style_class: 'pill-for-spotify-art',
      reactive: true,
      can_focus: true,
      x_expand: false,
      y_expand: false,
      y_align: Clutter.ActorAlign.CENTER,
      visible: false,
      opacity: 0
    });
    this._size = 0;
    this._prop = 'width';
    this._path = null;
  }
  setSize(size, vertical) {
    this._size = size;
    this._prop = vertical ? 'height' : 'width';
    this.remove_all_transitions();
    const shown = this._path !== null;
    this.set_size(vertical ? size : shown ? size : 0, vertical ? shown ? size : 0 : size);
    this.visible = shown;
    this.opacity = shown ? 255 : 0;
    this._applyStyle();
  }
  setArt(gicon) {
    const path = gicon && gicon.file ? gicon.file.get_path() || gicon.file.get_uri() : null;
    if (path === this._path) return;
    const hadArt = this._path !== null;
    this._path = path;
    this.remove_all_transitions();
    if (!path) {
      this._collapse();
    } else if (!hadArt || !this.visible) {
      this._applyStyle();
      this._expand();
    } else {
      this._swap();
    }
  }
  snapToFinalState() {
    this.remove_all_transitions();
    const shown = this._path !== null;
    this[this._prop] = shown ? this._size : 0;
    this.opacity = shown ? 255 : 0;
    this.visible = shown;
    this._applyStyle();
  }
  _expand() {
    this.visible = true;
    this.ease({
      [this._prop]: this._size,
      opacity: 255,
      duration: RESIZE_MS,
      mode: Clutter.AnimationMode.EASE_OUT_CUBIC
    });
  }
  _collapse() {
    this.ease({
      [this._prop]: 0,
      opacity: 0,
      duration: RESIZE_MS,
      mode: Clutter.AnimationMode.EASE_OUT_CUBIC,
      onStopped: finished => {
        if (finished && this._path === null) this.visible = false;
      }
    });
  }
  _swap() {
    this[this._prop] = this._size;
    this.ease({
      opacity: 0,
      duration: SWAP_OUT_MS,
      mode: Clutter.AnimationMode.EASE_IN_QUAD,
      onStopped: finished => {
        if (!finished) return;
        this._applyStyle();
        this.ease({
          opacity: 255,
          duration: SWAP_IN_MS,
          mode: Clutter.AnimationMode.EASE_OUT_QUAD
        });
      }
    });
  }
  _applyStyle() {
    const bg = this._path ? `background-image: url("${this._path}"); ` + 'background-size: cover; background-position: center;' : 'background-image: none;';
    this.set_style(bg);
  }
});
