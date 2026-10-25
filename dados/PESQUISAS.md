# Pesquisas verificadas em fontes primárias

Consultas em 24/10 e 25/10/2026 UTC (a última ainda era noite de 24/10 em Brasília). Este é um **levantamento parcial**, não o catálogo de todas as pesquisas registradas no TSE. Não se preencheu resultado, amostra, registro ou cruzamento desconhecido com uma estimativa.

Os resultados e metadados foram lidos nas publicações originais dos institutos. A consulta direta ao PesqEle (`https://pesqele-divulgacao.tse.jus.br/` e `/app/pesquisa/listar.xhtml`) respondeu HTTP 403. Portanto, os números de registro abaixo são declarações documentadas dos institutos; o cadastro do TSE ainda não foi conferido diretamente. Isso consta em `tseRegistrationVerified: false` no JSON. Não se contornou a restrição.

| Instituto | Campo | Amostra | Válidos | Registro declarado |
|---|---|---:|---|---|
| Datafolha | 23–24/10/2026 | 4.050 | Flávio 51%; Lula 49% | BR-09540/2026 |
| Datafolha | 20–22/10/2026 | 2.520 | Flávio 50%; Lula 50% | BR-09709/2026 |
| Datafolha | 13–14/10/2026 | 2.520 | Flávio 51%; Lula 49% | BR-00466/2026 |
| Datafolha | 06–07/10/2026 | 2.520 | Flávio 52%; Lula 48% | BR-02949/2026 |
| AtlasIntel/Bloomberg | 13–18/10/2026 | 4.998 | Flávio 51,1%; Lula 48,9% | BR-02418/2026 |
| Quaest/Globo | 17–20/10/2026 | 2.154 | **Totais:** Flávio 45%; Lula 44%; branco/nulo/não vai votar 9%; indecisos 2% | BR-08535/2026 |
| Datafolha | 28–29/10/2022 | 8.308 | Jair 48%; Lula 52% | BR-08297/2022 |
| Datafolha | 26–27/10/2018 | 18.371 | Jair 55%; Haddad 45% | Não localizado no arquivo |
| Datafolha | 24–25/10/2014 | 19.318 | Aécio 48%; Dilma 52% | BR01210/2014, como impresso |

`pesquisas.csv` contém contratante, método, campo, amostra, denominador, fonte e limitação de cada pesquisa. `pesquisas-evidencias.json` registra também SHA-256 e tamanho dos PDFs salvos. PDFs e extrações de texto estão em `dados/pesquisas/`. O PDF Quaest original de 69,9 MB está preservado no arquivo versionável `dados/pesquisas/quaest-2026-10-20.pdf.gz`, comprimido com gzip determinístico, com hashes do comprimido e do original no manifesto. A igualdade após descompressão foi verificada. Para abri-lo: `gzip -dc dados/pesquisas/quaest-2026-10-20.pdf.gz > /tmp/quaest.pdf`.

## Diferenças em relação ao pedido

- **Rodada final de 24/10 localizada:** publicação original da Folha, contratante da pesquisa, informa campo 23–24/10, n=4.050 em 124 municípios, válidos 51/49 e valores antes do arredondamento 50,89/49,11. Totais 48/47, branco/nulo 3%, indecisos 2%. O método de entrevista permanece nulo: não foi localizado no texto, e o PDF técnico ainda não foi localizado. A linha foi incluída na média **parcial** de valores válidos publicados, preservando a distinção de fonte e a falta de verificação direta do registro TSE.

- Datafolha BR-00466/2026: metodologia do PDF e artigo original indicam **13 e 14/10**, embora a capa diga 15/10. O pedido dizia 13–15/10. Preservamos a data de campo, não a data da capa.
- Datafolha BR-02949/2026: campo **06–07/10**, capa 08/10. O pedido dizia 06–08/10.
- O Atlas mais recente localizado na listagem pública é divulgado em 19/10, com campo 13–18/10 e registro BR-02418/2026. Os gráficos são rasterizados: os 51,1% e 48,9% foram conferidos visualmente na página 8 do PDF.
- A Quaest de 21/10 publica totais e agrupa branco/nulo/não vai votar. Não identifica essas três saídas separadamente. Se calculada, `45/(45+44)` seria uma conversão derivada dos totais arredondados, não um percentual válido publicado.
- O PDF Datafolha mais recente publica **50/50 válidos** e **47/46 totais**. Não se substitui o válido publicado por `47/(47+46)`; o arredondamento e os pesos podem produzir diferenças.

