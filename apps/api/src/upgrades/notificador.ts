import type { Sku } from '@percentil/contracts';

/**
 * Aviso al admin cuando alguien pide un plan.
 *
 * Regla de oro: el aviso NUNCA puede voltear la solicitud. Si el mail falla, la
 * solicitud igual quedó guardada y aparece en el panel de admin. El mail es el
 * empujón ("mirá, entró uno"), la base es la fuente de verdad.
 */

export interface AvisoSolicitud {
  userId: string;
  email: string | null;
  sku: Sku;
  mensaje: string | null;
  /** Cuántas auditorías hizo: sirve para saber si es alguien enganchado o un curioso. */
  auditorias?: number;
}

export interface Notificador {
  avisarSolicitud(aviso: AvisoSolicitud): Promise<void>;
}

/** Sin RESEND_API_KEY: no se manda nada y no se rompe nada. */
export class NoopNotificador implements Notificador {
  async avisarSolicitud(): Promise<void> {
    /* sin canal configurado */
  }
}

const NOMBRE_SKU: Record<Sku, string> = {
  kit: 'Kit de Rescate (pago único)',
  copiloto_mensual: 'Copiloto (suscripción mensual)',
};

function cuerpo(aviso: AvisoSolicitud, panelUrl: string): string {
  const contacto = aviso.email ?? '(sin email en el token)';
  const nota =
    aviso.mensaje !== null && aviso.mensaje !== ''
      ? `<p style="margin:16px 0 0;padding:12px 14px;background:#12100F;border-left:2px solid #C94B32;color:#D8D2CB;font-size:14px">${escapar(aviso.mensaje)}</p>`
      : '';
  const uso =
    aviso.auditorias !== undefined
      ? `<tr><td style="padding:4px 0;color:#8A827A">Auditorías hechas</td><td style="padding:4px 0;color:#EDE7E0">${aviso.auditorias}</td></tr>`
      : '';

  return `<div style="font-family:ui-monospace,Menlo,monospace;background:#0A0908;padding:28px;color:#EDE7E0">
  <p style="margin:0 0 4px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#C94B32">Datemaxxer</p>
  <h1 style="margin:0 0 20px;font-size:20px;font-weight:600">Alguien quiere pagar</h1>
  <table style="border-collapse:collapse;font-size:14px">
    <tr><td style="padding:4px 24px 4px 0;color:#8A827A">Producto</td><td style="padding:4px 0;color:#EDE7E0">${NOMBRE_SKU[aviso.sku]}</td></tr>
    <tr><td style="padding:4px 24px 4px 0;color:#8A827A">Email</td><td style="padding:4px 0;color:#EDE7E0">${escapar(contacto)}</td></tr>
    <tr><td style="padding:4px 24px 4px 0;color:#8A827A">User id</td><td style="padding:4px 0;color:#8A827A;font-size:12px">${escapar(aviso.userId)}</td></tr>
    ${uso}
  </table>
  ${nota}
  <p style="margin:24px 0 0"><a href="${panelUrl}" style="display:inline-block;padding:11px 18px;background:#C94B32;color:#0A0908;text-decoration:none;font-size:13px;font-weight:600;letter-spacing:.04em">Abrir el panel</a></p>
  <p style="margin:16px 0 0;font-size:12px;color:#5F584F">Mandale el link de pago y activale el plan desde el panel cuando entre la plata.</p>
</div>`;
}

function escapar(texto: string): string {
  return texto
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export interface ResendConfig {
  apiKey: string;
  /** Remitente. `onboarding@resend.dev` sirve sin dominio verificado, pero solo
   *  entrega a la casilla dueña de la cuenta de Resend, que es justo el caso. */
  from: string;
  to: string;
  panelUrl: string;
  /** Inyectable para tests. */
  fetchImpl?: typeof fetch;
}

export class ResendNotificador implements Notificador {
  constructor(private readonly cfg: ResendConfig) {}

  async avisarSolicitud(aviso: AvisoSolicitud): Promise<void> {
    const doFetch = this.cfg.fetchImpl ?? fetch;
    const respuesta = await doFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.cfg.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: this.cfg.from,
        to: [this.cfg.to],
        subject: `[Datemaxxer] Pidió ${NOMBRE_SKU[aviso.sku]} — ${aviso.email ?? aviso.userId}`,
        html: cuerpo(aviso, this.cfg.panelUrl),
      }),
    });
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Resend respondió ${respuesta.status}: ${detalle.slice(0, 200)}`);
    }
  }
}
