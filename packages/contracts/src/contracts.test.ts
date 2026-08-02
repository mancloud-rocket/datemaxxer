import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AuditResult } from './audit-result.js';
import { ChatTurnAnalysis } from './chat-turn-analysis.js';
import { CompareResult } from './compare.js';
import { AnalisisRechazado, ComponenteIndice, RANGO_BUCKET } from './market.js';
import { ProfileRead } from './profile-read.js';
import { RadarRead } from './radar.js';

// Fixtures = ejemplos de spec §6 con los "..." completados con contenido realista.
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const loadFixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));

const auditFixture = loadFixture('audit-result.json') as AuditResult;
const chatFixture = loadFixture('chat-turn-analysis.json') as ChatTurnAnalysis;
const profileFixture = loadFixture('profile-read.json') as ProfileRead;

describe('AuditResult (§6.1)', () => {
  it('valida el ejemplo de la spec', () => {
    expect(() => AuditResult.parse(auditFixture)).not.toThrow();
  });

  it('acepta gap_analysis null (usuario sin arquetipo objetivo)', () => {
    expect(() =>
      AuditResult.parse({ ...auditFixture, gap_analysis: null }),
    ).not.toThrow();
  });

  it('rechaza score_coherencia fuera de 0-100', () => {
    expect(AuditResult.safeParse({ ...auditFixture, score_coherencia: 150 }).success).toBe(false);
  });

  it('rechaza confianza fuera de 0-1', () => {
    const bad = {
      ...auditFixture,
      arquetipo_detectado: { nombre: 'viajero', confianza: 1.2 },
    };
    expect(AuditResult.safeParse(bad).success).toBe(false);
  });

  it('rechaza arquetipo fuera del enum v1', () => {
    const bad = {
      ...auditFixture,
      arquetipo_detectado: { nombre: 'sigma', confianza: 0.9 },
    };
    expect(AuditResult.safeParse(bad).success).toBe(false);
  });

  it('rechaza campos inventados por el motor (strict)', () => {
    expect(AuditResult.safeParse({ ...auditFixture, nivel_de_flow: 87 }).success).toBe(false);
  });
});

describe('AuditResult v2.0 - índice de atractivo propio (F1b)', () => {
  const componente = {
    bucket: 'medio' as const,
    score: 52,
    evidencia: ['rasgos regulares, sin ángulo favorecedor en ninguna foto'],
    ancla: {
      un_bucket_arriba: 'mandíbula más definida o mejor luz en la foto de apertura',
      un_bucket_abajo: 'sin foto frontal nítida en todo el set',
    },
    confianza: 0.7,
  };
  const indice = {
    facial: componente,
    presentacion: { ...componente, bucket: 'medio_bajo' as const, score: 34 },
    produccion: { ...componente, bucket: 'alto' as const, score: 66 },
    global: 49,
    bucket_global: 'medio' as const,
    margen: 9,
    fotos_evaluadas: 6,
    limitantes: [],
  };

  it('acepta una auditoría v2.0 con índice', () => {
    expect(() =>
      AuditResult.parse({ ...auditFixture, version: '2.0', indice }),
    ).not.toThrow();
  });

  it('las auditorías v1.0 guardadas siguen parseando y el índice queda en null', () => {
    // Retrocompatibilidad real: hay filas en photo_sets escritas antes de F1b.
    const { indice: _, ...sinIndice } = { ...auditFixture, indice: undefined };
    const parsed = AuditResult.parse({ ...sinIndice, version: '1.0' });
    expect(parsed.indice).toBeNull();
  });

  it('acepta índice null explícito (no se pudo evaluar ningún componente)', () => {
    expect(() =>
      AuditResult.parse({ ...auditFixture, version: '2.0', indice: null }),
    ).not.toThrow();
  });

  it('hace cumplir la calibración de bucket también dentro de la auditoría', () => {
    const roto = { ...indice, facial: { ...componente, bucket: 'top' as const, score: 52 } };
    expect(
      AuditResult.safeParse({ ...auditFixture, version: '2.0', indice: roto }).success,
    ).toBe(false);
  });

  it('rechaza una versión que no existe', () => {
    expect(AuditResult.safeParse({ ...auditFixture, version: '3.0' }).success).toBe(false);
  });
});

