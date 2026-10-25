# Método e limites

## Antes de calcular

O texto do pedido é uma lista de alegações a verificar, não uma base oficial. Os resultados oficiais e os endereços de divulgação foram posteriormente confirmados, e os arquivos primários das pesquisas e seus cruzamentos foram preservados. A consulta direta ao PesqEle continua indisponível. A interface separa três situações: resultado observado do TSE, cenário condicional calculado com dados reais e premissas explícitas, e laboratório sintético. Um cenário condicional **não** é uma projeção com cobertura ou probabilidade empiricamente validadas. Ausências de medição não viram zeros.

O pedido autoriza usar referências históricas quando cruzamentos faltam, com incerteza larga. Essa autorização permite calcular cenários sob hipóteses declaradas; não autoriza preencher células como se tivessem sido observadas. Cada parâmetro recebe fonte ou rótulo de hipótese em `dados/model-assumptions.json`.

## De eleitores a votos

Cada município começa com a contagem oficial por comportamento no primeiro turno. Uma matriz de transferência distribui essas pessoas entre os dois candidatos, brancos, nulos e abstenção no segundo. As cinco saídas são não negativas e somam exatamente o eleitorado. Brancos e nulos permanecem separados; pesquisas que só divulgam a soma não permitem inventar essa divisão. Sem cruzamentos publicados, a matriz é uma premissa de cenário, não uma estimativa identificada.

Para município m, grupo de origem g e destino d:

`E_m = Σ_g n_mg; p_gd ≥ 0; Σ_d p_gd = 1; v_md = Σ_g n_mg p_gd`.

O arredondamento usa os maiores restos, com desempate pseudoaleatório reproduzível para não favorecer a primeira coluna, para preservar `Σ_d v_md = E_m`. A base oficial guarda ainda o eleitorado de seções não instaladas em um campo próprio: em 2026 são 423 pessoas. Portanto a identidade observada é `candidatos + brancos + nulos + abstenção + eleitorado de seções não instaladas = eleitorado total`. Esse resíduo não é reclassificado como abstenção observada. Para o cenário condicional, recebe grupo de origem separado `first:not-installed`, com regra de destino assumida e documentada. Exterior é uma circunscrição adicional, não um dos 27 estados. A base oficial de 2026 tem 5.571 municípios domésticos e 186 localidades no exterior. Códigos de município do TSE não são códigos IBGE.

## Pesquisas e calibração

A média considera apenas pesquisas verificadas, com datas, amostra e denominador conhecidos. Pesquisas em votos totais não entram como válidos sem uma conversão documentada. A ponderação é `w_i = sqrt(n_i) × 2^(-idade_i/5)`, normalizada entre pesquisas elegíveis. Campo futuro, registro ausente ou amostra desconhecida impedem inclusão. Efeitos de instituto exigem estimativa histórica documentada, sem correções arbitrárias.

Não se afasta da média sem evidência verificável. Uma correção baseada no primeiro turno precisa ser estimada sem consultar o segundo e comparada com uma versão sem correção no retrospecto. Para calibrar proporções válidas, usa-se `p'_m = logistic(logit(p_m) + δ)` e escolhe-se δ por bisseção para atingir o total nacional, ponderado pelos votos válidos. Correções regionais exigem alvos regionais verificados e nova reconciliação nacional. Calibração não altera o total de eleitores.

## Incerteza e simulação

O motor executa 20.000 sorteios em um Web Worker, com semente reproduzível. Cada sorteio combina perturbação nacional, regional e municipal na escala logística. Estados de uma mesma região compartilham o componente regional. A probabilidade de vitória é a fração dos sorteios em que os votos válidos de um candidato superam os do outro; o intervalo central de 80% usa os quantis 10 e 90. Empates são contabilizados separadamente. Percentuais municipais são inteiros. Toda estimativa exibe seu intervalo.

