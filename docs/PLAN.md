# PLAN - to-do detallado de lo que falta

Documento de trabajo. Se va tachando. El **orden es el del board** (`ESTADO.md` §7,
`percentil-spec.md` §10): valor entregado por semana de trabajo, no lo más barato primero.

Estado de cada función: `ESTADO.md` §4. Qué es cada una: `percentil-spec.md` §3.

**Cómo se usa:** cada bloque se aborda entero antes de pasar al siguiente. Dentro del
bloque, las tareas están en orden de dependencia. Las marcadas 🔸 necesitan una decisión
de Fernando antes de que alguien escriba código.

---

## Definición de "hecho" (aplica a toda tarea de motor)

Ninguna tarea se marca sin esto. No es burocracia: cada punto tapa un agujero por el que
ya nos caímos una vez.

1. Contrato Zod `.strict()`, con test de que un campo inventado por el modelo hace fallar
   el parse.
2. Todo claim con `evidencia[]` y `confianza`. Sin evidencia el campo va `null`.
3. Los números derivados se calculan en código, no los estima el modelo (CLAUDE.md §5).
4. Cupo por plan con el patrón atómico de Postgres (`for update`), desde el día uno. No se
   agrega después.
5. Timeout con devolución de cupo. Nada puede quedar "procesando" para siempre.
6. Test del camino de error: qué pasa si el modelo se cae a mitad, si devuelve basura, si
   el usuario no tiene plan.
7. `pnpm -r typecheck` y `pnpm -r test` verdes antes de commitear.
8. Entrada en `AGENTS-LOG.md` y actualización de la tabla de `ESTADO.md` §4.

---

## Bloque 0 - operativo, bloquea producción hoy

No es código. Son cinco minutos de Fernando y sin esto hay dos funciones muertas en prod.

- [ ] 🔸 Aplicar `20260727130001_solicitudes_upgrade.sql` en el editor SQL de Supabase.
      **Sin esto el botón del Kit tira error.**
- [ ] 🔸 Aplicar `20260801120001_coach.sql`. **Sin esto el coach no guarda nada.**
- [ ] 🔸 Setear en Render: `ADMIN_USER_IDS`, `RESEND_API_KEY`, `ADMIN_EMAIL`,
      `ADMIN_PANEL_URL`. Sin las dos primeras, el panel de admin es inaccesible y no llega
      el aviso de pedido de plan.
- [ ] 🔸 Pasar la contraseña nueva de la base, o aplicar las migraciones a mano. La que
      tengo dejó de autenticar.

---

## Bloque 1 - Fase 2: F5 v2.0, lectura de perfil ajeno ⬅️ **ACÁ ESTAMOS**

La función más potente del producto y la que nadie más tiene en la región. Contratos ya
escritos (`profile-read.ts` + `market.ts`), lo que falta es el motor.

### 1.1 Completar `engines/market.ts`

Los tres derivados que faltan. Van en código por la misma razón que el resto: el día que
F6 mida resultados reales se ajusta la función, no el prompt.

- [ ] `calcularVolumenMatches(indice, plataforma, verificada)` → `VolumenMatches`.
      Drivers: bucket global, verificación, plataforma, densidad urbana. Es monótona en el
      bucket: a mayor bucket, nunca menos volumen.
- [ ] `calcularProbabilidadRespuesta(gap, selectividad, calidadOpener)` →
      `ProbabilidadRespuesta`. **Siempre relativa** (`vs_baseline`), nunca un porcentaje
      absoluto: no tenemos su tasa real hasta que exista F6, y un absoluto sería mentira
      con cara de dato.
- [ ] `calcularGap(indiceUsuario, indiceElla)` → `GapAtractivo`. `delta = ella - usuario`,
      tier según los cortes del contrato (-10 / 10 / 25). Devuelve `null` si el usuario no
      tiene índice.
- [ ] Tests: monotonía de las tres funciones (si el gap empeora, la probabilidad no puede
      subir), y los bordes exactos de cada tier.

### 1.2 Motor F5

- [ ] `engines/profileread.ts`, cadena de dos pasos como F1: paso 1 lee las fotos una por
      una, paso 2 sintetiza. La evidencia del paso 1 se mergea en código.
- [ ] **Filtro `menor_aparente` ANTES de puntuar nada.** Es un paso propio, no un campo del
      paso 2: si el modelo cree que puede ser menor, la ruta corta con 422 y
      `AnalisisRechazado`, y **nunca** devuelve scores. Lo único de este producto que puede
      terminar en un problema penal.
