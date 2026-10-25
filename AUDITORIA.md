# Auditoria crítica independente — rodada final 3/3

**Os componentes abaixo passaram nos escopos indicados. A aprovação integral das sete âncoras continua pendente: não foi demonstrada cobertura eleitoral de 80%, e a proveniência temporal do documento retrospectivo de 2022 não está certificada. PENDING não conta como PASS.** Esta é a terceira e última rodada prevista no pedido; não se substitui validação estatística por testes de software.

O revisor leu o pedido integral, as instruções do projeto, o método, as hipóteses, os arquivos oficiais e o código, em contexto novo. Executou verificações próprias após o responsável declarar os arquivos estáveis. Uma subauditoria somente leitura verificou a cartografia. Resultados atribuídos ao responsável são distinguidos das execuções próprias.

## As sete âncoras

| Âncora | Resultado | Evidência e limite do escopo |
| --- | --- | --- |
| 1. Primeiro turno exato | **PASS** | Municípios → UF → Brasil fecham voto por voto. Verificação própria de **29 assinaturas Ed25519**, **348 totais de candidatos** e **232 totais auxiliares** contra JWS oficiais: zero divergências. São **5.571 municípios domésticos e 186 localidades exteriores**; a contagem oficial prevalece sobre os 5.570 do pedido. |
| 2. O modelo em 2022 | **PASS na execução e pontuação; PENDING na certificação temporal e estatística** | Mesmo procedimento condicional, com comportamento de **2018** e erros históricos somente de **2014/2018**. O resultado de 2022 entra na avaliação, não na estimativa desses parâmetros. Recontagem própria: erro da margem nacional **−2,16 pp**, MAE estadual de participação **1,76 pp**, 27 UFs avaliadas e **27/27** resultados dentro das faixas condicionais. Sem/com correção coincidem porque o coeficiente documentado é zero, conforme a regra de não afastar da média sem evidência. O PDF histórico foi disponibilizado depois da eleição; não se certifica sua versão como prospectiva. Cobertura observada de 100% não comprova calibração de 80%. |
| 3. Toda simulação fecha | **PASS no cenário condicional real de 2026** | Reexecução independente de **20.000 × 5.757 = 115.140.000 verificações municipais**, zero violações, contagens inteiras não negativas e eleitorado de **158.745.502**. O resultado nacional completo e os resumos das 28 circunscrições e 5.757 localidades reproduziram o artefato. As cinco contagens e seus intervalos foram examinados; médias municipais e estaduais reconciliam com o Brasil. Isso comprova conservação, não acurácia eleitoral. |
| 4. Neutralidade | **PASS no texto, gráficos e estilo examinados** | Ordem Flávio/Lula nos pares, tabela, fluxo, histograma e trajetória. Azul e vermelho definidos em **oklch(70% .16 255)** e **oklch(70% .16 25)**, com mesma luminosidade e croma; escalas espelhadas usam a mesma regra. Chromium confirmou largura, tamanho e peso tipográfico iguais. Não foram encontrados qualificativos favoráveis a um candidato ou recomendação de voto. |
| 5. Precisão honesta | **PASS para apresentação dos cenários condicionais concluídos** | Participações nacionais com uma casa, chances condicionais inteiras, municípios com percentuais inteiros e intervalos de ambos os candidatos. Abstenção, brancos e nulos também têm intervalos. Comparações e trajetória mostram faixas junto das estimativas. Durante alteração de premissa, a prévia é identificada como rascunho determinístico, com chances/faixas indisponíveis e aviso de cálculo; não recebe intervalo antigo como se fosse novo. Os rótulos não validam a cobertura: ela permanece pendente nas âncoras 2/6. |
| 6. Ensaio e domingo | **PASS no fluxo coberto pelos testes; PENDING na cobertura de 80% e no escopo integral solicitado** | Base real de 2026, 12 candidatos, três ordens × 101 etapas, conservação e término exato em Brasil/UFs. Há estimativa condicional que preserva votos contados e converge ao final, persistência de boletins assinados e consulta municipal sob demanda. **O replay ainda devolve statisticalEstimate=null e intervalCoverage=null**: não demonstrou conter o resultado em cerca de 80% dos pontos. A estimativa nacional opera por UF; não equivale ao modelo nacional alimentado simultaneamente por todas as cidades solicitado. Não se declara prontidão estatística integral para domingo. |
| 7. Nunca inventar ao vivo | **PASS no comportamento examinado** | Somente servidor acessa a divulgação; exige assinatura, eleição, turno, escopo, candidatos e totais. Cache/falhas/regressões preservam dado e hora originais; reinício reverifica o JWS em disco. Idade usa geração do boletim, não a última consulta. Estimativas de votos restantes são rotuladas e separadas da contagem oficial. Zero válidos gera percentual indisponível, preservando a contagem oficial zero. |

## Evidência própria executada

