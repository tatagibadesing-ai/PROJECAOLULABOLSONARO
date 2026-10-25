#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
echo 'Observatório Presidencial — inicialização no seu computador'
if command -v node >/dev/null 2>&1 && node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)'; then
  exec node scripts/start-local.mjs "$@"
fi
if [ ! -x .runtime/node/bin/node ]; then
  case "$(uname -s)" in Darwin) task_os=darwin ;; Linux) task_os=linux ;; *) echo 'Sistema não suportado por este inicializador.'; exit 1 ;; esac
  case "$(uname -m)" in x86_64|amd64) task_arch=x64 ;; arm64|aarch64) task_arch=arm64 ;; *) echo 'Arquitetura não suportada. Instale Node.js 24 em nodejs.org.'; exit 1 ;; esac
  task_filename="node-v24.19.0-${task_os}-${task_arch}.tar.gz"
  task_expected=$(awk -v file="$task_filename" '$2 == file {print $1}' scripts/node-SHASUMS256.txt)
  if [ "${#task_expected}" -ne 64 ]; then echo 'Checksum oficial ausente. Download cancelado.'; exit 1; fi
  command -v curl >/dev/null 2>&1 || { echo 'Instale curl ou Node.js 24 para continuar.'; exit 1; }
  mkdir -p .runtime
  task_temp=$(mktemp -d .runtime/download.XXXXXX)
  trap 'rm -rf "$task_temp"' EXIT HUP INT TERM
  echo 'Baixando Node.js portátil oficial. A instalação do sistema será preservada.'
  curl --fail --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/v24.19.0/$task_filename" -o "$task_temp/$task_filename"
  if command -v sha256sum >/dev/null 2>&1; then
    task_actual=$(sha256sum "$task_temp/$task_filename" | awk '{print $1}')
  else
    task_actual=$(shasum -a 256 "$task_temp/$task_filename" | awk '{print $1}')
  fi
  if [ "$task_actual" != "$task_expected" ]; then echo 'SHA-256 diferente do manifesto oficial. Instalação cancelada.'; exit 1; fi
  tar -xzf "$task_temp/$task_filename" -C "$task_temp"
  mv "$task_temp/node-v24.19.0-${task_os}-${task_arch}" .runtime/node
  rm -rf "$task_temp"
  trap - EXIT HUP INT TERM
fi
PATH="$PWD/.runtime/node/bin:$PATH"
export PATH
exec node scripts/start-local.mjs "$@"
