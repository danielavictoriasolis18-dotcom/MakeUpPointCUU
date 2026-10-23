# Cotizaciones y ventas

Las cotizaciones se guardan por folio sin vencimiento automático, con los productos,
cantidades y precios del momento. Generarlas o enviarlas por WhatsApp no aparta ni
descuenta inventario. La disponibilidad se confirma al registrar la venta.

Cuando la encargada indique el resultado de un folio, usar el comando privado:

```powershell
node scripts/quote-status.js 123 ver
node scripts/quote-status.js 123 vendido
node scripts/quote-status.js 123 no-vendido
```

Requiere las variables de integración ya configuradas en un entorno autorizado:
`KV_REST_API_URL`, `KV_REST_API_TOKEN` y `STRIPE_SECRET_KEY` (el módulo de comercio
compartido comprueba las tres). No guardar sus valores en Git ni exponerlos en la
tienda. Este comando no es una API pública y los clientes no pueden marcar ventas.

`vendido` comprueba existencias y descuenta todas las piezas en una sola operación
atómica. Repetir la misma confirmación no vuelve a descontar. `no-vendido` conserva
el folio sin descontar. Un folio resuelto no puede cambiarse de estado con este
comando; se debe revisar antes de corregir una venta. Si faltan piezas, se informa
el conflicto sin registrar la venta ni descontar parcialmente.

Stripe conserva su reserva temporal durante el proceso de pago. El pago confirmado
se registra automáticamente al regresar de Stripe o en la siguiente actualización
del inventario. Las reservas vencidas sin pago se liberan. Los antiguos apartados
de cotización sin sesión Stripe se liberan en la siguiente actualización del
inventario, conservando los folios que todavía existan. Los folios que ya hubieran
vencido y desaparecido antes de este cambio no se pueden recuperar desde Redis.
