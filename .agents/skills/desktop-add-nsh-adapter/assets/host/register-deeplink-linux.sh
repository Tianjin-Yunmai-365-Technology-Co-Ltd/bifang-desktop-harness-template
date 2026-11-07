#!/bin/sh
# Registers this packaged host for the current Linux user. Run from the extracted package directory.
set -eu
scheme='__SCHEME__'
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
host_path="$script_dir/bin/__HOST_EXE__"
test -f "$host_path" && test -x "$host_path" || { printf '%s\n' 'The packaged NSH host executable is missing.' >&2; exit 1; }
command -v xdg-mime >/dev/null 2>&1 || { printf '%s\n' 'xdg-mime is required to register a URL scheme.' >&2; exit 1; }
case "$host_path" in *'"'*|*'\'*|*'%'*|*'`'*|*'$'*|*[[:cntrl:]]*) printf '%s\n' 'Unsupported host path for a desktop entry.' >&2; exit 1;; esac
data_home=${XDG_DATA_HOME:-"$HOME/.local/share"}
case "$data_home" in /*) ;; *) printf '%s\n' 'XDG_DATA_HOME must be absolute.' >&2; exit 1;; esac
applications="$data_home/applications"
entry="$applications/$scheme.desktop"
mkdir -p -- "$applications"
umask 077
temporary_entry=$(mktemp "$applications/.$scheme.desktop.XXXXXXXX")
trap 'rm -f -- "$temporary_entry"' 0
trap 'exit 1' 1 2 3 15
{
  printf '%s\n' '[Desktop Entry]' 'Type=Application' 'Name=__HOST_EXE__' 'NoDisplay=true'
  printf 'Exec="%s" %%u\n' "$host_path"
  printf 'MimeType=x-scheme-handler/%s;\n' "$scheme"
  printf '%s\n' 'Terminal=false'
} > "$temporary_entry"
mv -fT -- "$temporary_entry" "$entry"
trap - 0 1 2 3 15
xdg-mime default "$scheme.desktop" "x-scheme-handler/$scheme"
printf 'Registered %s for the current user.\n' "$scheme"
