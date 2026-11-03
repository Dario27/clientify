---
description: Crea un Pull Request en GitHub hacia main y sigue la revisión automática de Claude hasta el merge
argument-hint: "[notas opcionales para la descripción del PR]"
allowed-tools: Bash(git:*), Bash(gh:*), Read, Write
version: 1.1.0
tags: [git, github, workflow]
---

**CREATE PR - CREAR PULL REQUEST Y SEGUIR LA REVISIÓN AUTOMÁTICA**

Voy a crear tu Pull Request en GitHub hacia `main`. Una vez creado, el workflow `claude-code-review.yml` lo revisa, lo aprueba, hace merge y borra la rama remota sin que tengas que entrar a GitHub. Este comando no hace commits: trabaja solo con lo que ya está commiteado.

Notas adicionales del usuario para la descripción (pueden venir vacías): $ARGUMENTS

## FASE 1: VALIDAR ENTORNO Y RAMA

1. Verificar que GitHub CLI esté disponible y autenticado:
   ```bash
   gh auth status
   ```
   - Si falla → DETENER e indicar: instalar `gh` y ejecutar `gh auth login`.

2. Verificar estado actual:
   ```bash
   git status --porcelain
   git branch --show-current
   ```
   - Si la rama actual es `main` → DETENER. Sugerir crear una rama: `git checkout -b feature/<descripcion>` o `git checkout -b fix/<descripcion>`.
   - Validar el nombre de la rama contra la convención:
     - `feature/<descripcion>` → funcionalidad nueva o mejora
     - `fix/<descripcion>` → corrección de un error
     - `<descripcion>` en minúsculas, palabras separadas por guiones, sin espacios ni acentos (ejemplo: `fix/puerto-docker-compose`)
     ```bash
     git branch --show-current | grep -E '^(feature|fix)/[a-z0-9]+(-[a-z0-9]+)*$'
     ```
     - Si no cumple → DETENER. Proponer un nombre válido según los commits y el comando para renombrarla:
       ```bash
       git branch -m <nombre-propuesto>
       ```
       Si la rama ya existía en el remoto con el nombre anterior, indicar que puede borrarse con `git push origin --delete <nombre-anterior>` después de renombrar.
   - Si hay cambios sin commitear → ADVERTIR y listarlos. Este comando no los incluye. Preguntar si desea continuar sin ellos o detenerse para commitearlos primero.

3. Verificar que no exista ya un PR abierto para esta rama:
   ```bash
   gh pr view --json number,url,state
   ```
   - Si existe un PR con `state: OPEN` → mostrar su número y URL y DETENER. Los nuevos push a la rama actualizan ese PR y disparan otra revisión automáticamente.

4. Sincronizar con `main`:
   ```bash
   git fetch origin
   git rev-list --count HEAD..origin/main
   ```
   - Si el resultado es mayor a 0 → la rama está atrasada respecto a `main`. ADVERTIR y ofrecer actualizarla con `git merge origin/main`. Si hay conflictos, DETENER y pedir que se resuelvan.

5. Revisar los commits que entrarán al PR:
   ```bash
   git log origin/main..HEAD --oneline
   ```
   - Si no hay commits → DETENER: no hay nada que proponer.

