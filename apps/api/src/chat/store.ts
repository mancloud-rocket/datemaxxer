import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ChatTurnAnalysis } from '@percentil/contracts';
import { AppError } from '../errors.js';
import type { MensajeParseado } from '../engines/behavior.js';

/**
 * F4 - conversaciones y snapshots.
 *
 * Las tablas ya existían del schema original (`conversations`, `chat_snapshots`).
 *
 * `behavior_state` guarda los mensajes acumulados: la latencia solo significa
 * algo contra la historia, así que cada snapshot nuevo se lee junto con todo lo
 * anterior en vez de aislado.
 */

export interface Conversacion {
  id: string;
  userId: string;
  label: string;
  platform: string | null;
  /** Mensajes acumulados de todos los snapshots. */
  mensajes: MensajeParseado[];
  ultimoVeredicto: string | null;
  feedback: string | null;
  createdAt: Date;
}

export interface Snapshot {
  id: string;
  conversationId: string;
  analisis: ChatTurnAnalysis | null;
  createdAt: Date;
}

export interface ChatStore {
  crearConversacion(userId: string, label: string, platform: string | null): Promise<Conversacion>;
  listar(userId: string): Promise<Conversacion[]>;
  obtener(id: string): Promise<Conversacion | undefined>;
  /** Guarda el turno: el análisis y los mensajes acumulados. */
  guardarTurno(params: {
    conversationId: string;
    analisis: ChatTurnAnalysis;
    mensajes: MensajeParseado[];
  }): Promise<void>;
  snapshots(conversationId: string): Promise<Snapshot[]>;
  /** Feedback loop: qué pasó realmente con el veredicto. */
  registrarFeedback(conversationId: string, feedback: string): Promise<void>;
}

export class InMemoryChatStore implements ChatStore {
  readonly conversaciones = new Map<string, Conversacion>();
  readonly snaps: Snapshot[] = [];
  private n = 0;

  async crearConversacion(userId: string, label: string, platform: string | null): Promise<Conversacion> {
    const c: Conversacion = {
      id: `c${++this.n}`,
      userId,
      label,
      platform,
      mensajes: [],
      ultimoVeredicto: null,
      feedback: null,
      createdAt: new Date(),
    };
    this.conversaciones.set(c.id, c);
    return c;
  }

  async listar(userId: string): Promise<Conversacion[]> {
    return [...this.conversaciones.values()]
      .filter((c) => c.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async obtener(id: string): Promise<Conversacion | undefined> {
    return this.conversaciones.get(id);
  }

  async guardarTurno(p: {
    conversationId: string;
    analisis: ChatTurnAnalysis;
    mensajes: MensajeParseado[];
  }): Promise<void> {
    const c = this.conversaciones.get(p.conversationId);
    if (c) {
      c.mensajes = p.mensajes;
      c.ultimoVeredicto = p.analisis.veredicto.decision;
    }
    this.snaps.push({
      id: `s${++this.n}`,
      conversationId: p.conversationId,
      analisis: p.analisis,
      createdAt: new Date(),
    });
  }

  async snapshots(conversationId: string): Promise<Snapshot[]> {
    return this.snaps.filter((s) => s.conversationId === conversationId);
  }

  async registrarFeedback(conversationId: string, feedback: string): Promise<void> {
    const c = this.conversaciones.get(conversationId);
    if (c) c.feedback = feedback;
  }
}

function storeError(op: string, message: string): AppError {
  return new AppError('store', `Supabase ${op} falló: ${message}`, 500);
}

interface FilaConv {
  id: string;
  user_id: string;
  label: string;
  platform: string | null;
  behavior_state: { mensajes?: MensajeParseado[] } | null;
  last_verdict: string | null;
  verdict_feedback: string | null;
  created_at: string;
}

const aConv = (f: FilaConv): Conversacion => ({
  id: f.id,
  userId: f.user_id,
  label: f.label,
  platform: f.platform,
  mensajes: f.behavior_state?.mensajes ?? [],
  ultimoVeredicto: f.last_verdict,
  feedback: f.verdict_feedback,
  createdAt: new Date(f.created_at),
});

const COLS = 'id, user_id, label, platform, behavior_state, last_verdict, verdict_feedback, created_at';

export class SupabaseChatStore implements ChatStore {
  private readonly db: SupabaseClient<any, any, 'percentil', any, any>;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      db: { schema: 'percentil' },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async crearConversacion(userId: string, label: string, platform: string | null): Promise<Conversacion> {
    const { error: perfilError } = await this.db
      .from('profiles')
      .upsert({ id: userId }, { ignoreDuplicates: true });
    if (perfilError) throw storeError('upsert profiles', perfilError.message);

    const { data, error } = await this.db
      .from('conversations')
      .insert({ user_id: userId, label, platform })
      .select(COLS)
      .single<FilaConv>();
    if (error) throw storeError('insert conversations', error.message);
    return aConv(data);
  }

  async listar(userId: string): Promise<Conversacion[]> {
    const { data, error } = await this.db
      .from('conversations')
      .select(COLS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .returns<FilaConv[]>();
    if (error) throw storeError('select conversations', error.message);
    return (data ?? []).map(aConv);
  }

  async obtener(id: string): Promise<Conversacion | undefined> {
    const { data, error } = await this.db
      .from('conversations')
      .select(COLS)
      .eq('id', id)
      .maybeSingle<FilaConv>();
    if (error) throw storeError('select conversation', error.message);
    return data ? aConv(data) : undefined;
  }

  async guardarTurno(p: {
    conversationId: string;
    analisis: ChatTurnAnalysis;
    mensajes: MensajeParseado[];
  }): Promise<void> {
    const { error: snapError } = await this.db.from('chat_snapshots').insert({
      conversation_id: p.conversationId,
      source: 'screenshot',
      // `extracted` es NOT NULL en el schema original.
      extracted: { mensajes: p.mensajes },
      analysis: p.analisis,
    });
    if (snapError) throw storeError('insert chat_snapshots', snapError.message);

    const { error } = await this.db
      .from('conversations')
      .update({
        behavior_state: { mensajes: p.mensajes },
        last_verdict: p.analisis.veredicto.decision,
      })
      .eq('id', p.conversationId);
    if (error) throw storeError('update conversation', error.message);
  }

  async snapshots(conversationId: string): Promise<Snapshot[]> {
    const { data, error } = await this.db
      .from('chat_snapshots')
      .select('id, conversation_id, analysis, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .returns<Array<{ id: string; conversation_id: string; analysis: ChatTurnAnalysis | null; created_at: string }>>();
    if (error) throw storeError('select chat_snapshots', error.message);
    return (data ?? []).map((f) => ({
      id: f.id,
      conversationId: f.conversation_id,
      analisis: f.analysis,
      createdAt: new Date(f.created_at),
    }));
  }

  async registrarFeedback(conversationId: string, feedback: string): Promise<void> {
    const { error } = await this.db
      .from('conversations')
      .update({ verdict_feedback: feedback })
      .eq('id', conversationId);
    if (error) throw storeError('update verdict_feedback', error.message);
  }
}
