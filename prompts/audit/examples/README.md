# Casos dorados - Motor F1

Vacío a propósito. Se puebla en Fase 4 con ~30 casos dorados (input anonimizado + salida esperada) que corre `pnpm eval audit` contra el prompt actual antes de mergear cambios de prompt.

Formato por caso: carpeta `NNN-descripcion/` con `input.json` (paths a fixtures de fotos + bio + region) y `expected.json` (AuditResult o asserts parciales).