describe('ChatTurnAnalysis (§6.2)', () => {
  it('valida el ejemplo de la spec', () => {
    expect(() => ChatTurnAnalysis.parse(chatFixture)).not.toThrow();
  });

  it('rechaza decisiones de veredicto fuera del enum', () => {
    const bad = {
      ...chatFixture,
      veredicto: { ...chatFixture.veredicto, decision: 'ghostear' },
    };
    expect(ChatTurnAnalysis.safeParse(bad).success).toBe(false);
  });

  it('rechaza veredicto sin evidencia (regla transversal)', () => {
    const bad = {
      ...chatFixture,
      veredicto: { ...chatFixture.veredicto, evidencia: [] },
    };
    expect(ChatTurnAnalysis.safeParse(bad).success).toBe(false);
  });

  it('rechaza sugerencias sin etiqueta de estrategia', () => {
    const bad = {
      ...chatFixture,
      sugerencias: [{ estrategia: '', texto: 'hola', por_que: 'x' }],
    };
    expect(ChatTurnAnalysis.safeParse(bad).success).toBe(false);
  });

  it('rechaza más de 3 sugerencias', () => {
    const s = chatFixture.sugerencias[0];
    const bad = { ...chatFixture, sugerencias: [s, s, s, s] };
    expect(ChatTurnAnalysis.safeParse(bad).success).toBe(false);
  });
});

describe('ProfileRead v2.0 (§6.3)', () => {
  it('valida el ejemplo de la spec', () => {
    expect(() => ProfileRead.parse(profileFixture)).not.toThrow();
  });

  it('acepta intencion_declarada null (nunca se infiere de fotos)', () => {
    expect(profileFixture.intencion_declarada).toBeNull();
    expect(() => ProfileRead.parse(profileFixture)).not.toThrow();
  });

  it('rechaza campos de inferencia prohibida (orientación, salud, disponibilidad como estado)', () => {
    for (const campo of ['disponibilidad', 'orientacion', 'salud_estimada']) {
      const bad = { ...profileFixture, [campo]: 'alta' };
      expect(ProfileRead.safeParse(bad).success).toBe(false);
    }
  });

  it('rechaza gancho de tipo no permitido', () => {
    const bad = {
      ...profileFixture,
      ganchos: [{ tipo: 'red_social_privada', dato: 'x', uso: 'y' }],
    };
    expect(ProfileRead.safeParse(bad).success).toBe(false);
  });

  it('acepta eje_declarado y coherencia_texto_fotos en null (sin evidencia → null)', () => {
    const ok = {
      ...profileFixture,
      eje_declarado: null,
      coherencia_texto_fotos: null,
    };
    expect(() => ProfileRead.parse(ok)).not.toThrow();
  });

  it('acepta gap null (usuario sin auditoría propia todavía)', () => {
    expect(() => ProfileRead.parse({ ...profileFixture, gap: null })).not.toThrow();
  });

  it('acepta componentes del índice en null (sin foto de cuerpo entero → null, no promedio)', () => {
    const ok = {
      ...profileFixture,
      indice: { ...profileFixture.indice, presentacion: null },
    };
    expect(() => ProfileRead.parse(ok)).not.toThrow();
  });

  it('rechaza openers sin licencia (el tono se justifica con evidencia o baja)', () => {
    const bad = {
      ...profileFixture,
      openers: [{ ...profileFixture.openers[0], licencia: '' }],
    };
    expect(ProfileRead.safeParse(bad).success).toBe(false);
  });

  it('rechaza más de 4 openers', () => {
    const o = profileFixture.openers[0];
    expect(ProfileRead.safeParse({ ...profileFixture, openers: [o, o, o, o, o] }).success).toBe(
      false,
    );
  });
});

describe('Calibración del índice (anti-regresión a la media)', () => {
  const componente = profileFixture.indice.facial!;

  it('rechaza un score que no cae en el rango de su bucket', () => {
    // El vicio clásico: el modelo etiqueta "medio" y puntúa 72 igual.
    const bad = { ...componente, bucket: 'medio', score: 72 };
    expect(ComponenteIndice.safeParse(bad).success).toBe(false);
  });

  it('acepta el score en el borde del rango del bucket', () => {
    for (const [bucket, [min, max]] of Object.entries(RANGO_BUCKET)) {
      for (const score of [min, max]) {
        expect(ComponenteIndice.safeParse({ ...componente, bucket, score }).success).toBe(true);
      }
    }
  });

  it('rechaza componente sin ancla (es el mecanismo que abre la distribución)', () => {
    const { ancla: _ancla, ...sinAncla } = componente;
    expect(ComponenteIndice.safeParse(sinAncla).success).toBe(false);
  });

  it('rechaza componente sin evidencia', () => {
    expect(ComponenteIndice.safeParse({ ...componente, evidencia: [] }).success).toBe(false);
  });

  it('los rangos de bucket cubren 0-100 sin huecos ni solapes', () => {
    const rangos = Object.values(RANGO_BUCKET)
      .map(([min, max]) => [min, max] as const)
      .sort((a, b) => a[0] - b[0]);
    expect(rangos.at(0)?.[0]).toBe(0);
    expect(rangos.at(-1)?.[1]).toBe(100);
    for (let i = 1; i < rangos.length; i += 1) {
      expect(rangos.at(i)?.[0]).toBe((rangos.at(i - 1)?.[1] ?? 0) + 1);
    }
  });
});

