import { describe, expect, it } from 'vitest';
import { EngineError, ValidationError } from '../errors.js';
import type { ClaudeClient } from './audit.js';
import {
  buildProfileReadEngine,
  SYSTEM_PROMPT,
  type ProfileReadInput,
} from './profileread.js';

type Respuesta = { content: Array<{ type: string; text?: string }>; stop_reason: string | null };

const json = (obj: unknown, stop = 'end_turn'): Respuesta => ({
  content: [{ type: 'text', text: JSON.stringify(obj) }],
  stop_reason: stop,
});

function cliente(cola: Respuesta[]) {
  const llamadas: Array<Record<string, unknown>> = [];
  const client: ClaudeClient = {
    messages: {
      create: async (params) => {
        llamadas.push(params);
        const next = cola.shift();
        if (!next) throw new Error('mock sin respuestas');
        return next;
      },
    },
  };
  return { client, llamadas };
}

const componente = (bucket: string, score: number) => ({
  bucket,
  score,
  evidencia: ['lo que se ve'],
  ancla: { un_bucket_arriba: 'mejor luz y un plano entero', un_bucket_abajo: 'sin foto frontal nítida' },
  confianza: 0.75,
});

const PASA = { rechazado: false, motivo: null, detalle: null };

const PASO1 = {
  lectura_por_foto: [
    { foto: 1, muestra: 'retrato en exterior', señales: ['luz de día', 'plano medio'], aporta_al_juicio: 'permite leer rasgos' },
    { foto: 2, muestra: 'cuerpo entero en un bar', señales: ['vestido', 'noche'], aporta_al_juicio: 'permite leer presentación' },
  ],
};

const PASO2 = {
  indice: {
    facial: componente('alto', 68),
    presentacion: componente('alto', 64),
    produccion: componente('medio', 52),
    limitantes: [],
  },
  selectividad: {
    nivel: 'alta',
    filtros_declarados: ['+1.80', 'nada de hookups'],
    evidencia: ['la bio lista requisitos'],
    confianza: 0.8,
  },
  autenticidad: {
    veredicto: 'genuino',
    tipo_sospecha: null,
    señales: ['mezcla fotos casuales con producidas'],
    confianza: 0.8,
  },
  eje_declarado: { principal: 'estetica', secundario: 'aventura', confianza: 0.7 },
  nivel_curaduria: 'producido',
  densidad_competitiva: { nivel: 'alta', implicancia: 'compite con muchos perfiles parecidos' },
  intencion_declarada: 'algo serio',
  coherencia_texto_fotos: { coincide: true, nota: 'el texto y las fotos dicen lo mismo' },
  expectativa_de_plan: {
    nivel: 'alto',
    evidencia: ['restaurantes caros', 'viaje a Europa'],
    traduccion: 'su perfil vende un estándar; unas birras compite mal acá',
    confianza: 0.7,
  },
  ganchos: [{ tipo: 'lugar', dato: 'Lisboa', uso: 'preguntale qué barrio le gustó, sin decir que viste la foto' }],
  registro_sugerido: { tono: 'directo pero liviano', evitar: ['piropos', 'mayúsculas'] },
  openers: [
    {
      tono: 'contexto',
      texto: 'Vi Lisboa. ¿Alfama o Belém?',
      licencia: 'ella publicó una foto en Lisboa con la ciudad identificable',
      riesgo: 'bajo',
      por_que_funciona: 'obliga a elegir, no a responder sí o no',
    },
  ],
  disclaimer: 'Esto es una lectura sobre un perfil, no sobre una persona.',
};

const INPUT: ProfileReadInput = {
  photos: [
    { data: 'aGVsbG8=', mediaType: 'image/jpeg' },
    { data: 'aGVsbG8=', mediaType: 'image/jpeg' },
  ],
  region: 'rioplatense',
  globalUsuario: 55,
};

