#!/usr/bin/env bash
set -euo pipefail

GREEN='\e[1;32m'
RED='\e[1;31m'
RESET='\e[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$EUID" -eq 0 ]]; then
    printf "%b:(%b\n" "$RED" "$RESET" >&2
    echo "Не используйте пользователя root." >&2
    echo "Введите команду: bash setup.sh" >&2
    exit 1
fi

# Установка обоев
SOURCE_WALLPAPER_DIR="$HOME/arch"
SYSTEM_WALLPAPER_DIR="/usr/local/share/backgrounds"
WALLPAPER_XML_DIR="/usr/share/gnome-background-properties"
WALLPAPER_XML="$WALLPAPER_XML_DIR/earth.xml"

sudo mkdir -p "$SYSTEM_WALLPAPER_DIR" "$WALLPAPER_XML_DIR"

wallpaper_entries=""
for wallpaper in earth.png mars.png digitalart.png white.png jonathancurrymacroleaves.png; do
    source_wallpaper="$SOURCE_WALLPAPER_DIR/$wallpaper"
    system_wallpaper="$SYSTEM_WALLPAPER_DIR/$wallpaper"

    if [[ ! -f "$source_wallpaper" ]]; then
        echo "Изображение $source_wallpaper не найдено, пропускаю..."
        continue
    fi

    sudo install -m 0644 "$source_wallpaper" "$system_wallpaper"
    wallpaper_name="${wallpaper%.png}"
    wallpaper_name="${wallpaper_name^}"
    wallpaper_entries+="  <wallpaper deleted=\"false\">\n"
    wallpaper_entries+="    <name>$wallpaper_name</name>\n"
    wallpaper_entries+="    <filename>$system_wallpaper</filename>\n"
    wallpaper_entries+="    <options>zoom</options>\n"
    wallpaper_entries+="    <shade_type>solid</shade_type>\n"
    wallpaper_entries+="    <pcolor>#000000</pcolor>\n"
    wallpaper_entries+="    <scolor>#000000</scolor>\n"
    wallpaper_entries+="  </wallpaper>\n"
done

if [[ -n "$wallpaper_entries" ]]; then
    sudo tee "$WALLPAPER_XML" > /dev/null <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE wallpapers SYSTEM "gnome-wp-list.dtd">
<wallpapers>
$(printf '%b' "$wallpaper_entries")
</wallpapers>
EOF
fi

if [[ -f "$SYSTEM_WALLPAPER_DIR/earth.png" ]]; then
    URI="file://$SYSTEM_WALLPAPER_DIR/earth.png"
    gsettings set org.gnome.desktop.background picture-uri "$URI"
    gsettings set org.gnome.desktop.background picture-uri-dark "$URI"
    gsettings set org.gnome.desktop.background picture-options "zoom"
fi

# Скрытие ненужных системных приложений
mkdir -p ~/.local/share/applications && \
for f in avahi-discover.desktop bssh.desktop bvnc.desktop qv4l2.desktop qvidcap.desktop; do
  if [[ -f "/usr/share/applications/$f" ]]; then
    cp "/usr/share/applications/$f" "$HOME/.local/share/applications/$f"
    if grep -q '^NoDisplay=' "$HOME/.local/share/applications/$f"; then
      sed -i 's/^NoDisplay=.*/NoDisplay=true/' "$HOME/.local/share/applications/$f"
    else
      printf '\nNoDisplay=true\n' >> "$HOME/.local/share/applications/$f"
    fi
    echo "hidden: $f"
  fi
done

# Установка пакетов и настройка системы
sudo pacman -S --needed --noconfirm gnome-shell-extension-appindicator libappindicator transmission-gtk
sudo pacman -S --needed --noconfirm gpu-screen-recorder-ui obsidian foliate btrfs-assistant

yay -S --needed --noconfirm brave-bin
yay -S --needed --noconfirm gnome-shell-extension-caffeine

yay -S --needed --noconfirm gnome-shell-extension-blur-my-shell
yay -S --needed --noconfirm gnome-shell-extension-dash-to-dock-git
yay -S --needed --noconfirm gnome-shell-extension-gsconnect
yay -S --needed --noconfirm gnome-shell-extension-clipboard-indicator