## Cruzamentos

O relatório Datafolha de 22/10 traz tabelas completas por região, sexo, idade, escolaridade, renda, ocupação, cor/raça, religião e preferência partidária. As tabelas permanecem no PDF e no texto extraído. O resumo do instituto informa que, entre os que votaram em Cury/Renan/Caiado/Zema **agregados**, 47% indicam Flávio, 26% Lula, 21% branco/nulo e 6% indecisos. Isso não permite separar a transferência de cada um dos quatro candidatos, nem converter indecisão em abstenção.

A Quaest de 21/10, página 19, informa outros candidatos agregados → Flávio 43%, Lula 37%, indecisos 1%, branco/nulo/não vai votar 19%; e branco/nulo/não foi votar → Flávio 36%, Lula 40%, indecisos 3%, branco/nulo/não vai votar 21%. As duas linhas observadas estão em `transferencias-2026.json`. Não se completou uma matriz de cinco destinos com divisões inventadas.

Na revisão de 25/10, a leitura visual da **página 20** desse mesmo PDF identificou também as linhas individuais abaixo. O gráfico mostra 14/10 à esquerda e 21/10 à direita; a tabela transcreve **21/10** (campo terminou em 20/10). O gráfico rasterizado não havia aparecido na extração textual. A imagem integral da página está preservada em `dados/pesquisas/quaest-2026-10-20-transferencias.png`.

| Voto no primeiro turno | Flávio | Lula | Indecisos | Branco/nulo/não vai votar | Margem de erro do subgrupo |
|---|---:|---:|---:|---:|---:|
| Flávio | 94% | 0% | 1% | 5% | 4 p.p. |
| Lula | 0% | 95% | 1% | 4% | 4 p.p. |
| Cury | 33% | 48% | 3% | 16% | 17 p.p. |
| Caiado | 57% | 21% | 0% | 22% | 24 p.p. |
| Renan | 51% | 25% | 0% | 24% | 20 p.p. |
| Branco/nulo/não foi votar | 36% | 40% | 3% | 21% | 6 p.p. |

Esses cruzamentos reduzem a falta de informação sobre transferências de 2026, mas não identificam Zema e pequenas candidaturas separadamente, nem separam brancos, nulos e abstenção nos destinos. Os grandes erros amostrais dos grupos menores precisam entrar nas premissas e na incerteza. Não somar o agregado “outros” novamente se suas linhas individuais já foram usadas.

O relatório Datafolha de 2022 descreve, entre eleitores de Tebet, 59/41 dos válidos para Lula/Jair, com 21% branco/nulo e 7% indecisos no grupo total. Para Ciro são 56/44 dos válidos, 18% branco/nulo e 5% indecisos. Esses denominadores diferentes devem ser preservados. Não há identificação completa de quem se abstém.

`transferencias-2022.json` registra esses dois cruzamentos com citações da página 4, cálculos derivados explicitamente identificados e valores nulos para células não publicadas. A inspeção do relatório de 64 páginas não localizou retenção por voto no primeiro turno para Lula/Jair nem transferências de quem votou branco/nulo ou se absteve. As tabelas finais por preferência partidária **não são** tabelas por voto no primeiro turno. Metadados do PDF registram criação em 30/10/2022 às 20:26 UTC; portanto, a ausência de vazamento temporal não está demonstrada.

A última Datafolha do primeiro turno de 2026 foi localizada e salva: campo 02–03/10, n=4.006, BR-01708/2026, Flávio 42% e Lula 45% dos válidos (os demais candidatos completam o total). A diferença entre a margem da pesquisa e a margem TSE pode ser calculada, mas não demonstra que esse erro persistirá no segundo turno. O PDF foi publicado/atualizado em 05/10; sem uma cópia anterior não é possível excluir mudança retrospectiva. Esse registro está em `firstRoundEvidence`, separado das pesquisas de segundo turno.

## Retrospecto e incerteza

