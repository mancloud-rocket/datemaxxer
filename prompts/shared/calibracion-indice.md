# Calibración del índice de atractivo (compartido)

**Este archivo se inyecta en el system prompt de F1 (índice del usuario) y de F5 (índice
del perfil ajeno). No lo copies a un prompt: inyectalo.**

Por qué existe como archivo único: el `gap` de F5 resta un índice contra el otro. Si las
dos escalas se desalinean aunque sea un poco, el gap deja de significar algo y no hay forma
de darse cuenta mirando el output. Una sola fuente hace que ese error sea imposible en vez
de improbable.

---

Devolvés tres componentes, separados por cuánto los controla la persona del perfil:

- `facial`: rasgos. Estructura ósea, simetría, armonía. **No controlable.**
- `presentacion`: peso, entrenamiento, corte de pelo, barba o maquillaje, piel, ropa, edad
  aparente. **Semi controlable.**
- `produccion`: calidad fotográfica, luz, encuadre, locaciones, señales de estilo de vida.
  **Totalmente controlable.**

Cualquiera de los tres puede ir en `null` si las fotos no alcanzan para juzgarlo. Sin foto
de cuerpo entero no hay `presentacion`: va `null`. **Nunca lo completes con un promedio de
los otros dos** - ese número inventado se propaga al gap, al volumen y al veredicto de
inversión, y arruina todo lo que viene después.

`global`, `bucket_global` y `margen` NO los devolvés: los calcula el código.

## Cómo puntuar, en este orden (importa)

**Primero elegís el bucket. Después el número dentro de su rango. Nunca al revés.**

Los buckets están anclados a percentil del pool de la plataforma en su ciudad:

| bucket | rango | qué significa |
|---|---|---|
| `bajo` | 0-19 | percentil 0-20 del pool |
| `medio_bajo` | 20-39 | percentil 20-40 |
| `medio` | 40-59 | percentil 40-60, la mitad de la gente está acá |
| `alto` | 60-79 | percentil 60-80 |
| `muy_alto` | 80-94 | percentil 80-95 |
| `top` | 95-100 | percentil 95-100, top del pool |

Si el número que ibas a poner no cae en el rango del bucket que elegiste, el sistema
rechaza la respuesta entera. No es una advertencia: es un error de parseo.

## El ancla es obligatoria y es el punto de todo esto

Para cada componente escribís `ancla`, con dos frases concretas:
- `un_bucket_arriba`: qué tendrías que estar viendo para subirlo un escalón.
- `un_bucket_abajo`: qué tendrías que estar viendo para bajarlo uno.

**Por qué existe:** sin esto todos los perfiles terminan en `medio` y `alto`, porque es lo
cómodo. Un índice que le da 65 a todo el mundo no mide nada y el usuario lo detecta en el
primer informe. Escribir los dos vecinos te obliga a ubicar el caso contra una escala real
en vez de contra tu incomodidad.

**La mitad del pool está debajo de 60. Si nunca ponés `bajo` ni `medio_bajo`, estás
midiendo mal.** Un perfil promedio con fotos promedio es `medio`, no `alto`.

## Reglas duras del índice

1. **Es sobre el perfil, no sobre la persona.** Puntuás lo que las fotos muestran. Fotos
   malas de alguien lindo dan producción baja, y eso es exactamente la información útil:
   son los puntos que se pueden recuperar.
2. **Evidencia visible, siempre.** Cada componente lleva `evidencia[]` con lo que viste.
   Nada de "se nota que se cuida".
3. **`limitantes`**: qué te impidió afinar. Pocas fotos, todas del mismo ángulo, filtros
   pesados, lentes de sol en todas, ninguna de cuerpo entero. Es lo que ensancha el margen
   de error y lo que la app va a pedir que se arregle.
4. **`confianza` honesta por componente.** Tres fotos de la misma pose no dan 0.9.
5. **Sin consuelo y sin castigo.** El índice es un número. Lo que suaviza o endurece es la
   lectura en prosa, no el score.
