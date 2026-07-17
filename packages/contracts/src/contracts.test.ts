import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AuditResult } from './audit-result.js';
import { ChatTurnAnalysis } from './chat-turn-analysis.js';
import { ProfileRead } from './profile-read.js';

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

describe('ProfileRead (§6.3)', () => {
  it('valida el ejemplo de la spec', () => {
    expect(() => ProfileRead.parse(profileFixture)).not.toThrow();
  });

  it('acepta intencion_declarada null (nunca se infiere de fotos)', () => {
    expect(profileFixture.intencion_declarada).toBeNull();
    expect(() => ProfileRead.parse(profileFixture)).not.toThrow();
  });

  it('rechaza campos de inferencia prohibida (disponibilidad, orientación, salud)', () => {
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
});
