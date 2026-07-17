# Changelog - Motor F1 (audit)

## v1.0 - 2026-07-17
- Primer prompt. Chain de dos pasos en un solo system.md (PASO 1 per-photo, PASO 2 síntesis).
- `schema-fotos.json`: contrato del paso 1 (evidencia_por_foto). `schema.json`: contrato del paso 2 (AuditResult sin evidencia_por_foto - la evidencia se mergea EN CÓDIGO desde el paso 1, engines/audit.ts).
- Structured outputs de la API (`output_config.format`) + validación Zod de @percentil/contracts encima (los rangos 0-1 / 0-100 los valida Zod, la API no soporta min/max).
- Tono "Sin Anestesia" + líneas rojas actualizadas (estilo de vida sí con evidencia; disponibilidad/orientación/salud nunca).
- Pendiente: poblar examples/ con casos dorados para la eval suite (Fase 4).