if ! timeout 120 yay -S --needed --noconfirm gnome-shell-extension-emoji-copy; then echo "Пропускаю установку пакета gnome-shell-extension-emoji-copy"; fi

sudo firewall-cmd --zone=public --add-service=kdeconnect --permanent && sudo systemctl restart firewalld

read -rp "Установить AmneziaVPN клиент? [Y/n]: " answer
if [[ "$answer" =~ ^[Yy]$ ]]; then
    yay -S --needed --noconfirm amneziavpn-bin
fi

read -rp "Установить Telegram? [Y/n]: " answer
if [[ "$answer" =~ ^[Yy]$ ]]; then
    sudo pacman -S --needed --noconfirm telegram-desktop
fi

read -rp "Установить Spotify? [Y/n]: " answer
if [[ "$answer" =~ ^[Yy]$ ]]; then
    sudo pacman -S --needed --noconfirm spotify-launcher
fi

read -rp "Установить Steam? [Y/n]: " answer
if [[ "$answer" =~ ^[Yy]$ ]]; then
    sudo pacman -S --needed --noconfirm steam steam-devices
fi

read -rp "Установить Lutris? [Y/n]: " answer
if [[ "$answer" =~ ^[Yy]$ ]]; then
    sudo pacman -S --needed --noconfirm lutris
fi

read -rp "Установить Syncthing? [Y/n]: " answer
if [[ "$answer" =~ ^[Yy]$ ]]; then
    sudo pacman --needed --noconfirm -S syncthing
    systemctl --user enable --now syncthing.service
fi

yay -S --needed --noconfirm sublime-text-4
yay -S --needed --noconfirm webtorrent-desktop-bin

read -rp "Установить пользовательский пак иконок kora? [Y/n]: " answer
if [[ "$answer" =~ ^[Yy]$ ]]; then
    yay -S --needed --noconfirm kora-icon-theme
    gsettings set org.gnome.desktop.interface icon-theme "kora"
fi

gsettings set org.gnome.desktop.wm.preferences button-layout ":minimize,maximize,close"
gsettings set org.gnome.desktop.input-sources xkb-options "['grp:alt_shift_toggle']"
gsettings set org.gnome.shell.keybindings show-screenshot-ui "['<Shift><Super>S','Print']"
gsettings set org.gnome.desktop.wm.keybindings show-desktop "['<Super>d']"
gsettings set org.gnome.desktop.peripherals.mouse accel-profile flat
gsettings set org.gnome.desktop.peripherals.keyboard delay 200
gsettings set org.gnome.desktop.peripherals.keyboard repeat-interval 20
gsettings set org.gnome.settings-daemon.plugins.media-keys volume-step 2

gsettings set org.gnome.settings-daemon.plugins.media-keys custom-keybindings "['/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/', '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom1/']"

gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/ name 'Ptyxis'
gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/ command 'ptyxis --new-window'
gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom0/ binding '<Super>c'

gsettings set org.gnome.settings-daemon.plugins.media-keys logout "['']"
gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom1/ name 'Resources'
gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom1/ command 'resources'
gsettings set org.gnome.settings-daemon.plugins.media-keys.custom-keybinding:/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/custom1/ binding '<Primary><Alt>Delete'

install -Dm644 "$SCRIPT_DIR/mpv.conf" "$HOME/.config/mpv/mpv.conf"
sudo install -Dm644 "$SCRIPT_DIR/ffmpegthumbnailer.thumbnailer" /usr/share/thumbnailers/ffmpegthumbnailer.thumbnailer
rm -rf "$HOME/.cache/thumbnails"

dconf load /org/gnome/shell/extensions/dash-to-dock/ < "$SCRIPT_DIR/dash-to-dock.conf"
dconf load /org/gnome/shell/extensions/blur-my-shell/ < "$SCRIPT_DIR/blur-my-shell.conf"
dconf load /org/gnome/shell/extensions/emoji-copy/ < "$SCRIPT_DIR/emoji-copy-settings.dconf"
dconf load /org/gnome/Ptyxis/ < "$SCRIPT_DIR/ptyxis.conf"