describe('RadarRead', () => {
  const radar = {
    version: '1.0',
    indice: {
      bucket: 'alto',
      score: 71,
      lectura: 'cara fuerte, producción media, compite bien sin ser top',
      precision: 'rapida',
      confianza: 0.55,
    },
    gap_delta: 12,
    probabilidad_respuesta: profileFixture.probabilidad_respuesta,
    openers: [
      profileFixture.openers[0],
      profileFixture.openers[1],
      profileFixture.openers[2],
    ],
    veredicto: 'volumen_bajo_esfuerzo',
    alerta_autenticidad: null,
    ms_motor: 4200,
  };

  it('valida el ejemplo', () => {
    expect(() => RadarRead.parse(radar)).not.toThrow();
  });

  it('exige exactamente 3 openers (presupuesto de latencia)', () => {
    const o = radar.openers[0];
    expect(RadarRead.safeParse({ ...radar, openers: [o, o] }).success).toBe(false);
    expect(RadarRead.safeParse({ ...radar, openers: [o, o, o, o] }).success).toBe(false);
  });

  it('no deja pasar precisión distinta de rapida (el radar no finge ser F5)', () => {
    const bad = { ...radar, indice: { ...radar.indice, precision: 'completa' } };
    expect(RadarRead.safeParse(bad).success).toBe(false);
  });

  it('aplica el mismo guard de bucket que F5', () => {
    const bad = { ...radar, indice: { ...radar.indice, bucket: 'bajo', score: 71 } };
    expect(RadarRead.safeParse(bad).success).toBe(false);
  });
});

describe('CompareResult', () => {
  const lado = (etiqueta: string, global: number) => ({
    etiqueta,
    global,
    facial: profileFixture.indice.facial,
    presentacion: profileFixture.indice.presentacion,
    produccion: profileFixture.indice.produccion,
    fortaleza: 'mirada y mandíbula sostienen la foto sin ayuda',
    debilidad: 'la ropa y el fondo la tiran abajo',
  });

  const comparacion = {
    version: '1.0',
    usuario: lado('usuario', 58),
    objetivo: lado('objetivo', 81),
    gap: profileFixture.gap,
    descomposicion: {
      cerrables: 14,
      no_cerrables: 9,
      plan: [
        { accion: 'foto con luz de día y fotógrafo, no selfie de espejo', puntos: 7, plazo: 'semana' },
        { accion: 'corte de pelo y barba definida', puntos: 4, plazo: 'semana' },
        { accion: 'bajar 6 kilos y sostenerlo', puntos: 3, plazo: 'trimestre' },
      ],
    },
    veredicto:
      'de los 23 puntos que te separan, 14 son tuyos y los cerrás en seis semanas; los otros 9 son cara y no se negocian',
    techo_estimado: 72,
    confianza: 0.63,
  };

  it('valida el ejemplo', () => {
    expect(() => CompareResult.parse(comparacion)).not.toThrow();
  });

  it('exige plan con al menos una acción (un gap sin salida no se entrega)', () => {
    const bad = {
      ...comparacion,
      descomposicion: { ...comparacion.descomposicion, plan: [] },
    };
    expect(CompareResult.safeParse(bad).success).toBe(false);
  });

  it('rechaza plazos fuera del enum', () => {
    const bad = {
      ...comparacion,
      descomposicion: {
        ...comparacion.descomposicion,
        plan: [{ accion: 'x', puntos: 3, plazo: 'cuando_se_pueda' }],
      },
    };
    expect(CompareResult.safeParse(bad).success).toBe(false);
  });
});

describe('AnalisisRechazado', () => {
  it('valida un rechazo por menor aparente', () => {
    const rechazo = {
      version: '2.0',
      rechazado: true,
      motivo: 'menor_aparente',
      detalle: 'el sujeto aparenta ser menor de edad; no se puntúa ni se archiva',
    };
    expect(() => AnalisisRechazado.parse(rechazo)).not.toThrow();
  });

  it('no admite scores en un rechazo (strict)', () => {
    const bad = {
      version: '2.0',
      rechazado: true,
      motivo: 'menor_aparente',
      detalle: 'x',
      indice: profileFixture.indice,
    };
    expect(AnalisisRechazado.safeParse(bad).success).toBe(false);
  });
});