O componente histórico nacional é calculado com erros das pesquisas contra resultados oficiais, sem incluir o ano avaliado no retrospecto. Em 2026 há três eleições disponíveis (2014/2018/2022) e, para prever retrospectivamente 2022, apenas 2014/2018. O tamanho pequeno desse conjunto e o uso de um instituto impedem tratar a dispersão como conhecida. Desvio amostral, RMSE e hipótese adicional de incerteza estrutural são apresentados separadamente: não se chama um piso arbitrário de “erro histórico calculado”. Componentes regionais e municipais sem estimação confiável são hipóteses, identificadas como tais. As probabilidades condicionais descrevem esse cenário de parâmetros; **não** têm calibração eleitoral demonstrada. Nenhuma simulação sintética constitui validação retrospectiva de 2022 ou ensaio com dados reais de 2026.

## Cenário condicional com dados reais

A matriz de 2026 usa as linhas individuais efetivamente publicadas pela Quaest para os dois finalistas e os eliminados cobertos, com as margens de erro de subgrupos preservadas. Grupos não cobertos usam referência histórica ou hipóteses identificadas. Indecisos não são redistribuídos silenciosamente: a regra aparece na tabela de premissas. Brancos/nulos/não vai votar publicados juntos são divididos apenas por uma regra histórica assumida, sem alegar medição individual.

As taxas municipais de comparecimento e votos inválidos são ajustadas pela variação da eleição anterior: 2022 é referência para 2026; 2018 é referência para o retrospecto de 2022. A matriz e o ajuste de comparecimento são reconciliados sem duplicar pessoas. A calibração logística nacional usa a média parcial das publicações elegíveis, sem correção automática do erro de primeiro turno. Não há alvo estadual inventado onde faltam pesquisas estaduais.

O retrospecto condicional mede os erros do mesmo procedimento com a referência anterior e entradas documentadas. Dados de 2022 do segundo turno só entram como resultado de avaliação, nunca para estimar a matriz, o alvo ou os parâmetros de 2022. O fato de PDFs históricos serem arquivados depois da eleição é uma limitação de proveniência temporal, registrada junto dos resultados. Um teste retrospectivo medido não equivale a uma previsão produzida em 2022.

## Apuração e estimativa final

A rota de servidor `/api/apuracao` é o único acesso à divulgação. O endereço e o código da eleição precisam ser descobertos e confirmados em fonte oficial; não se tenta um código presumido. O cache e o bloqueio de requisições concorrentes limitam a busca a uma a cada 30 segundos por processo. Dados malformados, regressivos ou de outra eleição são rejeitados. Em falha, preserva-se o último boletim válido com a hora original, o atraso e o erro. Não se interpola resultado oficial.

A estimativa final, quando habilitada por dados e modelo validados, distingue votos contados de votos restantes: `V̂_md = V_contado,md + V_restante,m × p_ajustado,md`. O ajuste deve usar o desvio local e um agrupamento comparável do mesmo estado, com regularização e cobertura testadas em ordens de apuração realistas. Progresso de seções não é automaticamente progresso de votos. Sem evidência de votos restantes, o painel não calcula uma agulha estatística a partir apenas da porcentagem de seções. A presente implementação deve informar explicitamente se essa estimativa ainda não está validada.

## Congelamento e auditoria

`projecao-final.json` guarda o estado de congelamento. Um cenário condicional baseado em dados reais pode ser congelado **para auditoria**, com `validated:false`, limitações e âncoras pendentes explícitas. Congelar não transforma hipóteses em dados nem aprova cobertura. O procedimento exige horário UTC anterior à divulgação, código correto de eleição, 20.000 simulações concluídas, conservação sem violações, hashes das entradas e SHA-256 do conteúdo canônico. Verifica o boletim assinado do segundo turno antes de escrever e nunca substitui arquivo já congelado. Cenários do laboratório ficam isolados desse arquivo. Se o prazo tiver passado ou houver votos publicados, o congelamento é bloqueado. Toda comparação usa a versão congelada; controles criam rascunhos, sem alterar o arquivo final.

## Validação

Os testes verificam conservação do eleitorado em todos os sorteios, não negatividade, calibração, reprodutibilidade, pesos de pesquisas e o fluxo de cache/falha da apuração com fixtures sintéticas identificadas. As âncoras de soma oficial, retrospecto de 2022 e cobertura de 80% em replay real exigem conjuntos verificados: sem eles ficam pendentes, nunca aprovadas por um teste sintético. O relatório de auditoria separa implementado, testado, indisponível e pendente.
