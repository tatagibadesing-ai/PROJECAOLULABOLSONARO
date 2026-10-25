# Observatório · Presidencial 2026

Dashboard Next.js + React + TypeScript + Tailwind. Dados oficiais do primeiro turno, apuração nacional e por UF com assinatura digital, pesquisas primárias localizadas e laboratório estatístico isolado. **A projeção condicional sobre dados reais foi calculada e congelada para auditoria; probabilidades e cobertura ainda não são validadas.** Veja `NOTAS.md` e `AUDITORIA.md` antes de usar.

## Rodar no seu computador

Baixe o pacote local, extraia o ZIP e abra `INICIAR-WINDOWS.cmd` no Windows. No macOS execute `sh INICIAR-MAC.command`; no Linux, `sh INICIAR-LINUX.sh`. O inicializador instala dependências, prepara Node portátil oficial se necessário, escolhe uma porta livre e abre o navegador somente após a cópia local responder. Veja **COMECE-AQUI.md**. O localhost da nuvem não é o localhost do seu computador.

## Executar no ambiente de desenvolvimento

Requisitos: Node.js **24**, pnpm **11.25.0**, Python 3 para regenerar os dados. O Node e o pnpm já existem neste ambiente. Não há banco, credencial eleitoral ou API paga necessária.

```sh
cd /workspace/PROJECAOLULABOLSONARO
XDG_DATA_HOME=/workspace/.local/share XDG_CACHE_HOME=/workspace/.cache pnpm install --frozen-lockfile --store-dir /workspace/.pnpm-store
pnpm dev
```

No computador pessoal, use o caminho do seu checkout e `pnpm install --frozen-lockfile`. A aplicação usa a porta 3000 por padrão. Não habilite `NODE_USE_ENV_PROXY` globalmente: o serviço do TSE já usa o proxy de forma isolada, preservando TLS e a CA configurada pelo ambiente. Nenhum `.env` é necessário para os endereços oficiais confirmados. Overrides opcionais estão em `.env.example` e os quatro identificadores devem ser configurados juntos.

Modos:

- Página inicial: projeção condicional com base municipal real, hipóteses, intervalos e probabilidades rotuladas, além do primeiro turno oficial separado.
- `?ensaio=1turno`: reprodução dos dados reais do primeiro turno, com ordem simulada, 12 candidatos e três sequências.
- `?ensaio=demonstracao`: laboratório com dados artificiais e 20.000 sorteios em Web Worker. Não é uma projeção de 2026.
- `/api/apuracao`: nacional + 28 circunscrições e município sob demanda; assinatura Ed25519, cache persistente e horários originais. `/api/historico` guarda boletins recebidos; `/api/projecao` entrega o arquivo congelado verificado.

## Verificar

Com o servidor em execução:

```sh
pnpm typecheck
pnpm test
pnpm audit:data
node scripts/verify-official.mjs
node scripts/verify-municipal-geodata.mjs
node scripts/verify-projection.mjs
pnpm test:e2e
pnpm build
```

O Playwright usa Chromium do sistema quando disponível; em outro computador instale com `pnpm exec playwright install chromium`. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` permite informar outro executável. `TEST_BASE_URL` permite testar uma instância diferente. As fixtures de testes são artificiais e nunca comprovam resultado ou cobertura eleitoral. O smoke real observa espera do segundo turno, não votação já iniciada.

## Reproduzir as fontes

A versão congelada referencia hashes dos dados e do método: não regenere esses arquivos por cima da versão auditada. Para atualizar fontes, trabalhe em outra cópia e preserve o pacote original e o arquivo congelado. A comparação sempre usa a versão congelada.

Os originais compactados, manifestos com SHA-256 e dados normalizados estão no projeto. Consulte `dados/FONTES.md` e `dados/PESQUISAS.md`.

```sh
node scripts/fetch-official.mjs
node scripts/verify-official.mjs
node scripts/prepare-polls.mjs
node scripts/historical-error.mjs
node scripts/backtest.mjs
```

`fetch-official.mjs --refresh` força downloads oficiais por HTTPS, usando HTTP Range e CRC do ZIP; a execução normal reutiliza os originais. `backtest.mjs` verifica os hashes e preserva o retrospecto condicional medido; termina com código 2 se as entradas mudarem. O resultado medido não certifica calibração ou independência documental prospectiva. Os scripts de reprodução integral de fontes precisam dos originais incluídos no pacote completo, não no pacote local reduzido. As malhas estadual e municipais já estão incluídas; para regenerá-la são opcionais `pyshp==2.3.1` e `shapely==2.1.2`.

## Deploy na Vercel

1. Envie o projeto a um repositório Git e importe-o na Vercel, com preset Next.js e Node.js 24.
2. Diretório raiz: o diretório deste projeto. Instalação: `pnpm install --frozen-lockfile`. Build: `pnpm build`. Sem export estático, pois há rotas de servidor.
3. Mantenha os dados em `public/data`, os documentos e os arquivos de código no deploy. As bibliotecas e as fontes de interface são locais.
4. Permita HTTPS de saída para `resultados.tse.jus.br`. Não use segredos no navegador. Os defaults só apontam aos endereços oficiais descobertos e assinados.
5. Antes de anunciar acompanhamento em produção, implemente um coletor único ou cache/trava distribuídos. O cache atual é por processo e **não garante** uma consulta global por 30 segundos em múltiplas instâncias. O primeiro ciclo de 29 arquivos pode levar cerca de 15 segundos: configure a duração da função de acordo com o plano e valide em staging.
6. Execute os testes contra a instância de staging e verifique status, hora da fonte, 28 circunscrições e cenários de falha. Não publique probabilidades enquanto as âncoras estatísticas estiverem pendentes.

Nenhum deploy foi efetuado por este trabalho. A nuvem de desenvolvimento e a publicação na Vercel são etapas distintas.

## Arquivos de transparência

`METODO.md` descreve método e fórmulas; `LEITURA.md` registra a interpretação; `DECISOES.md` justifica bibliotecas e escolhas; `NOTAS.md` lista lacunas; `AUDITORIA.md` registra revisão independente. `projecao-final.json` contém o cenário condicional congelado, data, fontes e hash canônico. `node scripts/verify-projection.mjs` verifica integridade e versões das entradas. O script de congelamento nunca substitui um arquivo já congelado.

## Gerar os pacotes locais

```sh
python3 scripts/package-local.py --output dist/observatorio-local.zip
python3 scripts/package-local.py --complete --output dist/observatorio-completo.zip
```

O primeiro inclui todos os dados web, fontes de aplicação e material assinado de auditoria, sem os originais volumosos. O segundo inclui os originais para reconstruir as fontes. Ambos trazem manifesto e SHA-256, sem credenciais, cache de sessão ou dependências instaladas. Os inicializadores usam caminhos relativos e foram testados em uma cópia extraída separada.
