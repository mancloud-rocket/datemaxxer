# Costo de la API de Claude por función

Fecha del cálculo: 3 de agosto de 2026.

Para qué sirve este documento: ajustar precios y cupos. La spec §4.3 estimaba
F1 en US$0,05-0,10 y ESTADO.md estimaba F5 en US$0,06-0,12. Los dos números
están mal por un factor de 4 a 6. Acá está de dónde sale la diferencia.

## Qué está medido y qué está estimado

**Medido contra la API real** (`/v1/messages/count_tokens`, 3-ago-2026):

- Los tokens de cada system prompt y de cada JSON schema.
- Los tokens de una imagen, por modelo y por relación de aspecto.

**Estimado** (y es la parte floja):

- Los tokens de salida. En los motores con `thinking: adaptive` el modelo
  decide cuánto piensa, y el pensamiento se factura como salida a US$25/MTok.
- Cuántas fotos manda un usuario típico.

La salida es entre el 55% y el 65% del costo en los motores de Opus. O sea que
el número final tiene un rango ancho y no hay forma de cerrarlo sin medir.
Ver "Lo primero que hay que hacer" al final.

## Precios

| Modelo | Entrada US$/MTok | Salida US$/MTok |
|---|---|---|
| `claude-opus-4-8` | 5,00 | 25,00 |
| `claude-haiku-4-5` | 1,00 | 5,00 |

## Tokens por imagen (medidos)

La web reescala a 1600px de lado largo (`apps/web/lib/imagen.ts`, `MAX_LADO`).

| Imagen | Opus 4.8 | Haiku 4.5 |
|---|---|---|
| Captura vertical 740x1600 | 1.574 | 1.466 |
| Foto 3:4 (1200x1600) | 2.502 | 1.574 |
| Foto cuadrada (1600x1600) | 3.372 | 1.531 |
| Foto 16:9 (1600x900) | 1.922 | 1.570 |

Acá está la primera sorpresa. Opus 4.8 está en el escalón de visión de alta
resolución: acepta hasta 2576px de lado largo y factura la imagen entera. Haiku
todavía topea en 1568px, por eso da casi lo mismo mandarle cualquier cosa.

El comentario en `apps/web/lib/imagen.ts` dice que el modelo reescala a ~1568px
"así que mandar más es pagar de más". Eso era cierto cuando se escribió. Con
Opus 4.8 ya no: una foto cuadrada de 1600px cuesta 3.372 tokens, más del doble
que la misma foto a 1568px en un modelo viejo. El comentario quedó viejo y el
código está pagando la diferencia.

## Costo por función

Supuestos de volumen: F1 con 6 fotos 3:4, F5 con 4 capturas verticales, F4 con
3 capturas, radar con 2.

| Función | Modelo | Llamadas | Entrada | Salida | Costo | Nota |
|---|---|---|---|---|---|---|
| F1 Auditoría | opus | 2 | 26.673 | ~9.000 | **US$0,358** | thinking adaptive |
| F5 Lectura de perfil | opus | 3 | 30.804 | ~8.800 | **US$0,374** | thinking adaptive |
| Comparador | opus | 1 | 9.429 | ~3.500 | **US$0,135** | thinking adaptive |
| F4 Chat (por turno) | haiku + opus | 2 | 4.605 | ~3.100 | **US$0,075** | ver abajo, sin cupo |
| Coach (turno en régimen) | opus | 1 | 12.142 | ~700 | **US$0,078** | ventana de 20 turnos |
| Coach (turno 1) | opus | 1 | 3.202 | ~700 | US$0,034 | |
| Bio | opus | 1 | 2.315 | ~1.200 | US$0,042 | |
| Radar (2 capturas) | haiku | 1 | 6.657 | ~900 | **US$0,011** | sin thinking |
| Radar (4 capturas) | haiku | 1 | 9.657 | ~1.300 | US$0,016 | |

Rango razonable de F1: US$0,22 con 4 fotos y salida corta, US$0,60 con 9 fotos
y salida larga.

El radar en Haiku fue la decisión correcta del proyecto. La misma función en
Opus costaría ~US$0,09, ocho veces más.

## Dónde se va la plata

**Las imágenes.** En F1 son 15.012 de los 26.673 tokens de entrada (56%). En F5
son 12.592 de 30.804 (41%), y eso porque se mandan dos veces.

**El pensamiento.** Los tres motores con `thinking: adaptive` facturan el
pensamiento a precio de salida. Es la mitad larga del costo de F1 y F5.

**F5 manda las imágenes dos veces.** El PASO 0 de triage y el PASO 1 de lectura
son dos llamadas distintas, cada una con las 4 capturas completas. Son ~6.300
tokens pagados dos veces, US$0,03 por lectura tirados.

## Por plan, agotando cupos

Cupos actuales (`apps/api/src/env.ts`):

