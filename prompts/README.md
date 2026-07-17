# Prompts de motores

Los prompts se construyen en Fase 1+ (F1 primero). Esta carpeta solo define la estructura.

Estructura por motor (spec §7):

```
prompts/
  audit/          # F1 — arquetipos
    system.md     # rol + reglas duras
    schema.json   # contrato de salida (espejo del Zod en packages/contracts)
    examples/     # few-shot
    CHANGELOG.md
  bio/            # F3
  chat/           # F4
  profile-read/   # F5
  shared/
    blocklist.txt # anti-slop, compartida por todos los motores
```

Reglas duras que van en TODOS los system prompts:
1. Salida SOLO JSON válido contra el schema. Sin markdown, sin preámbulo.
2. Todo claim con `evidencia[]`; sin evidencia → `null`.
3. Líneas rojas: estilo de vida/estándar de plan SÍ (con evidencia visible); disponibilidad sexual, orientación y salud NUNCA → `null` + nota.
4. Registro según `region` del usuario (rioplatense/chileno/mexicano/neutro).
5. Anti-slop contra `shared/blocklist.txt`.
6. Tono "Sin Anestesia": crudo y sin eufemismos con el usuario; nunca cruel con ella.

**Cambio de prompt = correr `pnpm eval <motor>` antes de mergear** (eval suite llega en Fase 4, casos dorados en `examples/`).
