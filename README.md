# AI on TV — módulo TizenBrew

Abre o thin client no seu PC (mesmo app que funciona no **Internet** da TV).

`websiteURL` padrão: `http://192.168.15.2:8080/tv/index.html`  
Se o IP do PC mudar, edite `package.json` → `websiteURL` e publique um release novo.

**Sem secrets** neste repo.

## Instalar na TV

1. PC: backend ligado (`cd backend && .\gradlew.bat bootRun`).
2. No TizenBrew, apague **Unknown Module** / módulos `aiontv` antigos.
3. Module Manager → **Add Module** → digite:

```
disparter/aiontv
```

4. Abra **AI on TV** na home do TizenBrew.

## Como funciona

- `packageType: mods` + `websiteURL` → TizenBrew navega para o SPA no PC.
- Não depende de npm nem de servir HTML pelo CDN.

## Atualizar IP

1. Altere `websiteURL` em `package.json`.
2. `git commit` + `git tag` + `gh release create`.
3. Na TV, remova e readicione o módulo (ou aguarde o TizenBrew puxar o release).