| | Gratis | Kit | Copiloto |
|---|---|---|---|
| Auditoría F1 | 1 de por vida | ilimitada | ilimitada |
| Lectura F5 | 1 de por vida | 5 de por vida | 60 / 30 días |
| Radar + comparador | 3 / 30 días | 30 / 30 días | 400 / 30 días |
| Coach | 10 de por vida | 40 de por vida | **sin tope** |
| Chats F4 | no | no | **sin tope** |
| Bio | no | sí, sin tope | sí, sin tope |

**Gratis.** Un usuario que agota todo cuesta **US$1,33** una sola vez.
Ingreso: cero. Es el costo de adquisición y está bien que exista, pero hay que
saber que ese es el número.

**Kit, US$19 pago único.** Los cupos de F5 y coach son de por vida, así que el
grueso se paga una vez: US$2,00 de lecturas y bio, más ~US$2,23 de 40 turnos de
coach. Total **US$4,23** contra US$19 de ingreso. Sano.

La fuga está en el radar: 30 por mes, en ventana móvil de 30 días, para
siempre, sobre un pago único. Son US$0,34 por mes por usuario Kit, sin
vencimiento. A los 44 meses el usuario Kit se comió los US$19. No es urgente,
pero es un pago único financiando consumo recurrente.

**Copiloto, US$12 por mes.** Acá no cierra.

| Consumo mensual | Costo |
|---|---|
| 60 lecturas F5 | US$22,44 |
| 400 radares | US$4,46 |
| 30 chats F4 (no hay tope) | US$2,25 |
| 200 turnos de coach (no hay tope) | US$11,17 |
| **Total** | **US$40,32** |

Contra US$12 de ingreso: **-US$28 por mes** por usuario que use el producto en
serio. Y las últimas dos filas no tienen techo, así que el peor caso real no
tiene fondo.

El cupo de 60 lecturas por sí solo cuesta US$22,44. Con eso alcanza: aunque el
usuario no toque nada más, el plan pierde plata.

## Las tres cosas que están rotas

1. **Copiloto a US$12 con 60 lecturas F5.** Es matemáticamente imposible.
2. **F4 (chats) no tiene cupo.** Solo verifica `plan === 'copilot'`
   (`apps/api/src/chat/routes.ts:72`). Un usuario puede auditar 500 chats.
3. **Coach sin tope para Copiloto** (`apps/api/src/app.ts:394`, `copilot: null`).
   Un usuario que charla mucho cuesta más que su suscripción.

## Palancas para bajar el costo, por impacto

Antes de la lista, el techo. La salida es el 55-65% del costo en los motores de
Opus, y ninguna palanca de entrada la toca. Aunque se apliquen todas las de
abajo, F1 y F5 bajan alrededor de un 20%, no a la mitad. La única palanca sobre
la salida es el `effort` (palanca 2), y esa es calibración: hay que evaluar si
el resultado aguanta.

**1. Bajar la resolución de las imágenes. Ahorro: 15-20% de F1 y F5.**

El costo por imagen crece con el área. Bajar `MAX_LADO` de 1600 a 1000 lleva
una foto 3:4 de 2.502 a ~1.000 tokens. En F1 son 9.000 tokens menos de entrada,
US$0,045 por auditoría. En F5, con las imágenes mandadas dos veces, el ahorro es
mayor.

La pregunta es si a 1000px el modelo sigue leyendo bien. Eso hay que evaluarlo,
no asumirlo. Es el trabajo de calibración que quedó pendiente.

**2. Bajar el `effort` en los motores con thinking. Es la única palanca sobre
la salida, que es la mitad del costo.**

Los tres motores con `thinking: adaptive` no fijan `effort`, así que corren en
el default, que es `high`. Bajarlo a `medium` en `output_config` reduce el
pensamiento, que es lo que se factura a US$25/MTok.

No pongo un número de ahorro porque no lo medí. Lo que sí se puede decir es que
es la única palanca que toca la mitad cara del costo, y que es exactamente el
tipo de cambio que necesita eval suite antes de mergear: si el veredicto se
degrada, no sirve. Va junto con la calibración pendiente, no antes.

**3. Prompt caching. Ahorro: 15-25% de la entrada.**

El system prompt es idéntico en todas las llamadas del mismo motor y pesa 3.900
tokens en F1 y 4.400 en F5. El mínimo cacheable en Opus 4.8 son 1.024 tokens,
así que califica. Una lectura de cache cuesta 0,1x y una escritura 1,25x.

Dentro de una misma request el acierto es seguro: F5 hace 3 llamadas seguidas
con el mismo prefijo, F1 hace 2. Si además se pone el breakpoint después de las
imágenes en F5, el PASO 1 lee del cache los 6.300 tokens de imágenes que hoy
paga a precio lleno.

Entre usuarios distintos el acierto depende del volumen, porque el TTL por
defecto son 5 minutos. Con poco tráfico no se puede contar con eso.

