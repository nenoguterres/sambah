# Assets Oficiais do samBah!

Esta regra trava a identidade visual aplicada no app.

## Assets permitidos no app

O app pode chamar apenas estes arquivos de marca:

```text
public/assets/brand/logo-sambah-oficial.png
public/assets/favicon.png
public/assets/favicon.svg
```

O mascote `public/assets/brand/capbah-oficial.png` so pode voltar a ser chamado quando o arquivo aprovado pelo usuario estiver presente: capivara 3D marrom/caramelo, camisa creme, lenco vermelho, bombacha verde oliva, botas marrons e cuia marrom com folha.

## Regra de rejeicao

Qualquer logo, mascote, recorte, variacao gerada por IA, imagem com fundo magenta/chroma ou imagem sem aprovacao explicita deve ficar em:

```text
public/assets/rejeitados/
```

Arquivos em `public/assets/rejeitados/` nunca devem ser referenciados por HTML, CSS, JS, README operacional ou codigo do app.

## Nao recriar

Nao gerar nova logo, novo mascote ou reinterpretacao visual sem aprovacao explicita do usuario.

## Validacao rapida

Antes de entregar mudancas visuais, verificar:

```bat
rg -n -i "rejeitados|gerado-nao-usar|magenta|nao-usar" public\admin.html public\admin.js public\styles.css src
npm.cmd test
```
