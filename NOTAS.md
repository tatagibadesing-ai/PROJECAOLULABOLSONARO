# Estado da entrega e limites

## Implementado

Dashboard Next.js/React/TypeScript/Tailwind com três modos, dados oficiais reconciliados, apuração nacional/UF assinada, consulta municipal sob demanda, mapa estadual e **5.571 polígonos municipais em canvas**, com códigos oficiais TSE↔IBGE. A malha IBGE 2025 inclui Boa Esperança do Norte.

A projeção **condicional sobre dados reais** executou 20.000 simulações em 5.757 localidades, com intervalos de percentuais e cinco contagens, premissas interativas, fluxos quantitativos, distribuição e retrospecto medido de 2022. O laboratório sintético continua separado.

O cenário foi congelado em `projecao-final.json` antes da apuração, com data, SHA-256 canônico, hashes das entradas/método e consulta nova ao TSE com zero votos. O script impede substituição, congelamento depois do prazo ou após votos publicados. **Congelamento para auditoria não constitui aprovação estatística.**

Há inicializadores Windows/macOS/Linux e pacote independente. O fluxo JavaScript foi testado em cópia extraída em Linux: instalação por lockfile, porta alternativa e resposta real antes de abrir o navegador. Windows/macOS foram preparados, mas não executados nesses sistemas.

## Limites estatísticos e de fonte

A média é parcial: cinco publicações em válidos, incluindo Datafolha de 24/10. Quaest em votos totais aparece separada. PesqEle retorna 403; registros são declarações das fontes primárias, sem consulta direta ao cadastro. Não afirmamos catálogo completo, especialmente nas pesquisas estaduais.

Os cruzamentos individuais melhoram a matriz, mas não identificam separadamente indecisos, brancos, nulos e abstenção. Divisão, retenções faltantes e retorno de não votantes são hipóteses explícitas. A variação municipal anterior e sua regularização não são leis comportamentais. Os aptos em seções não instaladas permanecem origem distinta, sem alterar a abstenção observada.

O componente nacional histórico usa três eleições de um instituto; componentes estruturais, regionais e municipais são assumidos separadamente. **Chances e intervalos são condicionais, sem calibração eleitoral comprovada.** O retrospecto cobrir 27/27 estados não aprova cobertura de 80%. Os PDFs históricos posteriores à eleição impedem certificar a versão documental como prospectiva.

## Apuração e estimativa final

Votos oficiais nunca são interpolados. Nacional e 28 circunscrições são consultados em ciclos; municípios, sob demanda, sem 5.571 requisições por ciclo. Assinaturas, identidades, totais e regressões são verificadas. Cache local persiste JWS em `dados/local/`; ao reiniciar, reverifica assinaturas e preserva horários, sem fingir atualização nova. O cache não é incluído no ZIP ou Git.

A agulha usa votos contados mais votos restantes **estimados pelo cenário**, corrigidos pelo desvio observado. Não transforma seções em votos. A estimativa nacional agrupa UFs, pois não foi localizado arquivo único com votos de todos os municípios; a cidade selecionada usa consulta e estimativa próprias. A faixa fecha no resultado final. **A cobertura durante a apuração ainda não foi demonstrada em aproximadamente 80%.**

O ensaio reproduz o primeiro turno completo em três ordens e termina nos totais exatos, mas não reconstitui uma série original de boletins: horários são finais municipais e fusos aproximados por UF. A âncora 6 permanece pendente estatisticamente; nenhuma taxa é fabricada para aprová-la.

Histórico em disco guarda somente boletins recebidos. A trajetória da estimativa observada na sessão é identificada separadamente, com intervalo. Não se reconstrói passado quando a coleta não estava funcionando.

## Desempenho e distribuição

O mapa usa canvas, buffers reutilizados e identificação por polígono. **Não foram certificados 60 fps em todos os celulares.** Simulações municipais completas ficam em Web Worker, podem levar cerca de um minuto por alteração extensa, e a tela indica progresso. Não se chama resultado antigo de novo cálculo concluído.

Um processo local usa cache em disco. Várias instâncias Vercel ainda exigem coletor/cache/trava compartilhados para garantir limite global de consulta. Nenhum deploy externo foi realizado.

O pacote local inclui código, dados web, documentos e boletins assinados para auditoria. O completo inclui também originais volumosos para reconstrução integral; o manifesto discrimina arquivos e hashes. Não há credenciais, `.git`, `node_modules` ou cache da sessão.

## Particularidades oficiais

São 5.571 municípios, 186 localidades exteriores e 499.248 seções principais. Os 423 aptos de seções não instaladas ficam separados na base. Os 688 aptos não conciliados de 2014 são preservados como discrepância da fonte; nominal e válidos seguem conferidos. Votos anulados em separado em 2018 também são preservados.