describe('engines/profileread (F5) - filtro de rechazo', () => {
  it('un menor aparente corta antes de puntuar y NO devuelve ningún score', () => {
    // Es la regla más importante del motor: puntuar el atractivo de un menor no
    // es una discusión de tono, es un delito.
    const { client, llamadas } = cliente([
      json({ rechazado: true, motivo: 'menor_aparente', detalle: 'contexto escolar y rasgos infantiles' }),
    ]);
    return buildProfileReadEngine({ client })
      .run(INPUT)
      .then((salida) => {
        expect(salida.ok).toBe(false);
        if (salida.ok) throw new Error('debería haber rechazado');
        expect(salida.rechazo.motivo).toBe('menor_aparente');
        expect(salida.rechazo.version).toBe('2.0');
        // Y lo más importante: no siguió llamando al modelo para puntuar.
        expect(llamadas).toHaveLength(1);
        expect(JSON.stringify(salida.rechazo)).not.toMatch(/score|indice|bucket/i);
      });
  });

  it('el triage es su propio paso: se corre antes que la lectura de fotos', async () => {
    const { client, llamadas } = cliente([json(PASA), json(PASO1), json(PASO2)]);
    await buildProfileReadEngine({ client }).run(INPUT);
    expect(JSON.stringify(llamadas[0])).toContain('PASO 0');
    expect(JSON.stringify(llamadas[1])).toContain('PASO 1');
    expect(JSON.stringify(llamadas[2])).toContain('PASO 2');
  });

  it('rechaza los otros motivos igual', async () => {
    for (const motivo of ['sin_persona_identificable', 'imagen_ilegible', 'no_es_un_perfil'] as const) {
      const { client } = cliente([json({ rechazado: true, motivo, detalle: 'algo' })]);
      const salida = await buildProfileReadEngine({ client }).run(INPUT);
      expect(salida.ok).toBe(false);
      if (!salida.ok) expect(salida.rechazo.motivo).toBe(motivo);
    }
  });

  it('un rechazo sin motivo no pasa (no se puede accionar ni auditar)', async () => {
    const roto = { rechazado: true, motivo: null, detalle: null };
    const { client } = cliente([json(roto), json(roto)]);
    await expect(buildProfileReadEngine({ client }).run(INPUT)).rejects.toBeInstanceOf(EngineError);
  });

  it('si no se pudo evaluar ni un componente, rechaza en vez de entregar un informe con huecos', async () => {
    const sinIndice = {
      ...PASO2,
      indice: { facial: null, presentacion: null, produccion: null, limitantes: ['todo borroso'] },
    };
    const { client } = cliente([json(PASA), json(PASO1), json(sinIndice)]);
    const salida = await buildProfileReadEngine({ client }).run(INPUT);
    expect(salida.ok).toBe(false);
    if (!salida.ok) expect(salida.rechazo.motivo).toBe('imagen_ilegible');
  });
});

