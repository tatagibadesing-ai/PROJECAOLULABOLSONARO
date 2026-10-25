#!/usr/bin/env python3
"""Create portable source archives without credentials, dependencies or live caches."""
import argparse
import datetime
import hashlib
import json
import os
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
TOP_FILES = {
    'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json',
    'next.config.ts', 'next-env.d.ts', 'postcss.config.mjs', 'playwright.config.ts',
    '.gitignore', '.env.example', 'AGENTS.md', 'projecao-final.json',
    'INICIAR-WINDOWS.cmd', 'INICIAR-MAC.command', 'INICIAR-LINUX.sh',
}
DIRECTORIES = {'app', 'components', 'lib', 'public', 'scripts', 'e2e', 'dados'}

def build(output, complete=False):
    output = pathlib.Path(output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    files, omitted = [], []
    for entry in sorted(ROOT.iterdir()):
        if entry.is_file() and (entry.name in TOP_FILES or entry.suffix == '.md'):
            files.append(entry)
        elif entry.is_dir() and entry.name in DIRECTORIES:
            for file in sorted(entry.rglob('*')):
                if not file.is_file():
                    continue
                rel = file.relative_to(ROOT).as_posix()
                if file.is_symlink() or '.git' in file.parts or any(part in {'node_modules', '__pycache__'} for part in file.parts):
                    continue
                if rel.startswith(('dados/local/', 'dados/raw/')) or file.suffix in {'.pyc', '.log'}:
                    continue
                if not complete and rel.startswith(('dados/originais/', 'dados/pesquisas/')):
                    # Keep the compact signed audit material, but not large source
                    # archives/PDFs. Complete archive preserves all originals.
                    if not (file.suffix in {'.jws', '.json'} and 'uf-6257' in rel or rel in {
                        'dados/originais/tse-6257.jws', 'dados/originais/tse-6257.json',
                        'dados/originais/tse-6258.jws', 'dados/originais/tse-6258.json',
                        'dados/originais/ele-c.jws', 'dados/originais/ele-c.json',
                        'dados/originais/downloads-manifest.json', 'dados/originais/files-manifest.json',
                    }):
                        omitted.append(rel)
                        continue
                files.append(file)
    manifest = {
        'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'variant': 'complete' if complete else 'local-runtime',
        'nodeModulesIncluded': False, 'runtimeCacheIncluded': False,
        'note': 'Pacote para executar no seu computador. A variante local inclui todos os dados web, código, documentos e boletins assinados de auditoria. Originais volumosos e reconstrução integral de fontes exigem a variante completa.',
        'omittedOriginals': omitted, 'files': [],
    }
    temporary = output.with_name(output.name + '.tmp')
    with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for file in sorted(set(files)):
            if file.is_symlink():
                raise ValueError(f'Symlink unexpected: {file}')
            rel = file.relative_to(ROOT).as_posix()
            data = file.read_bytes()
            manifest['files'].append({'path': rel, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
            archive.writestr(zipfile.ZipInfo.from_file(file, 'Observatorio-Presidencial/' + rel), data, compress_type=zipfile.ZIP_DEFLATED)
        archive.writestr('Observatorio-Presidencial/PACOTE-MANIFESTO.json', json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    with zipfile.ZipFile(temporary) as archive:
        bad = archive.testzip()
        if bad:
            raise ValueError(f'CRC inválido: {bad}')
        for item in manifest['files']:
            data = archive.read('Observatorio-Presidencial/' + item['path'])
            if hashlib.sha256(data).hexdigest() != item['sha256']:
                raise ValueError('Hash de pacote divergente: ' + item['path'])
    os.replace(temporary, output)
    checksum = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(output.suffix + '.sha256').write_text(f'{checksum}  {output.name}\n')
    print(json.dumps({'path': str(output), 'bytes': output.stat().st_size, 'files': len(files), 'variant': manifest['variant'], 'sha256': checksum}, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--complete', action='store_true')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    build(args.output, args.complete)