As últimas Datafolha de 2014, 2018 e 2022 permitem calcular **três erros nacionais de um único instituto** contra os resultados TSE. Não são observações independentes de todos os institutos, nem suficientes para estimar com segurança covariâncias regionais e municipais. Uma escala de erro calculada nesses três anos é descritiva e frágil; não comprova cobertura preditiva de 80%.

O artigo e a URL do PDF de 2022 foram atualizados em 31/10, embora descrevam campo em 28–29/10. Os documentos baixados hoje permitem verificar o conteúdo, mas não demonstram a existência de uma versão idêntica anterior ao resultado. O mesmo cuidado vale para atualizações de páginas históricas. Não apresentar esse retrospecto como validação prospectiva sem vazamento demonstradamente excluído.

## Fontes originais

- [Datafolha final 24/10/2026, publicação original do contratante Folha](https://www1.folha.uol.com.br/poder/2026/10/datafolha-flavio-bolsonaro-tem-51-dos-votos-validos-e-lula-49-em-empate-tecnico.shtml), HTML e texto preservados com hash; publicação às 18:30 UTC de 24/10, modificação às 20:15 UTC. Não foi necessário esperar o fim do dia de campo para incluir uma pesquisa já publicada.
- [Datafolha 22/10/2026, PDF](https://media.folha.uol.com.br/datafolha/2026/10/23/xruy9kxbaieozsbhp0lxbvdrv6cvlf5iuxgfkw04tre.pdf)
- [Datafolha 14/10/2026, PDF](https://media.folha.uol.com.br/datafolha/2026/10/16/2sq1uhzy7x0w7caugz-gotqrxffgtdsqnx7qkfqfhs0.pdf)
- [Atlas 18/10/2026, PDF](https://cdn1.atlasintel.org/pesquisa_atlas_bloomberg__nacional_261019_1_4df1944681acf96f.pdf)
- [Listagem Atlas](https://www.atlasintel.org/polls/general-release-polls)
- [Quaest 21/10/2026, página do relatório](https://quaest.com.br/relatorios/pesquisa-de-intencao-de-voto-para-presidente-2o-turno-rodada-02-21-10-2026/)
- [Quaest 21/10/2026, PDF](https://quaest.com.br/wp-content/uploads/2026/10/QUAEST9PRESIDENCIAL2110.pdf), link descoberto no endpoint público WordPress `https://quaest.com.br/wp-json/wp/v2/media?parent=5119`
- [Datafolha 2022, artigo](https://datafolha.folha.uol.com.br/eleicoes/2022/10/na-vespera-da-eleicao-lula-tem-52-e-bolsonaro-48.shtml)
- [Datafolha 2022, PDF](https://media.folha.com.br/datafolha/2022/10/31/intencao-de-voto-presidente-2-turno.pdf)
- [Datafolha 2018, artigo](https://datafolha.folha.uol.com.br/eleicoes/2018/10/1983786-bolsonaro-chega-a-vespera-da-eleicao-com-55-dos-votos-validos.shtml)
- [Datafolha 2018, PDF](https://media.folha.uol.com.br/datafolha/2018/10/28/b469d4556e176c907bad8986ccc459cd.pdf)
- [Datafolha 2014, artigo](https://datafolha.folha.uol.com.br/eleicoes/2014/10/1538369-dilma-52-e-aecio-48-chegam-empatados-ao-dia-da-eleicao.shtml)
- [Datafolha 2014, PDF](https://media.folha.uol.com.br/datafolha/2014/10/25/intencao_de_voto_presidente_vespera_2_turno.pdf)

Não foram confirmadas todas as rodadas citadas no pedido, as pesquisas estaduais de segundo turno, as pesquisas históricas de outros institutos nem eventuais finais de Atlas/Quaest de 24/10. A ausência neste levantamento não prova que uma pesquisa não exista. O sitemap Datafolha consultado em 24/10 e novamente em 25/10 UTC listava 23/10 como publicação mais recente, embora a busca do contratante tenha localizado a rodada final de 24/10. Por isso, não usamos a ausência em sitemap como prova de ausência de pesquisa. A reconsulta PesqEle continuou retornando 403. Catálogos e respostas mais recentes estão preservados em `rodadas-finais-descobertas.json`.
