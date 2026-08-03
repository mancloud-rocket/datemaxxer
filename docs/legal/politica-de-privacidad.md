# Política de Privacidad de Datemaxxer

> **BORRADOR - no publicar sin revisión de un abogado.**
>
> Reescrito el 2-ago-2026 sobre lo que el producto hace HOY, que es bastante más
> que cuando FRONT escribió el borrador anterior (19-jul): ahora hay lectura de
> perfiles de terceros, radar, comparador, auditoría de chats, coach, estudio de
> fotos, tracking de errores y analítica.
>
> Lo marcado `[PENDIENTE]` necesita una decisión de Fernando o confirmación
> legal. **Lo que hay que llevarle al abogado sí o sí está en la sección 4: el
> tratamiento de datos de personas que no son usuarias y nunca dieron
> consentimiento. Es el riesgo legal más grande del producto.**

Última actualización: `[PENDIENTE: fecha de publicación real]`

---

## 1. Quién trata tus datos

`[PENDIENTE - BLOQUEANTE: razón social o persona física responsable, domicilio y
país. Hoy no hay empresa registrada. Una política de privacidad sin responsable
identificado no se puede publicar.]`

Contacto: `[PENDIENTE: email de contacto para ejercer derechos]`

## 2. Qué datos nos das vos

- **Cuenta:** tu email. Si entrás con Google, además tu nombre y foto de perfil.
  La autenticación la maneja Supabase; no guardamos ni vemos tu contraseña.
- **Tus fotos**, las que subís para medir tu perfil o para retocar.
- **Tu bio actual y los datos personales** que escribís cuando pedís que te
  escribamos una bio nueva.
- **Región y nombre para mostrar**, si los configurás.
- **Lo que le escribís al coach.**

## 3. Qué hacemos con eso

- Tus fotos, tu bio y los textos de chat se mandan a **Anthropic (Claude)** para
  analizarlos. Es el servicio que hace el análisis: sin eso no hay producto.
- Tus fotos originales se guardan en **Supabase Storage** para que puedas ver tu
  historial y comparar mediciones.
- Las conversaciones con el coach se guardan para que la charla siga donde la
  dejaste cuando volvés.
- Las conversaciones que subís a la auditoría de chats se guardan (los mensajes
  extraídos, no las capturas) porque el análisis de latencia solo tiene sentido
  contra la historia.

`[PENDIENTE: confirmar la base legal. Para el usuario registrado que sube sus
propias fotos, lo natural es "ejecución del contrato": pidió el servicio.
Confirmar que alcanza bajo la Ley 18.331 de Uruguay, y en Argentina y Chile si
se cobra ahí.]`

## 4. Datos de OTRAS personas: el punto delicado

El producto permite subir **capturas del perfil o del chat de otra persona**, que
no es usuaria del servicio y nunca aceptó nada. Esto es lo más expuesto que tiene
Datemaxxer y no hay que disimularlo.

Lo que el sistema hace hoy, por diseño y verificado en el código:

- **Las capturas de perfiles ajenos NO se guardan.** Se procesan en memoria y se
  descartan. Queda el análisis (texto y números), nunca las imágenes.
- **El radar no guarda ni el análisis.** Solo queda que se usó, cuánto tardó, y
  dos campos de calibración.
- **El comparador tampoco guarda las fotos.**
- De los chats se guardan los **mensajes extraídos**, no las capturas.
- **Nunca se infiere** orientación sexual, salud ni disponibilidad sexual de
  nadie. Son categorías especialmente protegidas y el sistema está construido
  para que esos campos no puedan existir: el contrato de datos falla si el
  modelo intenta devolverlos.
- Si el sistema detecta que la persona de las capturas **podría ser menor de
  edad**, corta antes de analizar, no genera ningún puntaje y no guarda nada.

`[PENDIENTE - PRIORIDAD MÁXIMA. Preguntas concretas para el abogado:]`

1. `[¿Alcanza con no guardar las imágenes, o el tratamiento en sí (mandarlas a
   Anthropic para analizarlas) ya requiere base legal propia respecto de esa
   tercera persona?]`
2. `[¿Hace falta que el usuario declare que tiene derecho a subir esas capturas,
   y que esa declaración quede registrada?]`
3. `[El análisis incluye una estimación de atractivo de una persona
   identificable. ¿Eso cambia el encuadre, aunque la imagen no se guarde?]`
4. `[¿Cómo se responde a una persona que pide acceso o borrado de "sus" datos si
   nunca fue usuaria y no guardamos nada que la identifique?]`
5. `[¿Conviene un canal público de contacto para terceros, aunque técnicamente
   no haya nada que borrar?]`

## 5. Con quién compartimos

| Con quién | Qué recibe | Para qué |
|---|---|---|
| **Anthropic** (Claude) | fotos, bios, textos de chat | hacer el análisis |
| **Supabase** | cuenta, tus fotos, análisis, conversaciones | base de datos y archivos |
| **Render** | tráfico de la API | servidor |
| **Vercel** | tráfico de la web | servidor |
| **Resend** | tu email, solo si pedís un plan | avisarnos del pedido |
| **Sentry** | errores técnicos | saber qué se rompe |
| **PostHog** | eventos de uso, sin contenido | saber dónde se cae la gente |

Sobre los dos últimos, que son los que más suelen filtrar de más: **no reciben
fotos, ni textos de chats, ni bios, ni nada de lo que escribís.** Sentry recibe
el error técnico con tu identificador interno, sin tu email ni tu nombre, y
tiene desactivado el envío de cuerpos de request. PostHog recibe qué función
usaste, no qué escribiste, y tiene desactivadas la captura automática y la
grabación de sesión.

`[PENDIENTE: ¿hace falta firmar acuerdos de tratamiento (DPA) con cada uno?]`

`[PENDIENTE: todos procesan en Estados Unidos. Confirmar qué se necesita para la
transferencia internacional desde Uruguay, y desde la UE si algún día hay
usuarios europeos.]`

## 6. Cuánto tiempo guardamos

- **Tu cuenta y tus análisis:** mientras tengas cuenta.
- **Capturas de perfiles ajenos:** no se guardan.

`[PENDIENTE: definir un plazo concreto de retención. Hoy no hay borrado
automático de nada, y "para siempre" no es una política defendible.]`

## 7. Tus derechos

Podés pedir acceso, rectificación, borrado, portabilidad y oposición escribiendo
a `[PENDIENTE: email]`.

`[PENDIENTE - IMPORTANTE: hoy NO existe borrado de cuenta en la app; se decidió
dejarlo para después. Antes de publicar esto hay que construirlo o comprometerse
a un plazo de respuesta manual, porque prometer un derecho que no se puede
ejercer es peor que no ofrecerlo.]`

## 8. Menores

El servicio es solo para mayores de 18 años. No creamos cuentas a menores a
sabiendas, y si el análisis detecta que la persona de una captura podría ser
menor, corta sin generar resultado.

## 9. Cambios

`[PENDIENTE: cómo se avisan los cambios y desde cuándo rigen.]`
