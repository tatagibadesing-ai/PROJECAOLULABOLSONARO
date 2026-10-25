# Decisões de implementação

## Integridade antes de publicação

O repositório estava vazio. O pedido posterior autoriza criar a aplicação; nenhuma aplicação preexistente foi alterada. Primeiro escrevemos `METODO.md`, depois o motor. Agentes dividiram fontes, pesquisas, modelo, apuração, interface e crítica independente. A auditoria está em `AUDITORIA.md`.

O primeiro turno é oficial; o laboratório é sintético; a projeção condicional usa dados reais e hipóteses explícitas. São três estados distintos. O usuário autorizou referências históricas para cruzamentos ausentes, sem transformá-las em medições. `projecao-final.json` foi congelado antes da apuração, com status `frozen-conditional`, hash real e validação pendente. O script impede substituição e congelamento após votos/prazo. Congelar para prestação de contas não aprova probabilidades. `LEITURA.md` justifica a correção-base zero.

## Bibliotecas

- **Next.js, React e TypeScript:** interface e rotas de servidor no mesmo projeto, com tipos e renderização inicial. App Router; documentação da versão instalada consultada em `node_modules/next/dist/docs`. `allowedDevOrigins` inclui apenas o endereço adicional de loopback usado nos testes. Não se libera uma origem arbitrária.
- **Tailwind CSS e PostCSS:** integração solicitada, tokens visuais e estilos responsivos; o CSS dos componentes usa classes sem dependência de uma biblioteca de cards.
- **Framer Motion:** transições de estado e abertura de seções de até 200 ms. Respeita movimento reduzido. Não controla o elemento da agulha.
- **GSAP:** movimento da agulha condicional e do laboratório com inércia, 700 ms, exceção expressamente permitida pelo pedido. O elemento não é animado por Framer Motion. Sem movimento quando a preferência do sistema o pede.
- **Lucide React:** ícones vetoriais consistentes, com rótulos nos controles.
- **Geist:** fontes Sans e Mono locais, sem consulta a Google Fonts durante build. Algarismos tabulares; não usamos Inter, Roboto ou Arial como fonte de projeto.
- **react-markdown:** documentos de método e proveniência renderizados como conteúdo React, sem habilitar HTML arbitrário.
- **undici:** transporte HTTPS do coletor com `EnvHttpProxyAgent` apenas nas chamadas externas ao TSE. Reutiliza o proxy e a confiança TLS injetados na nuvem. Não altera o dispatcher global do Next nem desliga validação TLS.
- **tsx e node:test:** testes do modelo, serviço e normalizadores sem uma camada adicional de framework.
- **Playwright:** testes de navegador desktop e celular, inclusive Web Worker, filtros, ensaio completo e dados desatualizados.

O lockfile fixa as versões efetivamente instaladas. A única dependência autorizada a executar script de instalação é esbuild, necessária ao tsx; nenhuma aprovação interativa é exigida.

## Cartografia e desempenho

SVG apenas para 27 UFs. Os 5.571 municípios usam **canvas**, buffers reutilizados e seleção acessível, com malha IBGE 2025 e correspondência oficial TSE↔IBGE por códigos. Canvas satisfaz a alternativa do pedido sem dependências MapLibre/deck.gl. A intensidade de margem é usada no resultado observado; no cenário, a intensidade é chance condicional, sem alegar calibração. Não se certificam 60 fps sem medir em cada dispositivo.

O Monte Carlo usa Web Worker ESM e maiores restos com desempate pseudoaleatório reproduzível. O RNG mantém estado uint32 em execuções extensas. O modo condicional utiliza as 5.757 localidades reais; o laboratório continua artificial. Logits pré-calculados e buffers reduzem custo. Intervalos nacionais/UF são quantis exatos dos 20.000 sorteios; contagens municipais usam histogramas e arredondamento externo com resolução declarada. Um revisor repetiu as 115.140.000 verificações e reproduziu os resultados reais condicionais, sem confundir isso com validação probabilística.

