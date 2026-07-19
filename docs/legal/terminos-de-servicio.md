# Términos de Servicio de Datemaxxer

> **BORRADOR - no publicar sin revisión de un abogado.** Escrito por FRONT
> (2026-07-19) a partir de lo que el producto realmente hace hoy, como primer
> insumo. Los puntos marcados `[PENDIENTE: ...]` necesitan una decisión de
> Fernando o una confirmación legal antes de que esto sea publicable. Ver
> también `politica-de-privacidad.md` (documento hermano) y `docs/percentil-spec.md`
> §13 para el estado general de salida a producción.

Última actualización: `[PENDIENTE: fecha de publicación real]`

## 1. Qué es Datemaxxer

Datemaxxer es un servicio que analiza tus fotos y tu biografía de perfiles de
citas y te devuelve un informe: qué arquetipo transmitís hoy, qué tan
coherente es tu perfil, y qué cambiar para mejorarlo. El análisis lo hace un
modelo de inteligencia artificial de terceros (ver sección 6). El informe es
orientativo. No es asesoramiento profesional de ningún tipo, no garantiza
resultados en ninguna app de citas, y las opiniones que contiene son
generadas automáticamente a partir de tus fotos y tu texto.

Datemaxxer no es una app de citas. No conectás con otras personas acá. No
accedemos a tus cuentas en otras apps ni usamos APIs no oficiales de ellas:
subís vos mismo tus fotos y tu bio.

## 2. Quién puede usar Datemaxxer

Tenés que tener 18 años o más para crear una cuenta. Si sabemos que un
usuario es menor de edad, cerramos la cuenta y borramos sus datos.

`[PENDIENTE: confirmar si el servicio se ofrece solo en algunos países o sin
restricción geográfica; hoy el producto tiene registros regionales
rioplatense/chileno/mexicano/neutro pero eso es de tono de escritura, no una
restricción de acceso]`

## 3. Tu cuenta

Te registrás con tu cuenta de Google o con tu correo electrónico (código de
un solo uso, sin contraseña). Sos responsable de mantener el acceso a esa
cuenta o correo bajo tu control. Si detectás uso no autorizado de tu cuenta,
avisanos a `[PENDIENTE: correo de contacto/soporte]`.

## 4. Lo que subís

Subís entre 4 y 9 fotos tuyas y, si querés, tu biografía actual y un
arquetipo al que te gustaría apuntar. Al subir una foto o un texto, nos dás
permiso para procesarlo con el único fin de generar tu informe y (si lo
comprás) el Kit de mejora. No usamos tu contenido para entrenar modelos de
terceros, no lo vendemos, y no lo mostramos a otros usuarios: es privado a tu
cuenta.

**Sos responsable de lo que subís.** No subas:
- Fotos que no sean tuyas o de personas que no dieron su consentimiento para
  aparecer (fotos grupales: revisá que quien está con vos no tenga problema
  con que esa imagen se procese).
- Contenido sexual explícito, de menores, o ilegal en tu jurisdicción.
- Contenido que suplante la identidad de otra persona.

Si subís algo que viola esto, podemos suspender tu cuenta y borrar el
contenido, sin previo aviso.

## 5. Cómo leemos tu perfil

El análisis lee estilo de vida, nivel socioeconómico aparente y señales de
lo que mostrás en tus fotos y tu bio - con evidencia concreta y visible en lo
que subiste. **Nunca inferimos** tu orientación sexual, tu disponibilidad
para tener relaciones, ni tu estado de salud a partir de tus fotos: esos
campos directamente no se generan.

## 6. Uso de inteligencia artificial de terceros

Para generar tu informe, tus fotos y tu texto se envían a un proveedor de
inteligencia artificial (`[PENDIENTE: confirmar y nombrar explícitamente:
Anthropic/Claude]`) que los procesa según sus propios términos y política de
privacidad. Ese proveedor no usa tu contenido para entrenar sus modelos por
default en el nivel de servicio que usamos (`[PENDIENTE: confirmar
contractualmente con el proveedor, no asumir]`). No compartimos tu contenido
con ningún otro tercero salvo lo necesario para operar el servicio (ver
`politica-de-privacidad.md` sección 3).

## 7. Planes y pagos

- **Auditoría gratuita:** un informe gratis por cuenta.
- **Kit de Perfil (US$ `[PENDIENTE: confirmar precio final, hoy US$19 en el
  diseño del producto]`):** `[PENDIENTE: describir exactamente qué incluye el
  Kit una vez que el checkout esté implementado - hoy es un botón sin cobro
  real, ver docs/percentil-spec.md §13 ítem 1]`.

**Reembolsos:** `[PENDIENTE: definir política de reembolso antes de activar
cobros - por tratarse de un producto digital entregado inmediatamente, suele
excluirse el derecho de arrepentimiento salvo falla del servicio, pero esto
depende de la legislación de defensa del consumidor de cada país y necesita
confirmación de un abogado, no una decisión de producto]`.

## 8. Lo que no podés hacer

No podés usar Datemaxxer para acosar, evaluar o generar contenido sobre
otra persona sin su consentimiento (el servicio es para tu propio perfil).
No podés intentar acceder a cuentas ajenas, hacer ingeniería inversa del
servicio, ni usarlo de forma automatizada/masiva sin autorización nuestra.

## 9. Cancelación

Podés borrar tu cuenta y todos tus datos cuando quieras, desde `[PENDIENTE:
confirmar dónde vive esa opción en la app - hoy el copy de ingreso promete
"podés borrar el expediente cuando quieras" pero no vimos el flujo
implementado; si no existe todavía, hay que construirlo antes de publicar
este párrafo o hay que ajustar la promesa]`. Podemos suspender o cerrar tu
cuenta si violás estos términos.

## 10. Limitación de responsabilidad

El informe es una lectura automática, no una verdad objetiva sobre vos ni
una garantía de resultados. No nos hacemos responsables por decisiones que
tomes a partir del informe, ni por el contenido de terceros (otras apps de
citas) fuera de nuestro control.

`[PENDIENTE: esta sección típicamente necesita lenguaje legal específico de
limitación de responsabilidad según jurisdicción - completar con abogado]`

## 11. Cambios a estos términos

Podemos actualizar estos términos. Si el cambio es significativo, te
avisamos por correo o dentro del producto antes de que entre en vigencia.

## 12. Ley aplicable

`[PENDIENTE: definir jurisdicción y ley aplicable - depende de dónde se
constituya la entidad responsable del servicio, si existe una, o del
domicilio de Fernando como responsable individual]`

## 13. Contacto

`[PENDIENTE: correo de contacto real]`