describe('engines/profileread (F5) - síntesis', () => {
  it('happy path: devuelve un ProfileRead válido', async () => {
    const { client } = cliente([json(PASA), json(PASO1), json(PASO2)]);
    const salida = await buildProfileReadEngine({ client }).run(INPUT);

    expect(salida.ok).toBe(true);
    if (!salida.ok) return;
    expect(salida.result.version).toBe('2.0');
    expect(salida.result.openers).toHaveLength(1);
    expect(salida.result.intencion_declarada).toBe('algo serio');
  });

  it('el índice lo cierra el código con los pesos de objetivo', async () => {
    const { client } = cliente([json(PASA), json(PASO1), json(PASO2)]);
    const salida = await buildProfileReadEngine({ client }).run(INPUT);
    if (!salida.ok) throw new Error('debería haber salido bien');

    // 68*.50 + 64*.30 + 52*.20 = 34 + 19.2 + 10.4 = 63.6 → 64
    expect(salida.result.indice.global).toBe(64);
    expect(salida.result.indice.bucket_global).toBe('alto');
    expect(salida.result.indice.fotos_evaluadas).toBe(2);
    expect(salida.result.indice.margen).toBeGreaterThan(0);
  });

  it('el gap sale del índice del usuario, no del modelo', async () => {
    const { client } = cliente([json(PASA), json(PASO1), json(PASO2)]);
    const salida = await buildProfileReadEngine({ client }).run(INPUT);
    if (!salida.ok) throw new Error('debería haber salido bien');
    // 64 (ella) - 55 (él) = 9 → paridad
    expect(salida.result.gap?.delta).toBe(9);
    expect(salida.result.gap?.tier).toBe('paridad');
  });

  it('sin índice propio el gap es null y el informe igual se entrega', async () => {
    const { client } = cliente([json(PASA), json(PASO1), json(PASO2)]);
    const salida = await buildProfileReadEngine({ client }).run({ ...INPUT, globalUsuario: null });
    if (!salida.ok) throw new Error('debería haber salido bien');
    expect(salida.result.gap).toBeNull();
    // Y la probabilidad lo dice con la confianza, no finge precisión.
    expect(salida.result.probabilidad_respuesta.confianza).toBeLessThan(0.7);
  });

  it('un perfil no genuino termina en no_vale aunque el índice sea alto', async () => {
    const trucho = {
      ...PASO2,
      autenticidad: {
        veredicto: 'probable_no_genuino',
        tipo_sospecha: 'vendedora_contenido',
        señales: ['handle de otra red en la bio'],
        confianza: 0.85,
      },
    };
    const { client } = cliente([json(PASA), json(PASO1), json(trucho)]);
    const salida = await buildProfileReadEngine({ client }).run(INPUT);
    if (!salida.ok) throw new Error('debería haber salido bien');
    expect(salida.result.inversion.veredicto).toBe('no_vale');
    expect(salida.result.inversion.mensajes_antes_de_soltar).toBe(0);
  });

  it('el modelo no puede colar su propio global (el contrato del paso es strict)', async () => {
    const conGlobal = { ...PASO2, indice: { ...PASO2.indice, global: 95 } };
    const { client } = cliente([json(PASA), json(PASO1), json(conGlobal), json(conGlobal)]);
    await expect(buildProfileReadEngine({ client }).run(INPUT)).rejects.toBeInstanceOf(EngineError);
  });

  it('un opener sin licencia no pasa: la licencia es el freno del tono', async () => {
    const sinLicencia = {
      ...PASO2,
      openers: [{ ...PASO2.openers[0], licencia: '' }],
    };
    const { client } = cliente([json(PASA), json(PASO1), json(sinLicencia), json(sinLicencia)]);
    await expect(buildProfileReadEngine({ client }).run(INPUT)).rejects.toBeInstanceOf(EngineError);
  });

  it('un score fuera del rango de su bucket no pasa', async () => {
    const descalibrado = {
      ...PASO2,
      indice: { ...PASO2.indice, facial: componente('bajo', 68) },
    };
    const { client } = cliente([json(PASA), json(PASO1), json(descalibrado), json(descalibrado)]);
    await expect(buildProfileReadEngine({ client }).run(INPUT)).rejects.toBeInstanceOf(EngineError);
  });

  it('reporta progreso de fotos para la UI', async () => {
    const { client } = cliente([json(PASA), json(PASO1), json(PASO2)]);
    const vistos: Array<{ fotos_analizadas: number; total: number }> = [];
    await buildProfileReadEngine({ client }).run(INPUT, { onProgress: (p) => vistos.push(p) });
    expect(vistos[0]).toEqual({ fotos_analizadas: 0, total: 2 });
    expect(vistos[vistos.length - 1]).toEqual({ fotos_analizadas: 2, total: 2 });
  });

  it('rechaza una cantidad de fotos fuera de rango antes de gastar una llamada', async () => {
    const { client, llamadas } = cliente([]);
    await expect(
      buildProfileReadEngine({ client }).run({ ...INPUT, photos: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(llamadas).toHaveLength(0);
  });

  it('refusal y truncado del modelo terminan en EngineError', async () => {
    for (const stop of ['refusal', 'max_tokens']) {
      const { client } = cliente([{ content: [{ type: 'text', text: '{' }], stop_reason: stop }]);
      await expect(buildProfileReadEngine({ client }).run(INPUT)).rejects.toBeInstanceOf(EngineError);
    }
  });
});

describe('engines/profileread (F5) - prompt', () => {
  it('usa la MISMA calibración que F1', async () => {
    // El gap resta un índice contra el otro: si las escalas derivan, deja de
    // significar algo y no hay forma de notarlo mirando el output.
    const { SYSTEM_PROMPT: SYSTEM_F1 } = await import('./audit.js');
    const { readFileSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const compartido = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'prompts', 'shared', 'calibracion-indice.md'),
      'utf8',
    ).trim();

    expect(SYSTEM_PROMPT).toContain(compartido);
    expect(SYSTEM_F1).toContain(compartido);
  });

  it('el filtro de menor de edad está en el prompt y manda rechazar ante la duda', () => {
    expect(SYSTEM_PROMPT).toContain('menor_aparente');
    expect(SYSTEM_PROMPT).toContain('Ante la duda, rechazás');
  });

  it('la prohibición de inferencia sigue escrita', () => {
    expect(SYSTEM_PROMPT).toContain('NUNCA se infiere');
    expect(SYSTEM_PROMPT).toContain('disponibilidad sexual como estado');
  });
});