**4. F4: extracción en Haiku y ventana en el paso 2. HECHO, 3-ago-2026.**

Eran dos cosas y la segunda importaba más.

*El modelo.* El PASO 1 es trabajo mecánico: separar quién dijo qué. Ahora corre
en `CHAT_EXTRACCION_MODEL` (Haiku por default), aparte del PASO 2, que emite el
veredicto y se queda en Opus. Esa llamada pasó de US$0,074 a US$0,014.

*La ventana.* El PASO 2 reenviaba la conversación entera en cada turno, así que
el costo crecía con la conversación y sin techo: a 400 mensajes eran ~20.000
tokens de entrada por turno. Ahora al modelo le van los últimos 40
(`VENTANA_MENSAJES`), y el cálculo de `behavior.ts` sigue recibiendo todo,
porque las latencias sin historia completa no significan nada.

Resultado: **US$0,134 y creciendo → US$0,075 fijo**, sin importar cuánto dure
la conversación.

*Lo que hubo que arreglar para que fuera seguro.* Un modelo más chico se puede
equivocar leyendo la hora, y una hora inventada produce una latencia falsa en el
veredicto. Dos cambios cierran eso:

- `sanearTimestamps` anula todo `ts` que no puede ser cierto: el que no parsea,
  el que quedó en el futuro y el que retrocede respecto del mensaje anterior.
  Perder una muestra es gratis; creerle a una hora inventada no.
- `latencia_promedio_min` ahora es `null` cuando no hubo ni una muestra válida.
  Antes devolvía `0`, que el modelo leía como "contesta al instante": la señal
  positiva más fuerte que existe, saliendo de la ausencia de datos. Ese bug ya
  estaba, y el saneo lo habría hecho más frecuente.

Falta medir cuánto se le escapa a Haiku leyendo horas. Está el script
`apps/api/scripts/ab-extraccion.ts`: corre la misma extracción con los dos
modelos sobre capturas reales y marca dónde discrepan. Necesita capturas de
chats de verdad, que hoy no hay en `fixtures/`.

**5. Fusionar el triage de F5 en el PASO 1. Ahorro: US$0,055 por lectura.**

Es la palanca que NO recomiendo. El triage existe para cortar antes de puntuar
nada si hay dudas de que la persona sea menor de edad
(`apps/api/src/engines/profileread.ts:37`). Fusionarlo debilita esa garantía
para ahorrar quince centavos. Mejor resolverlo con caching, que da un ahorro
parecido sin tocar la lógica.

## Qué implica para el licenciamiento

Con los costos de hoy, sin optimizar, un presupuesto de API del 30% del ingreso
(margen bruto del 70%) da:

- **Copiloto US$12/mes** compra US$3,60 de API. Eso son 9 lecturas F5, o 27
  chats, o 46 turnos de coach. Un mix realista de 3 F5 + 8 chats + 20 turnos de
  coach da US$3,31. Ese es el tamaño real del plan a ese precio, no 60 lecturas.
- Si se quieren 60 lecturas mensuales, el plan tiene que salir **US$75**.

Dos caminos, y hay que elegir uno:

**A. Achicar el Copiloto al precio actual.** F5 a 3-4 por mes, chats con tope de
8, coach con tope de 20. Se mantienen los US$12 y el margen. El riesgo es obvio:
a ese tamaño el plan ya no se siente ilimitado, y eso es parte de lo que se
vende.

**B. Subir el precio y ordenar los cupos.** Copiloto a US$29/mes con 10 lecturas,
15 chats y 40 turnos de coach cuesta US$8,58 de API y deja 70% de margen.

Recomiendo el camino B, y aplicar las palancas 1, 3 y 4 en paralelo. Con esas
tres, F5 baja de US$0,374 a ~US$0,29 y F4 de US$0,134 a ~US$0,075. Con esos
números, US$29 compra 12 lecturas, 20 chats y 50 turnos de coach al mismo 70%
de margen. Es un plan que se puede vender.

Lo que no funciona es esperar que las optimizaciones salven el precio de US$12.
Bajan el costo un 20%, no un 70%. El precio está mal, no el código.

Lo que no se puede hacer es dejar las dos cosas sin tope. Los cupos son el
producto: son lo que separa un plan del otro y lo que evita que un usuario
intensivo se coma el margen de veinte.

## Lo primero que hay que hacer

Nadie está registrando el `usage` que devuelve la API. Ni un motor guarda
`input_tokens`, `output_tokens` ni `cache_read_input_tokens`.

Todo lo de arriba es un modelo, no una medición. La entrada está medida contra
la API real y le creo. La salida está estimada, y es la mitad del costo.

Guardar el `usage` de cada llamada son unas diez líneas y convierte este
documento en un hecho en una semana de uso real. Hasta que eso exista, cualquier
decisión de precio se está tomando sobre un número que nadie verificó.
