'use client';

/**
 * Pantalla de límite de cupo. Login/Mesa/Escáner/Informe viven en sus
 * propios archivos (Login.tsx, Mesa.tsx, Escaner.tsx, Informe.tsx) porteados
 * de los set pieces de FRONT en design/app/.
 */

export function PantallaLimite() {
  return (
    <div className="estado-box">
      <span className="selloe">Cupo gratuito usado</span>
      <h1 className="display">Ya sabes dónde<br />estás parado.</h1>
      <p>
        La medición gratis es una sola por cuenta. Para volver a medirte después de mejorar tu
        perfil, y ver el plan completo de puntos que puedes recuperar, el Kit te cubre: incluye una
        segunda medición a los 30 días para comprobar si tu número subió.
      </p>
      <div>
        <button className="btn">Pasar al Kit · US$ 19</button>
      </div>
    </div>
  );
}