## Coleta e dados históricos

Descobrimos a configuração e os endereços no aplicativo oficial do TSE. A assinatura Ed25519 é verificada antes de normalizar qualquer boletim. O coletor lê o nacional e 28 circunscrições, com até quatro downloads simultâneos. O intervalo mínimo de 30 segundos por recurso começa ao terminar o ciclo, inclusive em falha. Não há interpolação. A fonte tem sua hora de geração e a consulta tem outra; atraso usa a hora da fonte. Cada UF pode ter atraso próprio.

O processo persiste JWS e histórico em disco; ao reiniciar, reverifica assinaturas e preserva horários. Municípios são consultados sob demanda na mesma rota, sem 5.571 requisições a cada ciclo. Para múltiplas instâncias, ainda é necessário coletor/cache/trava compartilhados. Não houve deploy externo ou teste de carga contra o TSE.

O ensaio usa todos os candidatos do primeiro turno e três ordens controladas. Horários disponíveis são de conclusão municipal, não uma série completa de boletins. Fusos por UF são aproximações explicitadas. O ensaio testa o fluxo, não a cobertura da agulha. A agulha condicional usa votos restantes estimados pelo cenário, regularização local/estadual, intervalos e fechamento final exato; sua cobertura eleitoral segue não validada.

## Pesquisas e incerteza

As publicações originais e os registros declarados são preservados. PesqEle retornou HTTP 403. A tela informa que a média é **parcial**, com cinco publicações em votos válidos, incluindo a rodada final Datafolha de 24/10, peso `sqrt(n) × 2^(−idade/5)`, sem viés de instituto. A Quaest em votos totais não é convertida silenciosamente. A publicação primária do contratante também é aceita e identificada. Uma pesquisa publicada no mesmo dia do fim do campo não precisa esperar 23h59 para entrar: a data de publicação e o campo são verificados. A média parcial não é catálogo completo.

Os erros históricos são calculados com Datafolha e resultados oficiais de 2014, 2018 e 2022, agrupados por eleição: três anos não são dezenas de observações independentes. O desvio é exploratório e não identifica covariância regional, transferências, nem incerteza municipal. Fontes retrospectivas arquivadas hoje não provam que a versão era idêntica antes da votação. Não se ajusta um método ao resultado observado para aprovar 2022.

## Abrangência e arredondamento

TSE prevalece sobre o enunciado: são 5.571 municípios em 2026, mais 186 localidades no exterior. Aptos de seções não instaladas ficam separados, inclusive os 423 de 2026. Seções agregadas não entram no denominador do progresso. Em 2018 há votos anulados em separado, preservados; em 2014 há discrepância de 688 aptos na fonte, sinalizada, sem alterar os votos oficiais.

Flávio aparece antes de Lula. As cores são `oklch(70% .16 255)` e `oklch(70% .16 25)`, com luminosidade e croma iguais. Mesma tipografia, área e peso para ambos. Municípios usam percentuais inteiros. O motor agora calcula intervalos das cinco contagens em ambos os modos. Ausência de votos válidos gera `—`, nunca NaN ou 50% inventado.

## Execução local e distribuição

O usuário escolheu rodar no seu computador. O ZIP local contém código e dados prontos, sem node_modules, cache, autenticação ou dependência dos caminhos da nuvem. Os inicializadores usam Node compatível existente ou baixam Node portátil de nodejs.org com SHA-256 fixado no manifesto oficial. O JavaScript instala pelo lockfile, escolhe uma porta livre, valida uma resposta do dashboard e só então abre o navegador. Não apresenta localhost da nuvem como se fosse o do usuário. O teste independente foi executado em Linux; Windows/macOS têm inicializadores preparados, sem alegar execução nesses sistemas. O pacote completo preserva originais volumosos para reconstrução integral.
