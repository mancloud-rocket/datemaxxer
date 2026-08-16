# Reporte de hardening — 16-ago-2026

**Cerrados 9 de 11 ítems del plan** (quedaron Lighthouse, por cuota de la API
anónima, y el deploy a prod de los arreglos, que es decisión tuya).

**El riesgo más grande vivo en el repo no está en el repo: el login por mail
está roto en producción.** Supabase devuelve 500 al mandar el código. Todo
usuario nuevo que no use Google rebota en la puerta. Detalle en NO PUDE.

Rama: `hardening/prod`, 8 commits, cada uno con su verificación en el mensaje.
La bitácora completa del proceso está en `BITACORA.md`.

---

## HECHO Y VERIFICADO

**1. El funnel de la landing estaba roto y tiene arreglo verificado** (`9639578`).
Los 3 CTAs de la landing desplegada apuntan a `/auditoria` → 404 (verificado
por curl); la versión del repo apunta a `/app` → también 404 en ese dominio.
Todo visitante que quería empezar moría ahí. Arreglo: redirects en
`landing/vercel.json` hacia `datemaxxer-app.vercel.app`. Verificación: deploy
de **preview** en Vercel y navegación real por Chrome: `/auditoria` en el
preview termina en la app cargada. Prod no se tocó (ver DECISIONES).

**2. `ADMIN_PANEL_URL` default apuntaba a un 404** (`e28ea66`). El mail de
"alguien quiere pagar" llegaba con link muerto si Render no pisa la variable.
Verificado: la URL nueva devuelve 200, la vieja 404; 320 tests verdes.

**3. De 22 vulnerabilidades (13 high) a cero** (`5aa64c4`). `pnpm update -r`
dentro de rangos semver: next 16.3.1 (cierra SSRF, bypass de middleware, DoS),
fastify 5.12, sharp, nanoid, postcss, dompurify. Ningún major. Verificado:
`pnpm audit` limpio + `pnpm verify` completo verde.

**4. Barrido de secretos: limpio.** `.env` ignorados; árbol e historial de git
solo con placeholders; **bundle del cliente desplegado descargado y grepeado**
(12 chunks, 1.08 MB): el único JWT embebido es la anon key (`role: anon`),
pública por diseño. Endpoints sin token → 401. CORS: origen propio recibe el
header, origen ajeno no (curl contra prod).

**5. `/gap` sin parámetros ya no muestra "0 puntos" como si fuera un
resultado** (`6903386`). Verificado en los dos estados contra `next start`.

**6. Piso de legibilidad: nada por debajo de 12px, sin eyebrows** (`38fb646`).
Tu pedido. Había ~50 reglas entre 8.3 y 11.5px (labels de panel, chips,
botones de copiar, fechas, sellos). Todo subió a 12-12.8px y los labels de
panel pasaron de eyebrow mono a título de sección legible. Verificado por
grep (cero `font-size` < .75rem) y con capturas de todas las pantallas.

**7. Cada zona de carga dice qué foto espera** (`54b3829`). Tu pedido. El
comparador (el peor: "TU MEJOR FOTO" a 8.6px abajo del hueco) ahora dice
adentro "Tu mejor foto / Con la que abrís tu perfil" vs "La foto de ella /
Una captura clara de su perfil". Radar, leer-perfil, fotos y chats aclaran
de quién es la foto, cuántas van y que se puede tocar o arrastrar. Drag &
drop agregado donde faltaba (comparador, fotos, chats). Verificado en vivo
con una cuenta QA free real en el build de producción local.

**8. Mobile sin desbordes** (`83626f7`). Verificando a 375px encontré que el
comparador desbordaba (el texto nuevo fijaba el min-content) y, peor, que la
franja de nav mobile ensanchaba la página ENTERA y el contenido quedaba
recortado a mitad de palabra. Los dos arreglados. Verificación: iframe de
375px y 768px en Chrome real midiendo `scrollWidth` y enumerando elementos
fuera de viewport en 7 combinaciones pantalla/ancho → cero desbordes.

