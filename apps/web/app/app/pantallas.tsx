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
      <h1 className="display">Tu primera auditoría<br />ya está en el expediente.</h1>
      <p>
        La auditoría gratis es una sola por cuenta. Para volver a auditarte después de mejorar tu
        perfil, y desbloquear el plan completo de fotos, el Kit te cubre: incluye re-chequeo a los 30 días.
      </p>
      <div>
        <button className="btn">Pasar al Kit · US$ 19</button>
      </div>
    </div>
  );
}
