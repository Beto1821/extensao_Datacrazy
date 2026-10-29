# Datacrazy – Filtro de Logs do Bloco

Extensão para Google Chrome que adiciona uma barra de filtro na aba **Logs** do bloco do CRM Datacrazy (`https://crm.datacrazy.io`). Com ela você filtra os logs por nome, telefone, status e período, encontra contatos repetidos e baixa o resultado em planilha (CSV).

Versão atual: **1.11.0**

Desenvolvido por **Adalberto Ribeiro** – Time Tigers Datacrazy.

---

## Baixar e instalar a extensão

A instalação leva uns 2 minutos e é feita uma vez só. Siga os passos na ordem.

### Passo 1 – Baixe o arquivo da extensão

Baixe o arquivo **`datacrazy-filtro-logs.zip`** da versão mais recente:

**[⬇ Baixar datacrazy-filtro-logs.zip](https://github.com/Beto1821/extensao_Datacrazy/releases/latest/download/datacrazy-filtro-logs.zip)**

Ou abra a [última versão](https://github.com/Beto1821/extensao_Datacrazy/releases/latest) e baixe o zip em **Assets**. Lá há dois arquivos com o mesmo conteúdo: `datacrazy-filtro-logs-vX.Y.Z.zip` (com a versão no nome) e `datacrazy-filtro-logs.zip` (nome fixo, usado pelo link acima).

> O repositório é privado: o link só funciona para quem tem acesso a ele no GitHub. Se você recebeu o zip por outro caminho (Drive, WhatsApp), pode usar esse arquivo.

### Passo 2 – Extraia o arquivo zip

1. Abra a pasta **Downloads** (ou onde o arquivo foi salvo).
2. Clique com o botão direito no zip (`datacrazy-filtro-logs.zip` ou `datacrazy-filtro-logs-vX.Y.Z.zip`).
3. Clique em **Extrair tudo...** e depois em **Extrair**.
4. Vai aparecer a pasta **`datacrazy-filtro-logs`** com:
   - `LEIA-ME.txt`: as instruções de instalação (fora da pasta da extensão, para achar fácil).
   - pasta **`extensao-datacrazy`**: a extensão.
5. Dentro da pasta `extensao-datacrazy` devem estar estes itens:
   - `manifest.json`
   - `lib.js`
   - `content.js`
   - `hook.js`
   - `styles.css`
   - pasta `icons` (logo da extensão)
   - `LEIA-ME.txt` (cópia das instruções)

> **Importante:** o Chrome não instala o arquivo `.zip` direto. Ele precisa da pasta extraída.

### Passo 3 – Coloque a pasta em um lugar fixo

Mova a pasta `extensao-datacrazy` para um lugar onde ela vai ficar para sempre, por exemplo `Documentos\extensoes\`.

> **Não apague nem mova essa pasta depois de instalar.** O Chrome usa a extensão direto dessa pasta. Se ela sumir, a extensão para de funcionar.

### Passo 4 – Abra a página de extensões do Chrome

Na barra de endereço do Chrome, digite o endereço abaixo e tecle **Enter**:

```
chrome://extensions
```

### Passo 5 – Ative o Modo do desenvolvedor

No canto **superior direito** da página, ligue a chave **Modo do desenvolvedor**. Vão aparecer novos botões no topo da página.

### Passo 6 – Carregue a extensão

1. Clique no botão **Carregar sem compactação**, no canto **superior esquerdo**.
2. Na janela que abrir, entre na pasta `extensao-datacrazy` (a que tem o `manifest.json` dentro).
3. Clique em **Selecionar pasta**.

### Passo 7 – Confira se instalou

A extensão **"Datacrazy – Filtro de Logs do Bloco"** aparece na lista, com a chave **ligada** (azul). Se aparecer um botão vermelho **Erros**, veja a seção [Problemas comuns](#problemas-comuns).

Opcional: clique no ícone de quebra-cabeça 🧩 ao lado da barra de endereço e fixe a extensão.

### Passo 8 – Teste no Datacrazy

1. Acesse `https://crm.datacrazy.io` e faça login. Se a página já estava aberta, tecle **F5** para recarregar.
2. Abra um bloco e vá na aba **Logs**.
3. A barra de filtro aparece acima da lista de logs. Pronto, está instalada.

---

## Como usar

No topo do painel de logs fica o seletor **Clássico | Crazy**:

- **Crazy** (padrão): barra de filtro e log completo carregado pela extensão, com cores por tipo (verde = sucesso, âmbar = alerta, vermelho = erro, azul = entrou), avatar, telefone formatado e separador por dia.
- **Clássico**: painel original do Datacrazy, sem nada da extensão.

A escolha fica salva no navegador. No modo Crazy, acima de cada lista de logs (Entraram, Sucessos, Alertas, Erros) aparece esta barra:

| Item | O que faz |
| ---- | --------- |
| **Campo de busca** | Filtra por nome, telefone ou status. Use vírgula para buscar vários termos de uma vez (funciona como "OU"). Exemplo: `maria, 11999999999`. Telefone pode ser digitado ou colado do jeito que aparece no card (`+55 (47) 93618-3266`, `(47) 93618-3266`, `93618-3266`): a busca compara só os números. |
| **De: / Até:** | Filtra os logs por período (data e hora). Clique no campo ou no botão vermelho **Escolher** (folhinha com o mês e o dia escolhidos; vazio = hoje) para abrir o calendário. Só com **De:**, vem até o log mais recente. Depois de **Carregar tudo**, mudar **De** ou **Até** busca de novo direto no Datacrazy com esse período. **O Datacrazy guarda só 7 dias de log**: datas mais antigas não trazem nada, e a barra mostra um aviso. |
| **Únicos por telefone** | Mostra só um log por telefone. |
| **Só repetidos** | Mostra só os contatos que aparecem mais de uma vez. |
| **Auto** | Ligado (padrão): ao abrir um bloco ou trocar de aba, a extensão já carrega o log inteiro sozinha. Desligue para carregar só quando clicar em **Carregar tudo**. A escolha fica salva. |
| **Carregar tudo** | Busca o log inteiro do bloco direto no servidor do Datacrazy, em páginas de 200 (3 ao mesmo tempo), e mostra numa lista própria. Enquanto carrega, aparece um aviso com o número de logs já carregados (e o total, quando o Datacrazy informa) e um botão **Cancelar**. |
| **Aba Parados** | Aba nova ao lado de **Erros** (só no modo Crazy). Mostra quem entrou no bloco e não tem log de sucesso nem de erro nele: a extensão abre a aba **Entraram** e cruza Entraram, Sucessos, Erros e Alertas pela sessão (um card por lead). Quem tem alerta nesse bloco ganha a tag **alerta**. Em bloco de **Espera**, quem ainda está esperando ganha a tag azul **em espera** (não está travado). Para sair, clique em qualquer outra aba (ou em **Entraram**, para a lista normal dela). |
| **Baixar CSV** | Carrega o log inteiro sozinho e baixa um arquivo `.csv` com os logs que passam no filtro. **Sem filtro, baixa todo o log da aba selecionada.** |
| **Limpar** | Remove todos os filtros. |

Outros detalhes:

- Com mais de 3.000 logs, a tela mostra os 3.000 primeiros (o contador avisa). O **Baixar CSV** sempre leva todos.
- Os cards repetidos ganham a etiqueta **"repetido Nx"**.
- O contador **"Mostrando X de Y"** indica quantos logs passaram no filtro.
- O filtro continua valendo ao trocar entre as abas Entraram, Sucessos, Alertas e Erros.
- **Clique num log** da lista: o Datacrazy desenha o caminho daquela sessão em cima dos blocos (ordem e horário em que entrou em cada um), igual ao card do modo Clássico. Clique de novo no mesmo log para apagar.
- **Nome e telefone em todos os blocos**: blocos antes do "Criar lead" (por exemplo, o Início com webhook) não trazem lead nem contato no log, e o bloco "Criar lead" traz o nome sem o telefone. Nesses logs a extensão busca os dados da sessão e mostra o nome e o telefone que chegaram no webhook. Os nomes aparecem aos poucos, logo depois da lista carregar. A busca, os filtros e o CSV também usam esses dados.
- **Mensagem de erro traduzida**: na aba Erros, cada log mostra a mesma frase do modo Clássico (por exemplo, "O número de telefone do destinatário não é um número de WhatsApp válido..."), abaixo da etiqueta **✕ Erro**. O código original (`chat.errors.invalid-whatsapp-number`) aparece ao parar o mouse sobre a etiqueta. A busca acha pela frase ou pelo código, e o CSV leva a frase na coluna `status`.
- **Reprocessar (▶)**: cada log com sessão tem um botão ▶, em todas as abas (Entraram, Sucessos, Alertas, Erros). Ele reprocessa a sessão daquele lead a partir do bloco aberto, igual ao ▶ do modo Clássico, um lead por vez. Antes de enviar, aparece uma confirmação com o nome do lead e do bloco. **Atenção:** o reprocesso é de verdade: mensagens desse bloco em diante são enviadas de novo. Depois do envio, o card ganha a tag verde **reprocessado** ou a vermelha **falhou: ...** (com o motivo; o ▶ volta a funcionar para tentar de novo). A tag **reprocessado** fica salva no navegador (localStorage) por 7 dias: continua no card depois de recarregar a lista ou a página (F5), junto com as outras tags. Parando o mouse sobre ela aparece a data e hora do reprocesso. Ela só marca o que foi reprocessado por esta extensão, neste navegador.
- **Reprocessar vários de uma vez**: cada log tem uma caixinha. **Selecionar todos** marca os logs que passam no filtro. **Reprocessar selecionados (N)** pede confirmação e reprocessa um lead por vez a partir do bloco aberto; o botão mostra o progresso e um segundo clique cancela. No fim, o contador mostra quantos foram reprocessados e quantos falharam. Os que falharam continuam marcados para tentar de novo. A mesma sessão repetida no bloco é reprocessada uma vez só. Vale em todas as abas, inclusive **Parados**.
- **Ícone de banco de dados** no log: abre a inspeção da sessão, com os metadados, os parâmetros, os datasources e o histórico de blocos (nome, horário e tempo em cada bloco). Mostra em árvore ou JSON puro (**Raw**), e o botão **Copiar JSON** copia a seção aberta.

### Sobre o arquivo CSV

- Nome do arquivo: `logs-<aba>-<data>_<hora>.csv` (`logs-parados-...` na lista de parados), salvo na pasta **Downloads**.
- Colunas: `data;status;lead;contato;telefone`, separadas por `;`.
- Abre direto no Excel com os acentos corretos. No Google Sheets, use **Arquivo > Importar** e escolha o separador `;`.
- Sem data **De**, o CSV usa o período do seletor do próprio Datacrazy (por exemplo, "Última semana"). Para baixar logs mais antigos, preencha **De** com a data inicial.

### Como a extensão busca os logs

Quando você clica num bloco, o Datacrazy chama a rota de logs (`/api/crm/flows/.../logs?take=30&skip=0...`). A extensão observa essa chamada (arquivo `hook.js`) e reaproveita a mesma rota, com o seu login, para buscar todas as páginas de uma vez. Nenhum dado sai do seu navegador.

Se a rota falhar (por exemplo, sessão expirada), a extensão volta ao modo antigo: rola a lista da página até o fim, o que é mais lento. Ao trocar de bloco ou de aba no Datacrazy, a lista volta a ser a original da página. Recargas da mesma aba (por exemplo, o seletor "Última semana") não apagam a lista carregada.

Para os logs sem nome ou telefone, a extensão também chama `/api/crm/flow-sessions/<sessão>/details` (6 ao mesmo tempo, uma vez por sessão) e usa `parameters.leadName`/`leadPhone` ou o nome e telefone do datasource do webhook.

O ▶ chama `POST /api/crm/flow-sessions/<sessão>/reprocess` com `{"reprocessFromBlockId": "<bloco>"}`, a mesma chamada do ▶ do Clássico. Ele não repete o pedido sozinho em caso de erro, para não enviar mensagem duas vezes.

O log de erro traz só o código (por exemplo, `chat.errors.invalid-whatsapp-number`). A tradução vem do próprio Datacrazy: o `hook.js` lê as frases de erro que a página já carregou (as mesmas que o modo Clássico usa), sem nenhuma chamada a mais. Código sem tradução aparece como está.

Se uma página demorar mais de 30 segundos, a extensão tenta de novo (até 3 vezes). Se mesmo assim falhar no meio, mostra o que já veio com o aviso **"incompleto"** no contador.

---

## Atualizar para uma nova versão

1. Baixe o zip mais recente em [https://github.com/Beto1821/extensao_Datacrazy/releases/latest/download/datacrazy-filtro-logs.zip](https://github.com/Beto1821/extensao_Datacrazy/releases/latest/download/datacrazy-filtro-logs.zip) e extraia (passos 1 e 2).
2. Copie o conteúdo da nova pasta `extensao-datacrazy` (arquivos e pasta `icons`) por cima da pasta da extensão que você já usa.
3. Abra `chrome://extensions` e clique no ícone de recarregar (seta circular) no card da extensão.
4. Recarregue a página do Datacrazy (F5).

## Remover a extensão

Abra `chrome://extensions` e clique em **Remover** no card da extensão. Depois, se quiser, apague a pasta `extensao-datacrazy`.

---

## Problemas comuns

| Problema | Solução |
| -------- | ------- |
| Não aparece o botão **Carregar sem compactação** | Ative o **Modo do desenvolvedor** (passo 5). |
| Erro "Manifest file is missing or unreadable" | A pasta selecionada não é a que contém o `manifest.json`. Comum quando o zip cria uma pasta dentro de outra: entre até a pasta que tem o `manifest.json`. |
| Erro "Manifest is not valid JSON" ou "Could not load javascript 'content.js'" (ou 'lib.js') | Algum arquivo está faltando ou com nome trocado (por exemplo, `manifest (2).json`). Baixe e extraia o zip de novo. |
| Erro "Could not load icon" | Falta a pasta `icons` dentro da pasta da extensão. Baixe e extraia o zip de novo. |
| A barra não aparece | Confirme que a extensão está ligada, que o endereço é `crm.datacrazy.io` e recarregue a página (F5). |
| Faltam logs na tela | Clique em **Carregar tudo** antes de filtrar. O **Baixar CSV** já carrega tudo sozinho. |
| "Mostrando 0 de N" com período preenchido | O período está fora dos últimos 7 dias, que é o que o Datacrazy guarda. Veja o aviso amarelo na barra. |
| Contador mostra "incompleto" | Uma página do Datacrazy não respondeu. Clique em **Carregar tudo** de novo. |
| **Carregar tudo** ficou lento (rolando a lista) | A busca direta falhou. Clique no bloco de novo (para o Datacrazy refazer a chamada) e tente outra vez. Se continuar, recarregue a página (F5). |
| Logs de março não aparecem quando a extensão rola a lista (busca direta falhou) | A versão 1.8.0 e as anteriores não reconheciam a data com "ç". Atualize para a 1.8.1 ou mais nova. |
| Log aparece como "(sem lead)" ou sem telefone | Os nomes e telefones da sessão chegam aos poucos depois da lista carregar: espere alguns segundos. Se continuar, o webhook daquela sessão chegou sem nome e sem telefone (abra o ícone de banco de dados e veja **Datasources**). Precisa da versão 1.8.0 ou mais nova. |
| Erro aparece só com o código (`chat.errors...`), sem a frase | Versão 1.8.1 e anteriores não traduziam. Atualize para a 1.8.2 ou mais nova. Se continuar, o Datacrazy ainda não tem tradução para esse código. |
| Lead aparece em **Parados** mas já seguiu no fluxo | O log de sucesso dele pode estar fora do período (De/Até ou mais de 7 dias), ou o bloco registra a saída de outro jeito. Confira pelo ícone de banco de dados (**Histórico**) antes de reprocessar. Se a carga de alguma aba falhar, o contador mostra "incompleto": clique na aba **Parados** de novo. |
| Tag **falhou: HTTP 4xx** depois do ▶ | O Datacrazy recusou o reprocesso daquela sessão. Clique no bloco de novo (para renovar o login da rota) e tente outra vez. Se continuar, teste o ▶ do modo Clássico no mesmo card: se ele também falhar, a sessão não pode ser reprocessada. |
| O calendário de **De:** / **Até:** não abre | Versão 1.7.0 tinha esse erro. Atualize para a 1.7.1 ou mais nova (veja [Atualizar](#atualizar-para-uma-nova-versão)) e clique em recarregar no card da extensão. |
| O Chrome bloqueia o download | Permita downloads para `crm.datacrazy.io` nas configurações do Chrome. |
| Aviso "Desativar extensões no modo desenvolvedor" ao abrir o Chrome | É normal para extensões instaladas por pasta. Feche o aviso (não clique em desativar). |

---

## Arquivos do projeto

| Arquivo | Conteúdo |
| ------- | -------- |
| `manifest.json` | Configuração da extensão (nome, versão, site onde roda) |
| `lib.js` | Funções sem tela e sem rede usadas pelo `content.js`: leitura dos logs e dos cards, filtro, formatação de telefone e data, nome e telefone da sessão. Os testes de unidade testam este arquivo |
| `content.js` | Código que cria a barra, busca os logs, completa nome e telefone pela sessão, aplica os filtros, gera o CSV e abre a inspeção da sessão |
| `hook.js` | Observa a chamada do Datacrazy à rota de logs, para a extensão reaproveitá-la, desenha o caminho da sessão nos blocos ao clicar num log e abre o calendário dos campos de data (roda no mundo da página, onde o `showPicker()` do Chrome funciona) |
| `styles.css` | Estilo da barra, da lista, dos campos de data e do modal de inspeção |
| `icons/` | Logo da extensão em 16, 32, 48 e 128 px (gerados a partir de `DC.png`) |
| `DC.png` | Logo original em alta resolução (não vai no zip) |
| `LEIA-ME.txt` | Instruções de instalação que vão no zip, na raiz e dentro da pasta da extensão (abre no Bloco de Notas) |
| `datacrazy-filtro-logs.zip` | Pacote para distribuir: `LEIA-ME.txt` + pasta `extensao-datacrazy` com os arquivos acima (menos `DC.png` e `teste/`) |
| `teste/` | Testes automáticos (veja [Testes](#testes)). Não vai no zip |

### Publicar uma versão nova

1. Altere o código e aumente a versão no `manifest.json` (e no `LEIA-ME.txt` e no topo deste README).
2. Faça commit e push para a branch `main`.

A GitHub Action [`release.yml`](.github/workflows/release.yml) percebe a versão nova, roda os testes (se algum falhar, não sai release), monta o zip e cria a release sozinha, com dois arquivos iguais: `datacrazy-filtro-logs-vX.Y.Z.zip` (versão no nome) e `datacrazy-filtro-logs.zip` (nome fixo). O link `/releases/latest/download/datacrazy-filtro-logs.zip` passa a entregar a versão nova na hora; por isso o arquivo de nome fixo não pode ser renomeado. Se a versão já tiver release, a Action não faz nada.

### Testes

Os testes ficam na pasta `teste/` e precisam do Node.js 22 ou mais novo. Na primeira vez, instale:

```bash
cd teste
npm install
npx playwright install chromium
```

| Comando | O que testa | Precisa de login? |
| ------- | ----------- | ----------------- |
| `npm run unit` | Funções do `lib.js`: leitura dos logs e dos cards (inclusive datas de março), filtro (vírgula, telefone com máscara, período, únicos, repetidos), telefone formatado, nome e telefone da sessão. Também confere o pacote: arquivos do `manifest.json`, arquivos que a release coloca no zip e versão igual no README e no LEIA-ME. Leva menos de 1 segundo. | Não |
| `npm run mock` | A extensão inteira num **CRM falso** (`teste/mock/crm-falso.js`), sem internet: nome e telefone pela sessão, no máximo 6 sessões ao mesmo tempo e cache entre abas, paginação de 93 em 93, erro 500 na sessão e na página de logs (aviso "incompleto"), assinatura velha (401), busca e CSV, Clássico/Crazy e nome com HTML. Leva uns 30 segundos. | Não |
| `npm test` | `unit` + `mock`. É o que o GitHub roda a cada push ([`testes.yml`](.github/workflows/testes.yml)) e antes de cada release. | Não |
| `npm run real -- <link do flow>` | Abre o Chromium com a extensão no **Datacrazy de verdade**, passa por todos os blocos e abas do flow e mostra um relatório. Por bloco e aba, mostra quantos logs o Datacrazy diz ter, quantos a extensão mostra, quantos ficaram sem nome ou sem telefone, o tempo e os problemas encontrados. | Sim |

Sobre o `npm run real`:

- Exemplo: `npm run real -- https://crm.datacrazy.io/flow/e747f993-8056-4e4e-b3b1-fd2ec861a7e5`.
- Na primeira vez, faça login na janela que abrir. O teste espera até 10 minutos. O login fica salvo em `~/.cache/dcf-teste-perfil`, fora do OneDrive e do git (outra pasta: variável `DCF_PERFIL`).
- O relatório completo vai para `teste/relatorios/` (fora do git, porque tem ids de sessão). Ele lista até 5 sessões sem nome por aba. Abra essas sessões no ícone de banco de dados para ver por que vieram vazias. Em geral, o webhook chegou sem nome e sem telefone.
- Termina com código 1 se achar problema: a extensão mostra um total diferente do Datacrazy, a lista travou, a carga ficou "incompleto" ou deu erro de JavaScript da extensão. Erros do próprio Datacrazy aparecem no relatório, mas não contam como problema.
- Rode depois de mudar o código ou quando o Datacrazy lançar novidade: é o único teste que percebe se o Datacrazy mudou a rota ou o nome de um campo.

---

© 2026 Adalberto Ribeiro – Time Tigers Datacrazy. Todos os direitos reservados.
