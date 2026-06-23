# DNS Xeriffe

## Objetivo

Apontamento DNS de `xeriffeobirici.com.br` para a VPS onde o SamBah sera publicado.

## Registros sugeridos

```text
Tipo: A
Nome: @
Valor: IP_PUBLICO_DA_VPS
TTL: automatico ou 300
```

```text
Tipo: A
Nome: www
Valor: IP_PUBLICO_DA_VPS
TTL: automatico ou 300
```

## Validacao

Apos propagar o DNS, validar:

```powershell
nslookup xeriffeobirici.com.br
nslookup www.xeriffeobirici.com.br
```

Os dois registros devem retornar o IP publico da VPS.
