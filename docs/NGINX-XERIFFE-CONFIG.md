# Nginx Xeriffe Config

## Objetivo

Proxy reverso para o SamBah publicado em:

```text
xeriffeobirici.com.br
```

Servidor local da aplicacao:

```text
127.0.0.1:3000
```

## Exemplo de configuracao

```nginx
server {
    listen 80;
    server_name xeriffeobirici.com.br www.xeriffeobirici.com.br;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## HTTPS

Depois de apontar o DNS para o servidor, ativar HTTPS com Certbot ou outro gerenciador de certificados.
