/**
 * El mail con el código de ingreso lo manda NUESTRA API por Resend, no Supabase.
 *
 * Existe porque el SMTP built-in del proyecto Supabase está roto (500 "Error
 * sending confirmation email" reproducido por curl) y arreglarlo pide dashboard.
 * Con este camino el código sale de `generate_link` (admin API) y el correo lo
 * despachamos nosotros: Supabase nunca intenta mandar nada.
 *
 * Regla del remitente: `onboarding@resend.dev` solo entrega a la casilla dueña
 * de la cuenta de Resend. Para usuarios reales hace falta RESEND_FROM con un
 * dominio verificado en Resend.
 */

export interface MailerOtp {
  mandarCodigo(email: string, codigo: string): Promise<void>;
}

function cuerpo(codigo: string): string {
  return `<div style="font-family:ui-monospace,Menlo,monospace;background:#0A0908;padding:32px;color:#EDE7E0">
  <p style="margin:0 0 4px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#C94B32">Datemaxxer</p>
  <h1 style="margin:0 0 8px;font-size:20px;font-weight:600">Tu código para entrar</h1>
  <p style="margin:0 0 20px;font-size:14px;color:#8A827A">Vence en una hora y sirve una sola vez.</p>
  <p style="margin:0;padding:16px 20px;display:inline-block;background:#12100F;border:1px solid #2A2622;font-size:30px;letter-spacing:.32em;color:#4FD9C2">${codigo}</p>
  <p style="margin:24px 0 0;font-size:12px;color:#5F584F">Si no fuiste tú, ignora este correo: sin el código nadie entra.</p>
</div>`;
}

export interface ResendMailerConfig {
  apiKey: string;
  from: string;
  /** Inyectable para tests. */
  fetchImpl?: typeof fetch;
}

export class ResendMailerOtp implements MailerOtp {
  constructor(private readonly cfg: ResendMailerConfig) {}

  async mandarCodigo(email: string, codigo: string): Promise<void> {
    const doFetch = this.cfg.fetchImpl ?? fetch;
    const respuesta = await doFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.cfg.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: this.cfg.from,
        to: [email],
        subject: `${codigo} es tu código de Datemaxxer`,
        html: cuerpo(codigo),
        text: `Tu código de Datemaxxer es ${codigo}. Vence en una hora y sirve una sola vez.`,
      }),
    });
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new Error(`Resend respondió ${respuesta.status}: ${detalle.slice(0, 200)}`);
    }
  }
}
