import { describe, expect, it } from 'vitest';
import type { AuditResult, IndiceAtractivo } from '@percentil/contracts';
import { InMemoryAuditStore, type AuditRecord } from './store.js';

/**
 * El índice vigente del usuario (F1b) es la entrada del `gap` de F5, del Radar
 * y del Comparador. Estos tests fijan la regla que lo hace confiable: solo
 * cuenta una auditoría TERMINADA, y una nueva en curso no borra la anterior.
 */

const indiceCon = (global: number): IndiceAtractivo => ({
  facial: {
    bucket: 'medio',
    score: 50,
    evidencia: ['una señal'],
    ancla: { un_bucket_arriba: 'x', un_bucket_abajo: 'y' },
    confianza: 0.8,
  },
  presentacion: null,
  produccion: null,
  global,
  bucket_global: 'medio',
  margen: 10,
  fotos_evaluadas: 5,
  limitantes: [],
});

const resultado = (indice: IndiceAtractivo | null): AuditResult => ({
  version: '2.0',
  arquetipo_detectado: { nombre: 'viajero', confianza: 0.7 },
  score_coherencia: 60,
  indice,
  lectura_200ms: 'algo',
  evidencia_por_foto: [{ foto: 1, dice: 'x', señales: ['s'], calidad_tecnica: 50 }],
  gap_analysis: null,
  plan_de_fotos: { conservar: [], reemplazar: [], orden_sugerido: [], briefs_faltantes: [] },
  quick_wins: [],
});

const registro = (over: Partial<AuditRecord> & Pick<AuditRecord, 'id' | 'createdAt'>): AuditRecord => ({
  userId: 'u1',
  region: 'neutro',
  status: 'done',
  progress: { fotos_analizadas: 5, total: 5 },
  ...over,
});

async function store(...registros: AuditRecord[]): Promise<InMemoryAuditStore> {
  const s = new InMemoryAuditStore();
  for (const r of registros) await s.create(r);
  return s;
}

describe('índice vigente del usuario', () => {
  it('sin auditorías, no hay índice', async () => {
    const s = await store();
    expect(await s.latestIndiceForUser('u1')).toBeNull();
  });

  it('devuelve el de la auditoría terminada más reciente', async () => {
    const s = await store(
      registro({ id: 'a', createdAt: new Date('2026-07-01'), result: resultado(indiceCon(40)) }),
      registro({ id: 'b', createdAt: new Date('2026-07-20'), result: resultado(indiceCon(61)) }),
    );
    expect((await s.latestIndiceForUser('u1'))?.global).toBe(61);
  });

  it('una auditoría EN CURSO no borra el índice anterior', async () => {
    // Este es el caso que motivó el método: con `latestForUser` a secas, el
    // usuario perdía su índice justo mientras rehacía el análisis.
    const s = await store(
      registro({ id: 'vieja', createdAt: new Date('2026-07-01'), result: resultado(indiceCon(58)) }),
      registro({ id: 'nueva', createdAt: new Date('2026-07-25'), status: 'analyzing' }),
    );
    expect((await s.latestIndiceForUser('u1'))?.global).toBe(58);
  });

  it('una auditoría fallida tampoco lo borra', async () => {
    const s = await store(
      registro({ id: 'vieja', createdAt: new Date('2026-07-01'), result: resultado(indiceCon(58)) }),
      registro({ id: 'rota', createdAt: new Date('2026-07-25'), status: 'error', error: 'se cayó' }),
    );
    expect((await s.latestIndiceForUser('u1'))?.global).toBe(58);
  });

  it('una auditoría vieja sin índice (previa a F1b) no le gana a una que sí lo tiene', async () => {
    const s = await store(
      registro({ id: 'conIndice', createdAt: new Date('2026-07-01'), result: resultado(indiceCon(58)) }),
      registro({ id: 'sinIndice', createdAt: new Date('2026-07-25'), result: resultado(null) }),
    );
    expect((await s.latestIndiceForUser('u1'))?.global).toBe(58);
  });

  it('no se cruzan índices entre usuarios', async () => {
    const s = await store(
      registro({ id: 'a', createdAt: new Date('2026-07-01'), result: resultado(indiceCon(58)) }),
    );
    expect(await s.latestIndiceForUser('otro')).toBeNull();
  });
});
