import GObject from 'gi://GObject';
import St from 'gi://St';
export const CtrlButton = GObject.registerClass(class CtrlButton extends St.Button {
  _init(iconName, styleClass) {
    super._init({
      style_class: styleClass || 'pill-for-spotify-ctrl-button',
      reactive: true,
      can_focus: true,
      y_expand: true,
      child: new St.Icon({
        icon_name: iconName
      })
    });
    this._icon = this.child;
  }
  setIconName(iconName) {
    this._icon.icon_name = iconName;
  }
  setIconSize(size) {
    this._icon.icon_size = size;
  }
});