# Установка локальных расширений из сборки
LOCAL_EXTENSIONS_DIR="$HOME/.local/share/gnome-shell/extensions"
mkdir -p "$LOCAL_EXTENSIONS_DIR"
LOCAL_EXTENSION_UUIDS=()

shopt -s nullglob
for extension_dir in "$SCRIPT_DIR"/extensions/*@local; do
    extension_uuid="$(basename "$extension_dir")"
    destination="$LOCAL_EXTENSIONS_DIR/$extension_uuid"
    LOCAL_EXTENSION_UUIDS+=("$extension_uuid")

    if [[ ! -d "$destination" ]]; then
        cp -a "$extension_dir" "$destination"
    fi

    if [[ -d "$destination/schemas" ]] && command -v glib-compile-schemas >/dev/null 2>&1; then
        glib-compile-schemas "$destination/schemas"
    fi
done
shopt -u nullglob

read -rp "Установить магазин приложений? (gnome-software) [Y/n]: " answer
if [[ "$answer" =~ ^[Yy]$ ]]; then
    sudo pacman -S --noconfirm gnome-software
fi

EXTENSIONS=(
  "blur-my-shell@aunetx"
  "dash-to-dock@micxgx.gmail.com"
  "caffeine@patapon.info"
  "gsconnect@andyholmes.github.io"
  "appindicatorsupport@rgcjonas.gmail.com"
  "gpu-screen-recorder@dec05eba.com"
  "emoji-copy@felipeftn"
  "clipboard-indicator@tudmotu.com"
  "${LOCAL_EXTENSION_UUIDS[@]}"
)

mkdir -p ~/.config/autostart ~/.local/bin ~/.config/gnome-extension-bootstrap
printf '%s\n' "${EXTENSIONS[@]}" > ~/.config/gnome-extension-bootstrap/extensions.list

cat > ~/.local/bin/apply-gnome-extensions.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

sleep 8

LIST="$HOME/.config/gnome-extension-bootstrap/extensions.list"
[[ -f "$LIST" ]] || exit 0

mapfile -t EXTENSIONS < "$LIST"
current="$(gsettings get org.gnome.shell enabled-extensions 2>/dev/null || echo "@as []")"
enabled=()

if [[ "$current" != "@as []" ]]; then
    while IFS= read -r ext; do
        [[ -n "$ext" ]] && enabled+=("$ext")
    done < <(printf '%s\n' "$current" | grep -o "'[^']*'" | tr -d "'")
fi

for ext in "${EXTENSIONS[@]}"; do
    [[ -n "$ext" ]] || continue
    gnome-extensions info "$ext" >/dev/null 2>&1 || continue

    found=0
    for already in "${enabled[@]}"; do
        if [[ "$already" == "$ext" ]]; then
            found=1
            break
        fi
    done

    if [[ $found -eq 0 ]]; then
        enabled+=("$ext")
    fi
done

quoted=""
for ext in "${enabled[@]}"; do
    [[ -n "$quoted" ]] && quoted+=", "
    quoted+="'$ext'"
done

gsettings set org.gnome.shell enabled-extensions "[$quoted]"

rm -f "$HOME/.config/autostart/apply-gnome-extensions.desktop"
rm -f "$HOME/.local/bin/apply-gnome-extensions.sh"
EOF

chmod +x ~/.local/bin/apply-gnome-extensions.sh

cat > ~/.config/autostart/apply-gnome-extensions.desktop <<EOF
[Desktop Entry]
Type=Application
Name=Apply GNOME Extensions
Exec=$HOME/.local/bin/apply-gnome-extensions.sh
X-GNOME-Autostart-enabled=true
NoDisplay=true
EOF

# Удаление склонированного репозитория
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -d "$REPO_DIR/.git" && "$REPO_DIR" == "$HOME/"* ]]; then
    read -r -p "Почти закончили. Удалить следы установки? [Y/n]: " answer
    [[ "$answer" =~ ^[Yy]$ ]] && cd "$HOME" && sudo rm -rf "$REPO_DIR"
fi

printf "%b:)%b\n" "$GREEN" "$RESET"
echo "Установка завершена! Перезагрузите ПК."
