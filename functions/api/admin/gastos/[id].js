// ============================================================
// BizFlow - Admin Gastos [id] API
// DELETE: Delete expense
// ============================================================

import { jsonResponse, errorResponse, handleCors } from '../../../lib/db-helpers.js';
import { eliminarArchivoR2 } from '../../../lib/r2-helpers.js';

export async function onRequest(context) {
  const cors = handleCors(context.request);
  if (cors) return cors;

  const { request, env, params } = context;
  const { DB, MEDIA } = env;
  const { id } = params;

  if (request.method !== 'DELETE') {
    return errorResponse('Método no permitido', 405);
  }

  try {
    const gasto = await DB.prepare(
      'SELECT id, concepto, comprobante FROM GastosNegocio WHERE id = ?'
    ).bind(id).first();

    if (!gasto) {
      return errorResponse('Gasto no encontrado', 404);
    }

    // Delete receipt from R2 if exists
    if (gasto.comprobante && MEDIA) {
      try {
        await eliminarArchivoR2(MEDIA, gasto.comprobante);
      } catch (err) {
        console.error('Error eliminando comprobante R2:', err);
      }

      // Delete from MediosR2
      try {
        await DB.prepare('DELETE FROM MediosR2 WHERE ruta = ?').bind(gasto.comprobante).run();
      } catch (err) {
        console.error('Error eliminando medio R2:', err);
      }
    }

    await DB.prepare(
      'DELETE FROM GastosNegocio WHERE id = ?'
    ).bind(id).run();

    return jsonResponse({ mensaje: `Gasto "${gasto.concepto}" eliminado correctamente` });
  } catch (error) {
    console.error('Gasto [id] delete error:', error);
    return errorResponse('Error eliminando gasto: ' + error.message, 500);
  }
}