**9. Recorrida completa de prod** (antes de tocar nada): 13 rutas, códigos,
consola y red. Cero errores de consola, cero requests fallidos. Tabla en
`BITACORA.md`. El fix del coach (CORS/streaming) confirmado vivo en prod.

Además, entró a la rama el trabajo de F4 ya verificado de la sesión anterior
(`6a0ba86`: extracción en Haiku, ventana de 40 mensajes, saneo de timestamps,
359 tests).

## NO VERIFICADO

- **Los redirects del funnel en PRODUCCIÓN.** Verificados en preview con
  navegación real; en prod recién van a existir cuando se despliegue la
  landing (ver DECISIONES).
- **Los cambios de UI en producción.** Verificados contra el build de
  producción LOCAL (mismo código que desplegaría Vercel), no contra un deploy.
- **El drag & drop soltando un archivo de verdad.** El estado visual y los
  handlers están verificados; el gesto físico de soltar no se puede simular
  con las herramientas del browser. El código es idéntico al de la mesa, que
  ya funcionaba.
- **`pnpm update` en runtime de producción.** Tests y builds verdes, pero el
  deploy con las versiones nuevas (Render + Vercel) va a correr recién al
  mergear.

## NO PUDE / NO LLEGUÉ

- **Lighthouse**: la API anónima de PageSpeed devolvió 429 (cuota diaria
  compartida agotada) y no hay Lighthouse local. Dejé los números de bundle
  (1.42 MB crudo de chunks JS; top 3: 244/236/224 KB).
- **Arreglar el login por mail**: el 500 es del proyecto Supabase ("Error
  sending confirmation email", reproducido dos veces por curl), no del código.
  Se arregla en el dashboard de Supabase, no en el repo.
- **Verificar los env de Render** (`ADMIN_PANEL_URL`, `CORS_ORIGINS`): no
  tengo acceso al dashboard. Los defaults del código ya quedaron sanos.
- **Fase 7 (código muerto)**: no llegué y era lo último a propósito.
- **Los tests E2E de motores con fotos reales**: sin fixtures anonimizados en
  `fixtures/` sigue sin poder correrse un flujo de auditoría completo barato.

## DECISIONES PENDIENTES

1. **Arreglar el login por mail (LO MÁS URGENTE).** Supabase no puede mandar
   mails: hay que configurar SMTP custom en el dashboard (Auth → SMTP). Ya
   tenés Resend para el mail de admin; con la misma cuenta se resuelve en
   minutos. Mi recomendación: hacerlo antes que cualquier otra cosa de esta
   lista, porque hoy la puerta de entrada sin Google está cerrada.
2. **Desplegar la landing con los redirects.** `vercel --prod` desde
   `landing/` (el CLI ya está autenticado y linkeado). Ojo: eso también
   despliega la landing del repo, que difiere de la desplegada (los CTAs
   dicen `/app` en vez de `/auditoria`; con los redirects las dos versiones
   funcionan). Recomendación: desplegar.
3. **Mergear `hardening/prod` a `main`** para que Render y Vercel tomen la
   API y la app nuevas. Todo está verificado y commiteado de a un cambio.
4. **Revisar en Render** que `ADMIN_PANEL_URL` no esté seteada con el valor
   viejo (si está, corregirla o borrarla: el default nuevo ya es el bueno).
5. **La cuenta QA** (`fernando.urbano+qa-hardening@rocketbot.com`, plan free,
   sin consumo de motores) queda creada en Supabase. Sirve para QA futuro;
   si la querés borrar, va por el dashboard o la admin API.
6. Los majors de dependencias prohibidos por protocolo quedaron listados en
   `BITACORA.md` (zod 4, vitest 4, pino 10, etc.) para cuando quieras
   planificarlos.
