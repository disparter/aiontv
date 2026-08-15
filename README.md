# JarvisTV — módulo TizenBrew

Pacote **somente** para o TizenBrew Module Manager.

**Produto / código canônico:** [micaelcosmo/moviehub](https://github.com/micaelcosmo/moviehub) → pasta `tv-client/tizenbrew-module/`.

Este repo (disparter/aiontv) não é o monorepo: sem backend, sem secrets, sem Stick. Só o HTML/JS que a TV baixa para achar o PC e abrir o thin client.

Release atual: veja as tags. Sem `websiteURL` fixo — o bootstrap testa hosts LAN.

## Instalar na TV

1. PC: MovieHub core Java ligado (`cd core-java && gradlew bootRun`).
2. TizenBrew: apague módulos `aiontv` antigos.
3. Module Manager → **Add Module** → `disparter/aiontv`
4. Abra **JarvisTV**.

## Atualizar

1. Edite em `moviehub/tv-client/tizenbrew-module/`.
2. Copie para este repo, bump `version`, tag + release.
3. Na TV: remova e readicione o módulo.