6. Validar que CADA commit siga *Conventional Commits*:
   - Formato: `<tipo>(<alcance opcional>): <mensaje>`
   - Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`
   - El mensaje va en minúsculas al inicio, en modo imperativo y sin punto final (ejemplo: `fix(docker): cambia puerto de 8080 a 8085`)
   ```bash
   git log origin/main..HEAD --format='%h %s' | grep -vE '^[0-9a-f]+ (feat|fix|docs|style|refactor|test|chore|ci|build|perf)(\([a-z0-9-]+\))?!?: .+'
   ```
   - Si el comando no imprime nada → todos los commits cumplen.
   - Si imprime commits → DETENER y listarlos con una propuesta de mensaje corregido para cada uno:
     - **Commits aún no pusheados:** ofrecer corregirlos. El último con `git commit --amend -m "<mensaje corregido>"`; varios con `git rebase -i origin/main` marcando `reword`.
     - **Commits ya pusheados:** corregirlos obligaría a reescribir el historial remoto con `--force`, que este comando no usa. Indicarlo y dejar que el usuario decida si los corrige por su cuenta o continúa así.

## FASE 2: ANTICIPAR LA REVISIÓN AUTOMÁTICA

El workflow `claude-code-review.yml` solo aprueba y hace merge automático si se cumplen tres condiciones. Verificar las dos que se pueden anticipar desde aquí:

7. Tamaño del cambio (límite: 400 líneas entre agregadas y eliminadas):
   ```bash
   git diff --shortstat origin/main...HEAD
   ```

8. Rutas sensibles (no se aprueban automáticamente):
   ```bash
   git diff --name-only origin/main...HEAD | grep -Ei '(^\.github/|migrations?/|auth|security|\.env|secrets?)'
   ```

9. Si se supera el límite o hay rutas sensibles → ADVERTIR en el resumen que el PR **no se fusionará solo** y requerirá revisión y merge manual. Si toca `.github/workflows/`, advertir además que la revisión de Claude se saltará en ese PR, porque el workflow modificado no coincide con el de `main`.

La tercera condición (que Claude no deje comentarios) solo se conoce cuando termina la revisión.

## FASE 3: GENERAR TÍTULO Y DESCRIPCIÓN

10. Generar el título a partir de los commits:
    - **1 commit:** usar su mensaje directamente.
    - **Varios commits del mismo tipo:** un título que los agrupe.
    - **Commits mixtos:** un título que describa el propósito general.
    - El título SIEMPRE sigue Conventional Commits, porque con *squash merge* se convierte en el mensaje del commit que entra a `main`.
    - El tipo del título debe ser coherente con la rama: `feature/*` → normalmente `feat`; `fix/*` → `fix`. Si los commits indican otra cosa (por ejemplo, solo `docs`), usar el tipo que corresponda y mencionarlo en el resumen.

11. Analizar los archivos modificados para enriquecer la descripción:
    ```bash
    git diff --name-status origin/main...HEAD
    git diff origin/main...HEAD
    ```

12. Generar la descripción con esta estructura:

    ```markdown
    ## Objetivo
    [Qué resuelve o agrega este PR y por qué, en 1 a 3 oraciones]

    ## Cambios principales
    - [Cambio significativo 1]
    - [Cambio significativo 2]

    ## Componentes afectados
    - [backend, data, docker compose, etc., según los archivos modificados]

    ## Notas de testing
    - [Cómo se probó, o "Sin tests agregados" si aplica]

    ## Notas para el revisor
    [Notas del usuario recibidas en $ARGUMENTS, o contexto relevante. Omitir la sección si no hay nada]

    ---
    🤖 Generado con [Claude Code](https://claude.com/claude-code)
    ```

## FASE 4: CONFIRMAR

13. Presentar el resumen:

    ```
    ═══════════════════════════════════════════════════════════
                  RESUMEN DEL PULL REQUEST
    ═══════════════════════════════════════════════════════════

    📂 RAMA:              [rama-actual]
    📍 DESTINO:           main
    📝 COMMITS:           [cantidad]
    📊 ARCHIVOS:          [cantidad]
    ➕➖ LÍNEAS:           [agregadas] / [eliminadas]

    📋 TÍTULO:
       [título generado]

    🤖 MERGE AUTOMÁTICO:  [✅ Posible | ⚠️ No: motivo]

    ═══════════════════════════════════════════════════════════
    ```

    Debajo, mostrar la descripción completa y cualquier advertencia de las fases anteriores.

14. Preguntar:
    ```
    ¿Cómo deseas proceder?

    1. ✅ Crear el PR
    2. ✏️  Editar el título
    3. ✏️  Editar la descripción
    4. ❌ Cancelar
    ```

    Repetir el resumen después de cada edición hasta que se elija crear o cancelar.

## FASE 5: PUSH Y CREAR EL PR

15. Subir la rama:
    ```bash
    git push -u origin <rama-actual>
    ```

16. Guardar la descripción en un archivo temporal (por ejemplo `/tmp/pr-body.md`) y crear el PR:
    ```bash
    gh pr create --base main --head <rama-actual> --title "<título>" --body-file /tmp/pr-body.md
    ```

17. Mostrar el número y la URL del PR creado.

## FASE 6: SEGUIR LA REVISIÓN AUTOMÁTICA

18. Esperar a que termine el check de Claude (suele tardar alrededor de 1 minuto):
    ```bash
    gh pr checks <número> --watch
    ```

19. Consultar el resultado:
    ```bash
    gh pr view <número> --json state,reviewDecision,mergedAt
    ```

20. Informar según el caso:

    - **`state: MERGED`** → ✅ Revisado, aprobado y fusionado; la rama remota fue eliminada. Ofrecer limpiar la copia local:
      ```bash
      git checkout main
      git pull
      git branch -D <rama>
      git fetch --prune
      ```
      Usar `-D` solo después de confirmar que el estado es `MERGED`: con *squash merge*, `git branch -d` no reconoce la rama como fusionada.

    - **Abierto con comentarios de Claude** → listarlos:
      ```bash
      gh api repos/{owner}/{repo}/pulls/<número>/comments --jq '.[] | select(.user.login | test("claude"; "i")) | "\(.path):\(.line) — \(.body)"'
      ```
      Resumir cada hallazgo y ofrecer ayuda para corregirlos. Recordar que cada nuevo push a la rama dispara otra revisión.

    - **Abierto sin comentarios ni aprobación** → probablemente superó el límite de líneas o tocó rutas sensibles. Mostrar el motivo desde el resumen del job:
      ```bash
      gh run list --branch <rama> --workflow "Claude Code Review" --limit 1
      ```
      Indicar que el merge debe hacerse manualmente desde GitHub.

    - **Check fallido** → mostrar el enlace al job para revisarlo:
      ```bash
      gh run view --log-failed
      ```

## NOTAS IMPORTANTES

✅ Crea el PR siempre hacia `main`
✅ Exige ramas `feature/*` o `fix/*` y commits en formato Conventional Commits
✅ Anticipa si el PR podrá fusionarse solo (tamaño y rutas sensibles)
✅ Sigue la revisión automática hasta el merge o hasta los comentarios de Claude

❌ NO hace commits: solo trabaja con lo ya commiteado
❌ NO hace merge por su cuenta: eso lo hace el workflow `claude-code-review.yml`
❌ NO usa `--force` en ningún push