- [ ] `prompts/profileread/system.md` + `schema.json`. Reusar la sección de calibración de
      `prompts/audit/system.md` (bucket antes que número, ancla obligatoria, "la mitad del
      pool está debajo de 60"). **No la copies con variaciones**: si las dos escalas se
      desalinean, el gap deja de significar algo.
- [ ] El motor pide componentes percibidos; `global`, `bucket_global` y `margen` los pone
      `market.ts` con `sujeto: 'objetivo'` (pesos distintos, ya están).
- [ ] `Opener.licencia` obligatoria: el motor tiene que citar qué del perfil habilita ese
      tono. Sin licencia visible, baja el tono solo. Test de que un opener sin licencia no
      pasa el contrato.
- [ ] Test: los campos de inferencia prohibida (orientación, salud, disponibilidad como
      estado) hacen fallar el parse. Ya hay uno en contratos; falta el del motor.

### 1.3 Persistencia y rutas

- [ ] 🔸 **Decisión: dónde vive una lectura de perfil.** `conversations.profile_read` ya
      existe en el schema y está pensado para eso, pero ata cada lectura a una
      conversación, y el caso real es "leí un perfil y todavía no le escribí". Mi
      recomendación: tabla propia `percentil.profile_reads` (user_id, result jsonb,
      created_at, conversation_id nullable) y que `conversations` la referencie. Cuesta una
      migración y evita reescribir esto cuando llegue F4.
- [ ] Migración de la tabla elegida + RLS por `auth.uid()`.
- [ ] `POST /profile-read` (202 + background, como `/audit`) y `GET /profile-read/:id`.
- [ ] `GET /me/profile-reads`: historial. La gente va a querer volver a una lectura.
- [ ] Cupo por plan con el patrón atómico. 🔸 **Decisión: cuántas por plan.** Propuesta:
      free 1 (para que pruebe), Kit 5, Copiloto 60/mes.
- [ ] Timeout + devolución de cupo, igual que F1.
- [ ] Archivado de los screenshots subidos, igual que `photo-archive.ts`.

### 1.4 UI del informe de perfil ajeno

- [ ] 🔸 **Decisión de vocabulario antes de dibujar nada.** Hoy conviven tres registros:
      "expediente forense", "cabina de instrumentos" y el de mercado (índice, bucket, tier,
      gap). El de mercado es el que corresponde al producto real. Hay que elegir uno y
      hacer un pase. Ver bloque 6.
- [ ] Pantalla de informe: el índice arriba (con su margen), el gap contra el suyo, el
      veredicto de inversión en una línea, y los openers abajo.
- [ ] Estado de rechazo (422): pantalla propia, sin scores, sin ambigüedad.
- [ ] Estado "no tenés índice todavía": el gap vuelve `null` y la UI ofrece hacer la
      auditoría. **Es la conversión más limpia que tiene el producto**, no la escondas en
      un texto gris.

### 1.5 La deuda abierta de F1b (va acá, no después)

- [ ] **Eval suite del índice.** Es el riesgo abierto más grande del eje nuevo: hoy los
      tests verifican que el contrato haga cumplir la calibración, nadie verificó que el
      modelo calibre bien. Si la distribución se aplasta en `medio`/`alto`, el índice no
      discrimina y el producto entero pierde sentido.
      - [ ] Runner `pnpm eval audit` que corre los casos de `prompts/audit/examples/`
            contra el motor real y reporta **distribución**, no solo si parsea.
      - [ ] 🔸 Necesita casos dorados con fotos reales anonimizadas y bucket esperado.
            Yo no los puedo fabricar. Mínimo 15 para que la distribución signifique algo.
      - [ ] Assert de distribución: si el 80% cae en dos buckets contiguos, falla.
- [ ] UI del índice propio en el informe de F1. El `margen` no es decorativo: "58 ± 14,
      subí una foto de cuerpo entero y te lo afinamos" es cierto y además convierte.

---

## Bloque 2 - Fase 3: Radar y Comparador (frecuencia y viralidad)

Los dos salen casi gratis arriba de F5 porque comparten `market.ts`. El Radar es lo que
hace que abra la app todos los días; el Comparador es la card compartible.

### 2.1 Radar (contrato `radar.ts` listo)

- [ ] 🔸 **Decisión: qué modelo.** Con Opus por swipe no cierra ninguna cuenta. El Radar es
      una llamada de visión con salida chica: es el caso de uso de un modelo rápido.
      Recomiendo Haiku y medir. F5 y el Comparador se quedan con el modelo grande.
- [ ] `engines/radar.ts`: **una sola llamada**, sin cadena, sin síntesis. Presupuesto menos
      de 5 segundos hasta el primer byte. A los 8 segundos el usuario ya swipeó.
- [ ] `IndiceRapido` con `precision: 'rapida'`. **No finge la calidad de F5** y la UI lo
      dice: "estimación rápida" + ofrecer el análisis completo. Esa fricción declarada es
      la conversión del Radar al Kit.
- [ ] Loguear `ms_motor` en cada llamada y vigilarlo. Si sube de 5s, el Radar dejó de ser
      Radar.
- [ ] `POST /radar` con rate limit propio, más agresivo que el resto.
- [ ] Cupo específico. 🔸 **Decisión: cuántos radares por plan.** Sin tope, un usuario
      intensivo funde el margen de la suscripción en una semana.
- [ ] UI: pantalla de una sola pieza, pensada para el pulgar. Pegar/subir, esperar, leer,
      volver.

### 2.2 Comparador (contrato `compare.ts` listo)

- [ ] `engines/compare.ts`: arma los dos lados, calcula el gap con `market.ts` y produce
      `descomposicion`.
- [ ] **`descomposicion` es lo que salva la función.** Un número solo deprime y no vende
      nada. El gap se parte en puntos cerrables (producción, presentación, arreglo,
      encuadre) y no cerrables (rasgos), y cada acción del plan lleva su ganancia estimada
      en puntos y su plazo real. "9 de esos 23 puntos los cerrás vos en seis semanas y así"
      es exactamente el argumento de venta del Kit.
- [ ] Test: `cerrables + no_cerrables` no puede pasarse del delta del gap.
- [ ] `techo_estimado`: nunca promete rasgos nuevos. Test de que no supera el índice de
      ella por producción sola.
- [ ] `POST /compare` + cupo.
- [ ] UI lado a lado, con el plan abajo.

### 2.3 Card compartible

- [ ] og-image dinámica del resultado del Comparador.
- [ ] **La card que se comparte es la del gap, no la del arquetipo.** Un número contra otro
      número es contenido; un arquetipo es un test de Facebook. Está en la spec desde el
      día uno y nunca se construyó: sin ella cada usuario entra solo y no trae a nadie.
- [ ] Ruta pública de la card con su propio rate limit y sin datos identificables.

---

## Bloque 3 - Fase 4: cerrar la promesa del Kit

Va acá y no antes porque su valor es tapar un hueco comercial, no entregar algo que el
usuario esté esperando. **Hoy alguien puede pagar 19 dólares y recibir menos de lo que la
página promete**, y eso es lo único de esta lista que puede volverse un problema legal.

- [ ] 🔸 **Decisión de fondo, y es la más importante del bloque:** ¿se construye F2+F3, o
      se recorta la página de venta y el Kit se muda al eje de mercado (índice completo +
      descomposición + plan de puntos)? Lo segundo es más rápido, más barato y es lo que la
      gente en realidad quiere comprar. Mi recomendación es esa.
- [ ] Contrato `bio.ts` (no existe todavía).
- [ ] `engines/bio.ts` (F3): 3 variantes por intención y registro regional, con la
      blocklist anti-slop inyectada al system prompt como en F1.
- [ ] `engines/photos.ts`: pipeline `sharp` (exposición, balance de blancos, contraste,
      ruido, crop) + LUT por arquetipo.
- [ ] **Test duro del pipeline: la región de personas tiene que ser bit-idéntica antes y
      después.** Está en CLAUDE.md como regla no negociable. No lo borres ni lo relajes.
- [ ] UI: comparador antes/después, orden drag&drop, briefs de fotos faltantes.
- [ ] Outpainting (fal.ai + máscara) queda para después: es la parte cara y lenta.

---

## Bloque 4 - Fase 5: F4, auditoría de chat (el moat)

La función más defendible y la más cara de hacer bien. Va acá porque **sirve cuando ya
conseguiste el match, y la mayoría de los usuarios se cae antes**. Además necesita
conversaciones reales para calibrarse.

Las tablas ya existen (`conversations`, `chat_snapshots`), así que arranca con eso a favor.

- [ ] `engines/behavior.ts`: parser de mensajes desde visión → timestamps estimados →
      latencias, ratios, quién reengancha, profundidad. **Todo en aritmética.** Un modelo
      que "estima que la latencia se triplicó" está inventando.
- [ ] Tests del parser con transcripciones sintéticas de latencia conocida.
- [ ] `engines/chat.ts` (F4): el LLM solo interpreta lo que calculó `behavior.ts` y agrega
      registro detectado, sugerencias y veredicto.
- [ ] Sugerencias **siempre con etiqueta de estrategia y `por_que`**, nunca texto suelto
      para copiar. El objetivo es que el tipo aprenda el patrón, no que pegue.
- [ ] Streaming SSE, mismo patrón que el coach.
- [ ] `POST /conversations`, `POST /conversations/:id/snapshot`, `GET /conversations/:id`.
- [ ] Acumulación de `behavior_state` entre snapshots: la latencia solo tiene sentido
      contra la historia.
- [ ] **Feedback loop del veredicto.** A los `revisar_en_dias` la app pregunta qué pasó y
      lo guarda en `conversations.verdict_feedback`. Es lo que vuelve al veredicto
      falseable y la base de cualquier recalibración futura.
- [ ] Cupo por plan.
- [ ] UI: hilo por conversación, veredicto arriba, evidencia adelante.

---

## Bloque 5 - Fase 6: producción seria

Nada de esto se puede empujar más allá del primer día de tráfico pago.

- [ ] 🔸 Páginas legales publicadas. Los borradores están en `docs/legal/` con cada punto
      que necesita abogado marcado. **Manejamos fotos de personas: no es opcional.**
- [ ] Rotar credenciales. Hubo llaves en el entorno de desarrollo toda la construcción.
- [ ] Cerrar CORS: hoy queda abierto por default si no se fija `CORS_ORIGINS`.
- [ ] Tracking de errores (Sentry o equivalente). **Hoy si a un usuario le falla algo,
      nadie se entera.**
- [ ] Analítica de funnel. Sin esto no se sabe dónde se cae la gente y se optimiza a ciegas.
- [ ] Cupos por plan en todos los motores nuevos, si alguno quedó sin.
- [ ] Home real de `apps/web` con el posicionamiento v2. Hoy es un placeholder de Fase 0 y
      el landing real es HTML estático aparte.
- [ ] 🔸 **Revisar el precio.** LTV de suscripción estimado: 12 dólares por 2 meses = 24.
      Contra eso, una lectura F5 cuesta entre 0,06 y 0,12 de API y el Radar está pensado
      para usarse muchas veces por sesión. El Copiloto a 12 está subvaluado para ser la
      única herramienta de su tipo en la región. Si hay que subir uno solo, es la
      suscripción.

---

## Bloque 6 - transversal: cerrar la mudanza de vocabulario

No es una fase, es una deuda que crece. **Un producto a medio renombrar se lee como un
producto abandonado.**

- [ ] 🔸 **Elegir un registro.** Hoy conviven "expediente forense" (§1.3 de la spec y
      componentes vivos), "cabina de instrumentos" y el de mercado (índice, bucket, tier,
      gap). El tercero es el que corresponde al producto que el board definió.
- [ ] Pase por todos los componentes vivos: `Escaner.tsx`, `Informe.tsx`, `Mesa.tsx`,
      `Login.tsx`, `pantallas.tsx`.
- [ ] Revisar `GUIA-VISUAL.md` contra el producto v2. Es la referencia canónica y describe
      la etapa forense.
- [ ] §1.3 de la spec (identidad visual) no se tocó en la revisión del board. Los tokens de
      color valen; el resto hay que releerlo.

---

## Bloque 7 - Fase 7: lo que sigue

Nada de esto bloquea nada. Se aborda cuando lo de arriba esté cerrado.

- [ ] App móvil Expo: auth, historial, cámara/galería.
- [ ] Share extension iOS + share target Android → `POST /chat/:id/snapshot`. Es lo que
      vuelve a F4 usable de verdad: mandar un screenshot sin salir de la app de citas.
- [ ] Triage de bandeja: todos los matches abiertos ordenados por dónde conviene invertir.
- [ ] Simulador de conversación: practicar una apertura contra un perfil ya analizado, y el
      modelo responde como respondería ella según su registro detectado. Convierte el
      consejo en repetición, que es lo único que cambia conductas.
- [ ] Post-mortem de cita: cuatro preguntas después de una salida. Alimenta las métricas.
- [ ] "El día siguiente": un aviso diario corto y accionable. Es lo que convierte una
      herramienta en un hábito.
- [ ] F6 (métricas): match rate antes y después. La tabla `metrics_entries` ya existe.
      Necesita usuarios con historia para significar algo, por eso va al final.
- [ ] Recalibración del índice contra `verdict_feedback` y F6. **Es la razón por la que
      `probabilidad_respuesta` es relativa y los derivados están en código**: el día que
      haya resultados reales se ajusta la función, no el prompt.

---

## Las decisiones que necesito de Fernando, juntas

Ordenadas por cuándo hacen falta.

| # | Decisión | Bloquea |
|---|---|---|
| 1 | Aplicar las dos migraciones + env vars de Render | Kit y coach en prod, hoy |
| 2 | Dónde vive una lectura de perfil (tabla propia vs `conversations`) | Bloque 1.3 |
| 3 | Cupos de F5 por plan | Bloque 1.3 |
| 4 | Registro de vocabulario, antes de dibujar la UI de F5 | Bloque 1.4 |
| 5 | Casos dorados con fotos reales para la eval suite | Bloque 1.5 |
| 6 | Modelo del Radar (recomiendo Haiku) y cupos | Bloque 2.1 |
| 7 | ¿Construir F2+F3 o recortar la página de venta del Kit? | Bloque 3 |
| 8 | Legales con abogado | Bloque 5 |
| 9 | Precio de la suscripción | Bloque 5 |
