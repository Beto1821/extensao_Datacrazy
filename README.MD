# Datacrazy – Filtro de Logs do Bloco

Extensão para Google Chrome que adiciona uma barra de filtro na aba **Logs** do bloco do CRM Datacrazy (`https://crm.datacrazy.io`). Com ela você filtra os logs por nome, telefone, status e período, encontra contatos repetidos e baixa o resultado em planilha (CSV).

Versão atual: **1.7.2**

Desenvolvido por **Adalberto Ribeiro** – Time Tigers Datacrazy.

---

## Baixar e instalar a extensão

A instalação leva uns 2 minutos e é feita uma vez só. Siga os passos na ordem.

### Passo 1 – Baixe o arquivo da extensão

Baixe o arquivo **`datacrazy-filtro-logs.zip`** da versão mais recente:

**[⬇ Baixar datacrazy-filtro-logs.zip](https://github.com/Beto1821/extensao_Datacrazy/releases/latest/download/datacrazy-filtro-logs.zip)**

Ou abra a [última versão](https://github.com/Beto1821/extensao_Datacrazy/releases/latest) e baixe o zip em **Assets**.

> O repositório é privado: o link só funciona para quem tem acesso a ele no GitHub. Se você recebeu o zip por outro caminho (Drive, WhatsApp), pode usar esse arquivo.

### Passo 2 – Extraia o arquivo zip

1. Abra a pasta **Downloads** (ou onde o arquivo foi salvo).
2. Clique com o botão direito em `datacrazy-filtro-logs.zip`.
3. Clique em **Extrair tudo...** e depois em **Extrair**.
4. Vai aparecer a pasta **`datacrazy-filtro-logs`** com:
   - `LEIA-ME.txt`: as instruções de instalação (fora da pasta da extensão, para achar fácil).
   - pasta **`extensao-datacrazy`**: a extensão.
5. Dentro da pasta `extensao-datacrazy` devem estar estes itens:
   - `manifest.json`
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
| **Baixar CSV** | Carrega o log inteiro sozinho e baixa um arquivo `.csv` com os logs que passam no filtro. **Sem filtro, baixa todo o log da aba selecionada.** |
| **Limpar** | Remove todos os filtros. |

Outros detalhes:

- Com mais de 3.000 logs, a tela mostra os 3.000 primeiros (o contador avisa). O **Baixar CSV** sempre leva todos.
- Os cards repetidos ganham a etiqueta **"repetido Nx"**.
- O contador **"Mostrando X de Y"** indica quantos logs passaram no filtro.
- O filtro continua valendo ao trocar entre as abas Entraram, Sucessos, Alertas e Erros.
- **Clique num log** da lista: o Datacrazy desenha o caminho daquela sessão em cima dos blocos (ordem e horário em que entrou em cada um), igual ao card do modo Clássico. Clique de novo no mesmo log para apagar.
- **Ícone de banco de dados** no log: abre a inspeção da sessão, com os metadados, os parâmetros, os datasources e o histórico de blocos (nome, horário e tempo em cada bloco). Mostra em árvore ou JSON puro (**Raw**), e o botão **Copiar JSON** copia a seção aberta.

### Sobre o arquivo CSV

- Nome do arquivo: `logs-<aba>-<data>_<hora>.csv`, salvo na pasta **Downloads**.
- Colunas: `data;status;lead;contato;telefone`, separadas por `;`.
- Abre direto no Excel com os acentos corretos. No Google Sheets, use **Arquivo > Importar** e escolha o separador `;`.
- Sem data **De**, o CSV usa o período do seletor do próprio Datacrazy (por exemplo, "Última semana"). Para baixar logs mais antigos, preencha **De** com a data inicial.

### Como a extensão busca os logs

Quando você clica num bloco, o Datacrazy chama a rota de logs (`/api/crm/flows/.../logs?take=30&skip=0...`). A extensão observa essa chamada (arquivo `hook.js`) e reaproveita a mesma rota, com o seu login, para buscar todas as páginas de uma vez. Nenhum dado sai do seu navegador.

Se a rota falhar (por exemplo, sessão expirada), a extensão volta ao modo antigo: rola a lista da página até o fim, o que é mais lento. Ao trocar de bloco ou de aba no Datacrazy, a lista volta a ser a original da página. Recargas da mesma aba (por exemplo, o seletor "Última semana") não apagam a lista carregada.

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
| Erro "Manifest is not valid JSON" ou "Could not load javascript 'content.js'" | Algum arquivo está faltando ou com nome trocado (por exemplo, `manifest (2).json`). Baixe e extraia o zip de novo. |
| Erro "Could not load icon" | Falta a pasta `icons` dentro da pasta da extensão. Baixe e extraia o zip de novo. |
| A barra não aparece | Confirme que a extensão está ligada, que o endereço é `crm.datacrazy.io` e recarregue a página (F5). |
| Faltam logs na tela | Clique em **Carregar tudo** antes de filtrar. O **Baixar CSV** já carrega tudo sozinho. |
| "Mostrando 0 de N" com período preenchido | O período está fora dos últimos 7 dias, que é o que o Datacrazy guarda. Veja o aviso amarelo na barra. |
| Contador mostra "incompleto" | Uma página do Datacrazy não respondeu. Clique em **Carregar tudo** de novo. |
| **Carregar tudo** ficou lento (rolando a lista) | A busca direta falhou. Clique no bloco de novo (para o Datacrazy refazer a chamada) e tente outra vez. Se continuar, recarregue a página (F5). |
| O calendário de **De:** / **Até:** não abre | Versão 1.7.0 tinha esse erro. Atualize para a 1.7.1 ou mais nova (veja [Atualizar](#atualizar-para-uma-nova-versão)) e clique em recarregar no card da extensão. |
| O Chrome bloqueia o download | Permita downloads para `crm.datacrazy.io` nas configurações do Chrome. |
| Aviso "Desativar extensões no modo desenvolvedor" ao abrir o Chrome | É normal para extensões instaladas por pasta. Feche o aviso (não clique em desativar). |

---

## Arquivos do projeto

| Arquivo | Conteúdo |
| ------- | -------- |
| `manifest.json` | Configuração da extensão (nome, versão, site onde roda) |
| `content.js` | Código que cria a barra, busca os logs, aplica os filtros, gera o CSV e abre a inspeção da sessão |
| `hook.js` | Observa a chamada do Datacrazy à rota de logs, para a extensão reaproveitá-la, desenha o caminho da sessão nos blocos ao clicar num log e abre o calendário dos campos de data (roda no mundo da página, onde o `showPicker()` do Chrome funciona) |
| `styles.css` | Estilo da barra, da lista, dos campos de data e do modal de inspeção |
| `icons/` | Logo da extensão em 16, 32, 48 e 128 px (gerados a partir de `DC.png`) |
| `DC.png` | Logo original em alta resolução (não vai no zip) |
| `LEIA-ME.txt` | Instruções de instalação que vão no zip, na raiz e dentro da pasta da extensão (abre no Bloco de Notas) |
| `datacrazy-filtro-logs.zip` | Pacote para distribuir: `LEIA-ME.txt` + pasta `extensao-datacrazy` com os arquivos acima (menos `DC.png`) |

### Publicar uma versão nova

1. Altere o código e aumente a versão no `manifest.json` (e no `LEIA-ME.txt` e no topo deste README).
2. Faça commit e push para a branch `main`.

A GitHub Action [`release.yml`](.github/workflows/release.yml) percebe a versão nova, monta o `datacrazy-filtro-logs.zip` e cria a release sozinha. O link de download passa a entregar a versão nova na hora. Se a versão já tiver release, a Action não faz nada.

---

© 2026 Adalberto Ribeiro – Time Tigers Datacrazy. Todos os direitos reservados.