- **66/66 testes unitários**, zero reprovados, ignorados ou cancelados; TypeScript aprovado. Incluem coleta, assinatura, cache/persistência/falha, consulta municipal, retrospecto, separação temporal dos parâmetros, kernel, congelamento, inicializador e replay.
- **pnpm audit:data:** 17.346 territórios nas bases principais; agregações exatas; 12 candidatos de 2026 reconciliados com a divulgação assinada. SHA-256 do primeiro turno normalizado: `fc5396620822c64ac182b9ded92a75d816e4948311a383b776a5b98b2ce7a948`.
- **Reexecução integral do kernel servido ao Web Worker:** 115.140.000 verificações reais, zero violações, **66,085 segundos nesta máquina**. Reprodução exata do resumo nacional e das médias/faixas/chances municipais. Esse tempo não é promessa para o computador do usuário.
- **Artefato condicional:** 92.112 linhas de origem conservadas; 5.786 resumos com probabilidades mais empates somando 1 e faixas válidas para os cinco destinos. Onze hashes de entradas conferidos. As cinco pesquisas elegíveis incluem a Datafolha final de 24/10; o alvo de **50,7968829214%** coincide numericamente com a média parcial exibida. A média dos sorteios é **50,7822329604%**, pequena diferença da transformação logística, não correção arbitrária de instituto. Casas adicionais aqui identificam o cálculo auditado, não a precisão eleitoral apresentada ao público.
- **Cartografia, subauditoria somente leitura:** 30 hashes/tamanhos conferidos, duas fontes e 28 saídas; 5.571 IDs coincidem entre a base TSE, o CSV oficial de correspondência, o crosswalk, o arquivo nacional e a união das UFs. Shapely confirmou 5.571 geometrias válidas e não vazias, sem associação aproximada por nome.
- **Chromium em 1.440 × 1.000 e 390 × 844:** sem transbordamento horizontal ou pageerror. Candidatos com larguras iguais, 422,3 px no desktop e 152,7 px no celular; fonte e peso iguais. Intervalos de ambos visíveis. Canvas de MG com 853 polígonos e seleção sincronizada; renderização inicial observada de 23,3/48 ms e pintura de hover de 0–0,1 ms. **Não foi certificado 60 fps em aparelhos móveis.**
- **Interação real com premissa:** prévia de 50,8% para 52,8%, faixas/chances retiradas durante o cálculo e sem erro JavaScript. Teste final com movimento reduzido: nenhum consoleerror de hidratação. Bridgetown, localidade real com zero válidos, mostrou “—” nos dois percentuais e manteve zero válidos.

O responsável confirmou separadamente **build de produção sem avisos**, instalação por lockfile em pacote extraído em pasta independente e resposta real do aplicativo numa porta alternativa quando a padrão já estava ocupada. Windows e macOS não foram executados nesses sistemas; não se converte esse preparo em teste realizado.

O agente da interface confirmou a execução final de **12/12 E2E aprovados**, seis fluxos em desktop e celular, em aproximadamente **2,4 minutos**. Incluiu dois cálculos completos no Web Worker de 20.000 × 5.757 localidades, hash congelado inalterado, premissas, laboratório, replay, boletim antigo, canvas de SP com 645 municípios, exterior com zero válidos e ausência de erros JavaScript/hidratação. Esses resultados complementam as inspeções próprias acima; não validam cobertura eleitoral.

## Congelamento para prestação de contas

`projecao-final.json` está em **frozen-conditional**, gerado em **2026-10-25T00:17:11.194Z**, equivalente a **24/10, 21h17 de Brasília**, antes do prazo. A consulta oficial nova registrada no congelamento confirmou eleição 6258, turno 2 e zero seções totalizadas. O script exige execução municipal completa, conserva o eleitorado, rejeita cache antigo, votos publicados, prazo encerrado e substituição de arquivo já congelado.

A verificação própria de `scripts/verify-projection.mjs` confirmou os **11 hashes de entrada**, o método e o SHA-256 canônico:

`88afe2a46f087ea62cb31617e4799138cf81ec1ffd4cc90776a5ec67a3d22550`

O arquivo registra `publicationReady:false`, `coverageValidated:false` e âncoras pendentes. **Congelar não aprova probabilidades ou cobertura.** As comparações usam sua projeção; controles criam rascunhos e não alteram o arquivo.

## Achados corrigidos nesta rodada

1. A rodada final de 24/10 e a média usada na tela passaram a obedecer ao mesmo critério e à mesma referência temporal do alvo de calibração.
2. Diferenças, comparação e estimativa usam a mesma base congelada quando disponível.
3. Trajetória e tabela de comparação receberam intervalos dos dois candidatos; chances passaram a inteiros. O diagnóstico ecológico sem distribuição foi retirado do seletor público do retrospecto.
4. As 41 localidades exteriores com zero válidos deixaram de produzir divisão por zero/NaN no detalhe oficial.
5. A prévia de controles recebeu guardas para intervalos ausentes, evitando erro durante o Monte Carlo. O banner ganhou estado inicial determinístico, corrigindo divergência de hidratação com movimento reduzido.

## O que continua sem aprovação

- Catálogo de pesquisas parcial, sem confirmação direta no PesqEle, que respondeu 403; cobertura estadual e cruzamentos incompletos continuam declarados.
- Três eleições de um instituto não identificam toda a distribuição nacional. O RMSE histórico medido e os componentes estruturais, regionais, municipais e comportamentais assumidos permanecem separados. Hipóteses não são medições individuais nem probabilidades calibradas.
- Falta validar a cobertura da agulha nas sequências de apuração. Os 27 estados do retrospecto são correlacionados e não substituem esse ensaio.
- Coleta nacional por UF e municipal sob demanda não equivalem à ingestão simultânea de todas as cidades. Histórico guarda somente boletins recebidos; não reconstitui períodos em que o aplicativo esteve fechado.
- Cache/trava locais atendem um processo no PC. Múltiplas instâncias Vercel requerem coordenação compartilhada. Nenhum deploy externo foi verificado nesta revisão.

**Conclusão da rodada 3/3:** conservação, fontes oficiais reconciliadas, congelamento condicional e os comportamentos operacionais examinados têm evidência positiva. Permanecem **PENDING** a certificação temporal do retrospecto e a cobertura estatística exigida. A entrega não recebe aprovação integral das sete âncoras, nem autorização para alegar probabilidades eleitorais calibradas.
