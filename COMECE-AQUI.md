# Rodar no seu computador

O localhost da máquina na nuvem **não é o localhost do seu computador**. Este pacote instala e inicia uma cópia no seu próprio computador; o navegador só é aberto depois que essa cópia responder.

Sistemas-alvo: Windows 10/11 de 64 bits e macOS/Linux compatíveis com Node.js 24.

1. Baixe o ZIP e use **Extrair tudo**. Não execute os arquivos dentro da visualização do ZIP.
2. No Windows, dê dois cliques em **INICIAR-WINDOWS.cmd**.
3. No macOS, abra o Terminal na pasta extraída e execute `sh INICIAR-MAC.command`. Você também pode tornar esse arquivo executável para abri-lo com dois cliques.
4. No Linux, abra o terminal na pasta extraída e execute `sh INICIAR-LINUX.sh`.

Na primeira vez, é necessária internet para baixar o Node.js, se não houver uma versão compatível, e as dependências. O Node portátil vem de **nodejs.org**, com SHA-256 conferido contra o manifesto oficial preservado. Ele fica em `.runtime/` e não substitui seu Node do sistema. As dependências são instaladas com pnpm 11.25.0 e o lockfile congelado.

O navegador abre automaticamente em `http://localhost:3000`. Se essa porta estiver ocupada, o inicializador tenta até 3010 e mostra o endereço correto. Mantenha a janela aberta; **Ctrl+C** encerra o servidor. Para abrir novamente, execute o mesmo inicializador: ele reutiliza as dependências.

O dashboard usa os arquivos de dados incluídos. Para receber novos boletins oficiais, o computador precisa acessar `resultados.tse.jus.br` por HTTPS. Uma falha de internet aparece no painel com o horário do último boletim, sem fabricar votos.

## Alternativa para quem já usa Node/pnpm

```sh
pnpm install --frozen-lockfile
pnpm dev
```

## O que foi testado

O inicializador JavaScript e o fluxo completo foram testados em Linux, inclusive com a porta 3000 ocupada. Os arquivos de Windows e macOS foram preparados, mas não executados nesses sistemas neste ambiente. Se aparecer uma mensagem de erro, preserve-a para diagnóstico.

Consulte `README.md`, `METODO.md`, `LEITURA.md` e `AUDITORIA.md` para os detalhes e as limitações estatísticas. Não confunda cenários condicionais com resultados oficiais ou validação de cobertura.
