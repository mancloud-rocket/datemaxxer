/**
 * Generación del código de ingreso contra la admin API de GoTrue.
 *
 * Dos pasos: asegurar que el usuario exista (alta con email confirmado, sin
 * contraseña) y pedir un magiclink, cuyo `email_otp` es el código numérico que
 * el usuario canjea con `verifyOtp({type:'email'})` desde el cliente.
 * Verificado contra el proyecto real: el OTP es de 8 dígitos y abre sesión.
 */

export interface GeneradorOtp {
  /** Devuelve el código a mandar por mail. Crea la cuenta si no existe. */
  generarCodigo(email: string): Promise<string>;
}

export interface SupabaseOtpConfig {
  url: string;
  serviceRoleKey: string;
  /** Inyectable para tests. */
  fetchImpl?: typeof fetch;
}

export class SupabaseGeneradorOtp implements GeneradorOtp {
  constructor(private readonly cfg: SupabaseOtpConfig) {}

  private headers(): Record<string, string> {
    return {
      apikey: this.cfg.serviceRoleKey,
      authorization: `Bearer ${this.cfg.serviceRoleKey}`,
      'content-type': 'application/json',
    };
  }

  async generarCodigo(email: string): Promise<string> {
    const doFetch = this.cfg.fetchImpl ?? fetch;

    // Alta idempotente: si ya existe, GoTrue contesta 422 y seguimos igual.
    const alta = await doFetch(`${this.cfg.url}/auth/v1/admin/users`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ email, email_confirm: true }),
    });
    if (!alta.ok && alta.status !== 422) {
      const detalle = await alta.text().catch(() => '');
      throw new Error(`alta de usuario respondió ${alta.status}: ${detalle.slice(0, 200)}`);
    }

    const link = await doFetch(`${this.cfg.url}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ type: 'magiclink', email }),
    });
    if (!link.ok) {
      const detalle = await link.text().catch(() => '');
      throw new Error(`generate_link respondió ${link.status}: ${detalle.slice(0, 200)}`);
    }
    const cuerpo = (await link.json()) as { email_otp?: unknown };
    if (typeof cuerpo.email_otp !== 'string' || cuerpo.email_otp === '') {
      throw new Error('generate_link no devolvió email_otp');
    }
    return cuerpo.email_otp;
  }
}
