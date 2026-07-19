# Política de Privacidad de Datemaxxer

> **BORRADOR - no publicar sin revisión de un abogado.** Escrito por FRONT
> (2026-07-19) a partir de lo que el producto realmente hace hoy, como primer
> insumo. Los puntos marcados `[PENDIENTE: ...]` necesitan una decisión de
> Fernando o una confirmación legal antes de que esto sea publicable. Ver
> también `terminos-de-servicio.md` (documento hermano) y `docs/percentil-spec.md`
> §13 para el estado general de salida a producción.

Última actualización: `[PENDIENTE: fecha de publicación real]`

## 1. Quién es el responsable de tus datos

`[PENDIENTE: nombre de la persona o entidad responsable, domicilio legal,
y - si corresponde en tu jurisdicción - identificador fiscal. Datemaxxer es
hoy un proyecto personal de Fernando, no un producto de Rocketbot; hay que
confirmar si opera a nombre de una persona física o si se constituye una
entidad antes de lanzar]`

## 2. Qué datos recolectamos

- **Fotos** que subís para el análisis (4 a 9 por auditoría).
- **Texto de tu bio**, si la pegás.
- **Correo electrónico**, para tu cuenta y el envío del código de acceso.
- **Región** que elegís (rioplatense, chileno, mexicano, neutro) - se usa
  para el registro de escritura del informe, no identifica tu ubicación real.
- **Arquetipo objetivo**, si elegís uno, y **resultado de tu auditoría**
  (score, arquetipo detectado, confianza, recomendaciones).
- **Datos técnicos de la cuenta**: fecha de alta, si te autenticaste con
  Google o con correo, y metadata operativa mínima para que el servicio
  funcione (por ejemplo, cuándo se generó cada informe).

No recolectamos analítica de comportamiento ni de terceros hoy
(`[PENDIENTE: esto puede cambiar si se agrega analítica de producto - ver
docs/percentil-spec.md §13 ítem 8 - actualizar esta sección cuando eso
suceda, no antes]`).

## 3. Con quién compartimos tus datos

**Nunca vendemos tus datos.** Los compartimos únicamente con los proveedores
que necesitamos para operar el servicio:

- **Proveedor de inteligencia artificial** (`[PENDIENTE: nombrar
  explícitamente: Anthropic]`): recibe tus fotos y tu bio para generar el
  análisis. Es un proceso automático, no hay revisión humana de tu contenido
  de nuestro lado salvo que nos escribas pidiendo soporte sobre tu caso.
- **Proveedor de autenticación y base de datos** (Supabase): aloja tu cuenta,
  tus fotos y el resultado de tu auditoría, con acceso restringido a tu
  propio usuario.
- **Proveedor de pagos** (`[PENDIENTE: nombrar cuando se elija - MercadoPago,
  Stripe, etc. - ver docs/percentil-spec.md §13 ítem 1, hoy no existe
  todavía]`), únicamente si comprás el Kit.

Cada uno de estos proveedores procesa tus datos bajo su propia política de
privacidad y puede estar ubicado fuera de tu país (transferencia
internacional de datos - por ejemplo, Anthropic y Supabase operan
infraestructura en Estados Unidos). `[PENDIENTE: confirmar con un abogado si
esto requiere una cláusula específica de transferencia internacional según
la legislación aplicable a tus usuarios]`.

## 4. Fotos donde aparecen otras personas

Si subís una foto grupal, esa foto también contiene datos de otras personas.
Sos responsable de tener su consentimiento antes de subirla. No usamos esas
fotos para identificar ni analizar a las otras personas que aparecen: el
análisis está dirigido a vos.

## 5. Lo que nunca inferimos

Aunque el análisis lee estilo de vida y señales visibles en tus fotos, hay
tres cosas que nunca generamos ni inferimos a partir de tu contenido: tu
orientación sexual, tu disponibilidad para tener relaciones, y tu estado de
salud. Esos campos no existen en el informe.

## 6. Cuánto tiempo guardamos tus datos

`[PENDIENTE: definir política de retención real - opciones típicas: mientras
la cuenta esté activa + N días tras la eliminación por si hay disputa de
pago o requerimiento legal. Hoy no hay un job de borrado automatizado
verificado en el código, confirmar con CORE antes de prometer un plazo
específico]`

## 7. Tus derechos

Podés pedirnos en cualquier momento:
- **Ver** qué datos tenemos sobre vos.
- **Corregir** datos incorrectos.
- **Borrar** tu cuenta y todo tu contenido - fotos, bio, informes.
- **Exportar** tu informe (recibís el resultado en el momento, no hace falta
  pedirlo aparte).

Para ejercer estos derechos, escribinos a `[PENDIENTE: correo de contacto
real]`. `[PENDIENTE: si hay usuarios en la UE, esta sección necesita
lenguaje específico de RGPD/GDPR - confirmar con abogado si aplica al
mercado real del producto, hoy enfocado en LATAM]`.

## 8. Seguridad

Tus fotos y tu informe están protegidos por reglas de acceso a nivel de base
de datos: solo tu cuenta puede leer tu propio contenido (Row Level Security
en Supabase). Las contraseñas no existen en este producto - te autenticás
con Google o con un código de un solo uso por correo, así que no hay una
contraseña que se pueda filtrar de nuestro lado.

`[PENDIENTE: agregar detalle de cifrado en tránsito/reposo una vez que CORE
confirme la configuración exacta de Supabase Storage para las fotos]`

## 9. Menores de edad

Datemaxxer es para mayores de 18 años. No recolectamos a sabiendas datos de
menores. Si detectamos una cuenta de un menor, la cerramos y borramos sus
datos.

## 10. Cambios a esta política

Si cambiamos esta política de forma significativa, te avisamos por correo o
dentro del producto antes de que entre en vigencia.

## 11. Contacto

`[PENDIENTE: correo de contacto real]`
