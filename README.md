# AI on TV — módulo TizenBrew

`packageType: app` → abre `app/bootstrap.html` (CDN). O bootstrap **testa** os IPs do PC na LAN e redireciona:

| Rede da TV | IP do PC que responde |
|---|---|
| Quarto (Ethernet) | `192.168.15.8:8080` |
| Sala (Wi‑Fi) | `192.168.15.83:8080` |

Release atual: **v0.6.1**. Não há mais um único `websiteURL` fixo.

**Sem secrets** neste repo.

## Instalar na TV

1. PC: backend ligado (`cd backend && .\gradlew.bat bootRun`) com as duas placas (dual-home).
2. No TizenBrew, apague módulos `aiontv` antigos.
3. Module Manager → **Add Module** → `disparter/aiontv`
4. Abra **AI on TV** — deve aparecer “Testando 192.168.15.x…” e cair no thin client.

## Internet (atalho sem TizenBrew)

- Quarto: `http://192.168.15.8:8080/tv/index.html?v=0.6.1`
- Sala: `http://192.168.15.83:8080/tv/index.html?v=0.6.1`
- Autodetect: `http://<qualquer-IP-alcançável>:8080/tv/bootstrap.html`

## Atualizar

1. Edite candidatos em `app/bootstrap.html` se os IPs do PC mudarem.
2. Bump `version` em `package.json`.
3. Publique release em `disparter/aiontv` + purge jsDelivr.
4. Na TV: remova e readicione o módulo.
