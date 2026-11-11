#!/usr/bin/env bash
set -euo pipefail

GREEN='\e[1;32m'
RED='\e[1;31m'
RESET='\e[0m'

if [[ "$EUID" -ne 0 ]]; then
    printf "%b:(%b\n" "$RED" "$RESET" >&2
    echo "Use the root user." >&2
    echo "Try this command: sudo bash setup.sh" >&2
    exit 1
fi

read -rp "Install AMD or NVIDIA (only for RTX 20+ series) driver? [amd/nvidia]: " gpu_choice

case "$gpu_choice" in
    amd|AMD)
        sudo pacman -S --noconfirm vulkan-radeon mesa lib32-mesa lib32-vulkan-radeon
        ;;
    nvidia|NVIDIA)
        sudo pacman -S --noconfirm nvidia-open nvidia-utils
        ;;
    *)
        echo "Invalid choice, skipping..."
        echo "Install the drivers for your graphics card manually."
        ;;
esac

pacman -S --needed --noconfirm flatpak gdm gnome-shell

pacman -S --needed --noconfirm gnome-font-viewer gnome-logs gnome-disk-utility gnome-calculator ptyxis

pacman -S --needed --noconfirm gnome-calendar gnome-clocks resources gnome-control-center

pacman -S --needed --noconfirm gnome-browser-connector gnome-keyring snapshot baobab

pacman -S --needed --noconfirm qt6-wayland qt6-svg ffmpegthumbnailer power-profiles-daemon

pacman -S --needed --noconfirm geary mpv wine wine-gecko wine-mono

pacman -S --needed --noconfirm gvfs-smb gvfs-mtp gvfs-gphoto2 gvfs-goa qt6-base

systemctl enable gdm

sudo sed -i 's/^console-mode/#console-mode/' /boot/loader/loader.conf
sudo sed -i '/^timeout/d' /boot/loader/loader.conf
echo "timeout 1" | sudo tee -a /boot/loader/loader.conf > /dev/null

pacman -Syu --noconfirm

printf "%b:)%b\n" "$GREEN" "$RESET"
echo "Done! Reboot to apply the changes."
