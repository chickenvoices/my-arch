#!/usr/bin/env bash
set -euo pipefail

GREEN='\e[1;32m'
RED='\e[1;31m'
RESET='\e[0m'

if [[ "$EUID" -eq 0 ]]; then
    printf "%b:(%b\n" "$RED" "$RESET" >&2
    echo "Do not use the root user." >&2
    echo "Try this command: bash yay.sh" >&2
    exit 1
fi

sudo pacman -Syu --needed --noconfirm base-devel git

cd ..

cd Downloads

git clone https://aur.archlinux.org/yay.git

cd yay

makepkg -si

sudo pacman -Syu

cd ..

sudo rm -rf yay

cd ..

printf "%b:)%b\n" "$GREEN" "$RESET"
echo "Done!"
