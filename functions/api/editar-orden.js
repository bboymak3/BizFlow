export async function onRequestPut(context) {
  const { request, env } = context;
  try {
    const data = await request.json();
    if (!data.orden_id) return new Response(JSON.stringify({ success: false, error: 'Falta orden_id' }), { headers: { 'Content-Type': 'application/json' }, status: 400 });
    const existe = await env.DB.prepare('SELECT id FROM OrdenesTrabajo WHERE id = ?').bind(data.orden_id).first();
    if (!existe) return new Response(JSON.stringify({ success: false, error: 'Orden no encontrada' }), { headers: { 'Content-Type': 'application/json' }, status: 404 });
    if (data.cliente_id) await env.DB.prepare('UPDATE Clientes SET nombre = ?, rut = ?, telefono = ? WHERE id = ?').bind(data.cliente || '', data.rut || null, data.telefono || '', data.cliente_id).run();
    if (data.vehiculo_id) await env.DB.prepare('UPDATE Vehiculos SET marca = ?, modelo = ?, anio = ?, cilindrada = ?, combustible = ?, kilometraje = ? WHERE id = ?').bind(data.marca || null, data.modelo || null, data.anio || null, data.cilindrada || null, data.combustible || null, data.kilometraje || null, data.vehiculo_id).run();
    let montoTotal = data.monto_total || 0;
    if (data.servicios_seleccionados) { try { const s = typeof data.servicios_seleccionados === 'string' ? JSON.parse(data.servicios_seleccionados) : data.servicios_seleccionados; if (Array.isArray(s) && s.length > 0) { const c = s.reduce((sum, x) => sum + (Number(x.precio_final) || Number(x.precio_sugerido) || 0), 0); if (c > 0) montoTotal = c; } } catch(e){} }
    const montoAbono = Number(data.monto_abono) || 0;
    const sj = data.servicios_seleccionados ? (typeof data.servicios_seleccionados === 'string' ? data.servicios_seleccionados : JSON.stringify(data.servicios_seleccionados)) : null;
    const cj = data.diagnostico_checks ? (typeof data.diagnostico_checks === 'string' ? data.diagnostico_checks : JSON.stringify(data.diagnostico_checks)) : null;
    await env.DB.prepare('UPDATE OrdenesTrabajo SET patente_placa=?,marca=?,modelo=?,anio=?,cilindrada=?,combustible=?,kilometraje=?,fecha_ingreso=?,hora_ingreso=?,recepcionista=?,direccion=?,trabajo_frenos=?,trabajo_luces=?,trabajo_tren_delantero=?,trabajo_correas=?,trabajo_componentes=?,nivel_combustible=?,check_paragolfe_delantero_der=?,check_puerta_delantera_der=?,check_puerta_trasera_der=?,check_paragolfe_trasero_izq=?,check_otros_carroceria=?,monto_total=?,monto_abono=?,monto_restante=?,metodo_pago=?,diagnostico_checks=?,diagnostico_observaciones=?,servicios_seleccionados=?,estado=? WHERE id=?')
    .bind(data.patente||'',data.marca||null,data.modelo||null,data.anio||null,data.cilindrada||null,data.combustible||null,data.kilometraje||null,data.fecha_ingreso||null,data.hora_ingreso||null,data.recepcionista||null,data.direccion||null,data.trabajo_frenos?1:0,data.trabajo_luces?1:0,data.trabajo_tren_delantero?1:0,data.trabajo_correas?1:0,data.trabajo_componentes?1:0,data.nivel_combustible||null,data.check_paragolfe_delantero_der?1:0,data.check_puerta_delantera_der?1:0,data.check_puerta_trasera_der?1:0,data.check_paragolfe_trasero_izq?1:0,data.check_otros_carroceria||null,montoTotal,montoAbono,montoTotal-montoAbono,data.metodo_pago||null,cj,data.diagnostico_observaciones||null,sj,data.estado||'Enviada',data.orden_id).run();
    return new Response(JSON.stringify({ success: true, mensaje: 'Orden actualizada' }), { headers: { 'Content-Type': 'application/json' } });
  } catch(error) { return new Response(JSON.stringify({ success: false, error: error.message }), { headers: { 'Content-Type': 'application/json' }, status: 500 }); }
}
