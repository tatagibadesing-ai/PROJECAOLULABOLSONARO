# Fontes e trilha de auditoria

Coleta inicial em **24/10/2026**, por HTTPS com validação TLS. Os arquivos originais ficam em `dados/originais/`. Não usamos imprensa para apuração. `originais/downloads-manifest.json` registra URL, instante de coleta e SHA-256 dos arquivos tabulares; `originais/files-manifest.json` registra o hash de cada original preservado. Resultados normalizados não substituem os originais.

## TSE: votação e detalhe por município/zona

As URLs abaixo foram extraídas dos catálogos oficiais, não deduzidas a partir de códigos antigos:

| Catálogo | Arquivos vinculados | Originais preservados | Normalização |
|---|---|---|---|
| [Resultados 2026](https://dadosabertos.tse.jus.br/dataset/resultados-2026) | [Votação nominal](https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2026.zip), [detalhe](https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2026.zip) | `votacao_candidato_munzona_2026_BR.csv.gz`, `detalhe_votacao_munzona_2026.zip`, HTML do catálogo | `public/data/first-round-2026.json` |
| [Resultados 2018](https://dadosabertos.tse.jus.br/dataset/resultados-2018) | [Votação nominal](https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2018.zip), [detalhe](https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2018.zip) | CSV BR em gzip, ZIP detalhe, HTML catálogo | `public/data/round-{1,2}-2018.json` |
| [Resultados 2014](https://dadosabertos.tse.jus.br/dataset/resultados-2014) | [Votação nominal](https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2014.zip), [detalhe](https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2014.zip) | CSV BR em gzip, ZIP detalhe, HTML catálogo | `public/data/round-{1,2}-2014.json` |
| [Resultados 2022](https://dadosabertos.tse.jus.br/dataset/resultados-2022) | [Votação nominal](https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip), [detalhe](https://cdn.tse.jus.br/estatistica/sead/odsele/detalhe_votacao_munzona/detalhe_votacao_munzona_2022.zip) | `votacao_candidato_munzona_2022_BR.csv.gz`, `detalhe_votacao_munzona_2022.zip`, HTML do catálogo | `public/data/round-1-2022.json`, `public/data/round-2-2022.json` |

Os ZIPs de votação têm centenas de MB e incluem cargos estaduais. Extraímos apenas o membro **BR**, que contém presidente em todos os municípios e no exterior. O diretório central do ZIP e os bytes do membro foram lidos com HTTP Range; comprimento e CRC-32 ZIP foram conferidos antes de guardar o CSV em gzip. Não somamos `BRASIL` junto de `BR`: isso duplicaria dados. A codificação original é Latin-1, separador `;`.

Reprodução: `node scripts/fetch-official.mjs`. Por padrão reutiliza os originais preservados; `node scripts/fetch-official.mjs --refresh` consulta novamente os ZIPs oficiais. Python 3 é necessário. A normalização agrega as zonas por `UF + código TSE do município`, separa turno e cargo, soma municípios para UF e UFs para Brasil, e falha se qualquer identidade de conservação estiver errada.

## Reconciliação independente do primeiro turno de 2026

O código da eleição presidencial federal é **6257**, data **04/10/2026**, conforme os próprios CSVs e a configuração oficial assinada. Os totais conferidos foram:

| Item | Contagem oficial |
|---|---:|
| Flávio Bolsonaro, 22 | 56.104.503 |
| Lula, 13 | 53.879.538 |
| Augusto Cury, 70 | 3.448.569 |
| Renan Santos, 14 | 2.675.887 |
| Ronaldo Caiado, 55 | 2.605.148 |
| Zema, 30 | 326.488 |
| Demais candidatos | 260.655 |
| Votos válidos | 119.300.788 |
| Brancos | 2.300.798 |
| Nulos, inclusive técnicos | 3.674.249 |
| Comparecimento | 125.275.835 |
| Abstenção | 33.469.244 |
| Aptos em seções não instaladas | 423 |
| Eleitorado | 158.745.502 |

Os principais valores do enunciado coincidem exatamente. Há duas correções necessárias de abrangência:

- São **5.571 municípios domésticos** no arquivo oficial de 2026, não 5.570: inclui Boa Esperança do Norte, MT, código TSE 73709. O exterior tem 186 localidades eleitorais; total de 5.757 unidades no arquivo. Em 2022 havia 5.570 municípios e 181 localidades no exterior.
- Comparecimento + abstenção fica **423 abaixo do eleitorado** porque há aptos em seções não instaladas. Esse grupo está no campo `notInstalledElectorate`; não foi artificialmente somado à abstenção. Em 2022, a categoria contém 657 aptos.

Seções: divulgação oficial usa **499.248 seções principais** (`sections`). Os CSVs também incluem 17.931 agregadas (`aggregatedSections`), que não podem ser somadas ao denominador de progresso. Há 41 principais não instaladas. Esses campos são preservados separadamente.

`dados/verification.json`: conservação exata em **todas** as unidades dos conjuntos 2026/2022 e comparação nacional com a divulgação; os conjuntos históricos adicionais são auditados separadamente, com divergências de eleitorado de 2014 explicitadas abaixo. `dados/reconciliation.json`: comparação independente de **Brasil, 27 UFs e exterior**, candidato por candidato, eleitorado, comparecimento, abstenção, brancos, nulos e seções, contra os arquivos oficiais assinados. São **29 abrangências conferidas, zero diferenças**. Repetir: `node scripts/verify-official.mjs`.

## Apuração oficial ao vivo e assinatura

Descoberta partindo de [Resultados TSE](https://resultados.tse.jus.br), cujo HTML define `/oficial/app/` e carrega `main.f31aece23cbbdd2d.js`. O bundle e os chunks do aplicativo mostram o repositório `oficial/comum/config/ele-c.jws` e o padrão unificado `oficial/{ciclo}/{eleição}/dados/{abrangência}/{abrangência}-c0001-e{eleição com 6 dígitos}-u.jws`. A configuração oficial foi lida e sua assinatura Ed25519 conferida antes do uso.

- [Configuração assinada](https://resultados.tse.jus.br/oficial/comum/config/ele-c.jws) → `originais/ele-c.jws`, payload `ele-c.json`.
- [1º turno 2026 — nacional, 6257](https://resultados.tse.jus.br/oficial/ele2026/6257/dados/br/br-c0001-e006257-u.jws) → `originais/tse-6257.jws`, payload `tse-6257.json`.
- [2º turno 2026 — nacional, 6258](https://resultados.tse.jus.br/oficial/ele2026/6258/dados/br/br-c0001-e006258-u.jws) → `originais/tse-6258.jws`, payload `tse-6258.json`.
- UFs e exterior 1º turno: substituir `br` pela UF em minúsculas, incluindo `zz`; originais em `originais/uf-6257/{uf}.jws` e payload `{uf}.json`. Todos assinados e verificados.

A configuração confirma segundo turno em **25/10/2026**, código **6258**. A resposta consultada antes da votação ainda não contém votos totalizados: isso é estado de espera, não queda do TSE e não resultado eleitoral.

A chave de verificação é pública, extraída do aplicativo oficial por HTTPS: `kid=sNbt9Q_fLS65zE1_ZLNV-XRRwPY`, `crv=Ed25519`, `x=kWlpNHjuws1csyQZwzn3Fhzbi3RD435RbpThtSr4hMc`. Guardamos JWS original; decodificar sem conferir assinatura não é aceito. A rota do servidor valida assinatura, eleição, turno e abrangência e mantém a última observação válida se houver falha. O navegador não consulta o TSE diretamente.

## Histórico 2022

São 5.751 localidades por turno. Os votos nominais do primeiro turno somam 118.229.719 válidos: Lula 57.259.504; Jair Bolsonaro 51.072.345. No segundo: Lula 60.345.999; Jair Bolsonaro 58.206.354; válidos 118.552.353. Aptos 156.454.011 nos dois turnos. Os dados históricos contêm o nome real do candidato de 2022; não foram renomeados para o candidato de 2026.

Os arquivos de detalhe contêm hora/data da última totalização por zona. `lastTotalizationAt` municipal é o máximo entre suas zonas, não um histórico de boletins. Portanto serve para ordenar um ensaio por término de município, mas não reproduz a sequência integral de divulgação.

## Histórico adicional: 2018 e 2014

Também foram baixados os CSVs oficiais de votação e detalhe dos dois turnos de 2018 e 2014, a partir dos catálogos vinculados acima. Normalizados no mesmo contrato em `public/data/round-{1,2}-{2014,2018}.json`.

| Segundo turno | Candidato | Votos oficiais | Válidos nacionais |
|---|---|---:|---:|
| 2014 | Dilma, 13 | 54.501.118 | 105.542.273 |
| 2014 | Aécio Neves, 45 | 51.041.155 | 105.542.273 |
| 2018 | Jair Bolsonaro, 17 | 57.797.847 | 104.838.753 |
| 2018 | Fernando Haddad, 13 | 47.040.906 | 104.838.753 |

Esses votos nominais e válidos são a referência observada para calcular erro histórico das pesquisas; nenhum valor foi obtido da memória. Não deve ser estimado desvio sem informar que há somente três eleições comparáveis (2014/2018/2022) e a cobertura efetiva de institutos é limitada.

A auditoria de conservação encontrou:

- **2018**: segundo turno fecha integralmente. No primeiro, Salvador zona 18 tem **746 votos anulados na apuração em separado** (`QT_VOTOS_ANULADOS_APU_SEP`), categoria diferente de nulos. A normalização preserva `annulledSeparate` e a conta válida é `válidos + brancos + nulos + anulados em separado = comparecimento`. Nenhum desses votos foi transferido para candidato ou para nulo.
- **2014**, nos dois turnos: a soma dos candidatos confere exatamente com os válidos em todas as localidades. Porém o próprio CSV de detalhe tem eleitorado **688 acima** de comparecimento + abstenção + eleitores em seções não instaladas: 4 em Sergipe e 684 no exterior. A divergência consta em `validation.errors` nos JSON e em `dados/verification.json` (39 localidades + duas UFs/exterior e Brasil, 42 registros). Os campos originais são preservados, a diferença não é imputada a qualquer comportamento. Esse detalhe de comparecimento de 2014 não integra a matriz-base nem a validação de conservação de 2026/2022. Os votos válidos nacionais de 2014 usados para erro de pesquisa não são afetados.

Por isso, o relatório global de dados pode estar `partial` devido à reconciliação de eleitorado histórica de 2014, enquanto os conjuntos necessários 2026/2022 têm `passed`. A divergência documental do arquivo histórico não foi escondida nem convertida em sucesso.

## Pesquisas

Catálogo de evidências, cobertura e limitações: `dados/PESQUISAS.md` e `dados/pesquisas-evidencias.json`. A tabela normalizada é `dados/pesquisas.csv`, incluindo somente linhas com publicação verificável. O número de registro não equivale à aprovação do resultado pelo TSE. Cruzamentos, amostras ou números não publicados não são preenchidos por inferência.

## IBGE: cartografia

- [Malha de UFs 2022, fonte primária](https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2022/Brasil/BR/BR_UF_2022.zip) → `originais/BR_UF_2022.zip`, 13.717.460 bytes, coletado em 24/10/2026.
- Derivado web: `public/data/states.geojson`, 27 feições e cerca de 275 KB. Simplificação Douglas–Peucker com tolerância de 0,035 grau e preservação de topologia, sem alterar a identidade da UF. É cartografia estadual de 2022, não alegação de malha municipal de 2026.
- Reprodução opcional: `scripts/simplify-map.py`, com `pyshp==2.3.1` e `shapely==2.1.2`. O arquivo derivado já está versionável; essas bibliotecas não são necessárias para executar o dashboard.

A API `servicodados.ibge.gov.br/api/v3/malhas/` respondeu HTTP 503 nesta coleta, inclusive a consulta de SP isolada; o download pelo geoftp oficial funcionou. O caminho de malha UF2024 testado respondeu 404. Isso não estabelece inexistência geral da malha atual; registra apenas as respostas observadas. Na primeira etapa só havia cartografia estadual. A ampliação municipal completa com malha 2025 e correspondência oficial de códigos está descrita abaixo.

## Ampliação: mapa municipal completo, IBGE 2025

O índice oficial do geoftp revelou a estrutura atual: em 2025, o arquivo nacional fica diretamente em `municipio_2025/Brasil/`, sem a subpasta `BR/` de 2022. A malha municipal completa foi incorporada:

- [Malha municipal IBGE 2025](https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_municipais/municipio_2025/Brasil/BR_Municipios_2025.zip), publicada em 26/02/2026; original `originais/BR_Municipios_2025.zip`, 237.062.431 bytes, CRC de todos os membros ZIP validado. O GET integral respondeu 503; a transferência foi realizada em intervalos HTTP de 4 MB, com HTTPS/TLS verificado e comprimento conferido.
- O shapefile contém 5.573 feições: **5.571 municípios** e duas áreas operacionais das lagoas Mirim e dos Patos no RS. As áreas operacionais não são municípios eleitorais e estão excluídas dos mapas eleitorais; a exclusão é registrada no relatório.
- A malha já inclui Boa Esperança do Norte, MT, **IBGE 5101837**, com seu polígono próprio. Nenhum ponto, círculo ou limite fictício foi usado para representar a cidade.

### Correspondência oficial entre códigos

Não inferimos código IBGE a partir do código eleitoral, não associamos cidades por distância e não usamos correspondência aproximada de nomes. A busca no catálogo oficial TSE (`api/3/action/package_search?q=IBGE`) encontrou o conjunto [Códigos oficiais de UF e municípios segundo o TSE e o IBGE](https://dadosabertos.tse.jus.br/dataset/codigos-oficiais-de-uf-e-municipios-segundo-o-tse-e-o-ibge).

Seu recurso [municipio_tse_ibge.zip](https://cdn.tse.jus.br/estatistica/sead/odsele/municipio_tse_ibge/municipio_tse_ibge.zip) foi preservado com CSV e CRC conferido. A geração do CSV é **18/10/2026, 09:00:10**. Ele contém os dois códigos explicitamente em colunas separadas e cobre **5.571 municípios, sem códigos duplicados de nenhum dos lados**. A ligação entre o resultado eleitoral, a tabela e a malha é feita somente por esses códigos oficiais, com verificação de UF. Por exemplo, Boa Esperança do Norte é `MT-73709` no resultado eleitoral e `5101837` na cartografia.

O arquivo `dados/municipal-crosswalk.json` preserva todos os pares e nomes como publicados. Diferenças de grafia — São Thomé/São Tomé das Letras, Boa Saúde/Januário Cicco, São Luiz/São Luiz do Anauá — não precisam de aliases manuais nem de decisões por semelhança. **Nenhum dos 5.571 municípios eleitorais domésticos ficou sem correspondência.** As 186 localidades no exterior não são polígonos municipais brasileiros e continuam na lista eleitoral.

### Derivados e reprodução

- `public/data/municipalities/BR.json`: todos os 5.571 polígonos; `public/data/municipalities/{UF}.json`: os mesmos polígonos, divididos por UF para carregar apenas a região selecionada.
- `dados/municipal-geodata.json`: fontes, SHA-256, tamanho dos originais e derivados, quantidade de feições, cobertura da correspondência e parâmetros de simplificação.
- Regeneração opcional: `PYTHONPATH=<bibliotecas> python3 scripts/build-municipal-geodata.py`, com `pyshp==2.3.1` e `shapely==2.1.2`. São ferramentas de geração de dados, não dependências da aplicação em execução. O script também baixa os dois ZIPs se faltarem.
- A simplificação usa tolerância de **0,0055 grau** e arredondamento a cinco casas. Quando a cobertura de entrada é válida, `coverage_simplify` mantém as bordas compartilhadas. Se a cobertura oficial não for válida, o script registra o fato e usa simplificação com preservação de topologia individual. A decisão efetiva está no campo `sharedEdgeSimplification` do relatório e dos mapas. A cartografia simplificada serve à visualização, não à medição cadastral.
- `components/MunicipalMap.tsx` desenha os polígonos em **canvas**, reutilizando caminhos e buffers no movimento do ponteiro; a identificação de município utiliza uma camada de cores interna e confirmação do ponto no polígono. Seleção por lista também está disponível. Não há 5.571 elementos SVG nem geometrias inventadas.

O componente registra tempo de construção e de redesenho em atributos `data-render-ms` e `data-last-paint-ms` do canvas para permitir medição no navegador. A implementação por canvas, por si só, não estabelece 60 fps em todo computador; qualquer resultado de desempenho deve informar dispositivo, conjunto e método medidos.
