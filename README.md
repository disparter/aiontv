# JarvisTV — módulo TizenBrew

`packageType: app` → abre `app/bootstrap.html`. O bootstrap **testa** os hosts LAN do PC (configurados no próprio bootstrap) e redireciona para o thin client.

Release atual: **v0.6.39**. Não há `websiteURL` fixo.

**Sem secrets** neste repo (sem API keys, PINs, `.env` ou tokens).  
Hosts LAN ficam só em `app/bootstrap.html` (necessário pra TV achar o PC na rede local).

## Instalar na TV

1. PC: backend ligado (`cd backend && .\gradlew.bat bootRun`) com as placas LAN do lab.
2. No TizenBrew, apague módulos `aiontv` antigos.
3. Module Manager → **Add Module** → `disparter/aiontv`
4. Abra **JarvisTV** — deve aparecer “Procurando o PC…” e cair no thin client.

## Internet (atalho sem TizenBrew)

- Use o IP/hostname do PC na LAN: `http://<host-do-pc>:8080/tv/`
- Autodetect: `http://<qualquer-IP-alcançável>:8080/tv/bootstrap.html`

## Atualizar

1. Edite candidatos LAN em `app/bootstrap.html` se os IPs do PC mudarem.
2. Bump `version` em `package.json` (e espelhe em `tizen-app/` no monorepo `minhatv`).
3. Publique release em `disparter/aiontv` + purge jsDelivr.
4. Na TV: remova e readicione o módulo.

## Fonte da verdade

O código canônico vive em [`disparter/minhatv`](https://github.com/disparter/minhatv) → pasta `tizenbrew-module/`.  
Este repo (`aiontv`) é só o pacote que o TizenBrew Module Manager baixa.
