import { z } from 'zod';

/** Versión vigente de los contratos §6. */
export const CONTRACTS_VERSION = '1.0';

/** Confianza de un claim: siempre 0-1. Regla transversal spec §6. */
export const Confianza = z.number().min(0).max(1);

/** Score 0-100 entero (coherencia, calidad técnica). */
export const Score100 = z.number().int().min(0).max(100);

/**
 * Arquetipos v1 (spec §3 F1). Slugs cortos; mapeo a nombre display:
 * viajero, intelectual, deportista, creativo,
 * profesional (Profesional/Status), outdoor (Outdoor/Aventura),
 * social (Social/Anfitrión), hogareno (Calmado/Hogareño).
 */
export const Arquetipo = z.enum([
  'viajero',
  'intelectual',
  'deportista',
  'creativo',
  'profesional',
  'outdoor',
  'social',
  'hogareno',
]);
export type Arquetipo = z.infer<typeof Arquetipo>;

/** Registro regional del usuario (spec §5 profiles.region). */
export const Region = z.enum(['rioplatense', 'chileno', 'mexicano', 'neutro']);
export type Region = z.infer<typeof Region>;
