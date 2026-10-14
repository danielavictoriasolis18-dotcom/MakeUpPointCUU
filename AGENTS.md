# Flujo de cambios de MakeUpPointCUU

- Cuando se soliciten cambios, agruparlos en commits pequeños, cada uno con un propósito coherente y revisable.
- Usar mensajes de commit breves y explícitos que nombren la función o el cambio, por ejemplo: `agregar filtro por categoría`, `corregir total del carrito` o `actualizar título de la tienda`.
- No mezclar cambios sin relación en el mismo commit. Crear commits solo cuando haya cambios reales solicitados.
- Enviar los cambios directamente a `main`. Vercel usa `main` para desplegar producción automáticamente.
- No iniciar el sitio en localhost ni ejecutar pruebas locales, salvo que el usuario lo pida expresamente.
- Después de cada envío a `main`, comprobar el estado del despliegue de producción en Vercel y comunicar su resultado.
