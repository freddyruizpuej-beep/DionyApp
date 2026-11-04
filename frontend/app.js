let productos = [];
let carrito = [];
let metodoPagoSeleccionado = 'efectivo';
let urlReporteActual = '/api/reportes?filtro=hoy';

document.addEventListener('DOMContentLoaded', () => {
    cargarProductos();

    const buscador = document.getElementById('buscar-producto');
    if (buscador) {
        buscador.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtrados = productos.filter(p => 
                p.nombre.toLowerCase().includes(query) || 
                (p.codigo_barras && p.codigo_barras.includes(query))
            );
            renderizarProductosPOS(filtrados);
        });
    }
});

async function cargarProductos() {
    try {
        const res = await fetch('/api/productos');
        productos = await res.json();
        renderizarProductosPOS(productos);
        renderizarTablaInventario(productos);
    } catch (err) {
        console.error('Error al cargar productos:', err);
    }
}

function renderizarProductosPOS(lista) {
    const container = document.getElementById('grid-productos');
    if (!container) return;
    container.innerHTML = '';

    if (!lista || lista.length === 0) {
        container.innerHTML = `<p class="col-span-full text-center text-gray-400 py-8">No se encontraron bebidas.</p>`;
        return;
    }

    lista.forEach(prod => {
        const agotado = prod.stock_actual <= 0;
        const stockBajo = prod.stock_actual <= prod.stock_minimo;

        container.innerHTML += `
            <div onclick="${agotado ? '' : `agregarAlCarrito(${prod.id})`}" 
                 class="bg-white p-4 rounded-xl border ${agotado ? 'border-red-200 opacity-60 cursor-not-allowed' : 'border-gray-200 hover:border-diony-light cursor-pointer'} shadow-sm transition flex flex-col items-center text-center relative">
                
                ${stockBajo && !agotado ? `<span class="absolute top-2 right-2 bg-yellow-400 text-xs text-gray-900 px-2 py-0.5 rounded-full font-bold">¡Poco stock!</span>` : ''}
                ${agotado ? `<span class="absolute top-2 right-2 bg-red-500 text-xs text-white px-2 py-0.5 rounded-full font-bold">Agotado</span>` : ''}

                <div class="text-4xl mb-2">${prod.imagen || '🍺'}</div>
                <h3 class="font-bold text-gray-800 text-sm">${prod.nombre}</h3>
                <p class="text-diony-main font-extrabold mt-1">Bs. ${prod.precio_venta.toFixed(2)}</p>
                <span class="text-xs ${agotado ? 'text-red-500 font-bold' : 'text-gray-500'} mt-1">Stock: ${prod.stock_actual}</span>
            </div>
        `;
    });
}

function agregarAlCarrito(id) {
    const prod = productos.find(p => p.id === id);
    if (!prod || prod.stock_actual <= 0) return;

    const existe = carrito.find(item => item.id === id);
    if (existe) {
        if (existe.cantidad < prod.stock_actual) {
            existe.cantidad++;
            existe.subtotal = existe.cantidad * existe.precio_venta;
        } else {
            alert('¡No puedes agregar más, superaría el stock disponible!');
        }
    } else {
        carrito.push({
            id: prod.id,
            nombre: prod.nombre,
            precio_venta: prod.precio_venta,
            cantidad: 1,
            subtotal: prod.precio_venta
        });
    }
    actualizarCarrito();
}

function actualizarCarrito() {
    const container = document.getElementById('items-carrito');
    const totalElement = document.getElementById('total-venta');
    if (!container || !totalElement) return;

    if (carrito.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-6">El carrito está vacío</p>';
        totalElement.innerText = 'Bs. 0.00';
        const inputEfectivo = document.getElementById('input-efectivo-recibido');
        if (inputEfectivo) inputEfectivo.value = '';
        const cambioDevolver = document.getElementById('cambio-devolver');
        if (cambioDevolver) cambioDevolver.innerText = 'Bs. 0.00';
        return;
    }

    container.innerHTML = '';
    let total = 0;

    carrito.forEach(item => {
        total += item.subtotal;
        container.innerHTML += `
            <div class="flex justify-between items-center bg-emerald-50 p-2 rounded-lg border border-emerald-100">
                <div>
                    <h4 class="font-bold text-xs text-diony-dark">${item.nombre}</h4>
                    <span class="text-xs text-gray-600">Bs. ${item.precio_venta.toFixed(2)} x ${item.cantidad}</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="font-bold text-diony-main text-sm">Bs. ${item.subtotal.toFixed(2)}</span>
                    <button onclick="eliminarDelCarrito(${item.id})" class="text-red-500 font-bold text-xs hover:text-red-700">✕</button>
                </div>
            </div>
        `;
    });

    totalElement.innerText = `Bs. ${total.toFixed(2)}`;
    calcularCambio();
}

function eliminarDelCarrito(id) {
    carrito = carrito.filter(item => item.id !== id);
    actualizarCarrito();
}

function seleccionarMetodo(metodo) {
    metodoPagoSeleccionado = metodo;
    const btnEfectivo = document.getElementById('btn-efectivo');
    const btnQr = document.getElementById('btn-qr');
    const seccionEfectivo = document.getElementById('seccion-efectivo');

    if (metodo === 'efectivo') {
        btnEfectivo.className = "py-2 border-2 border-diony-main bg-diony-main text-white font-bold rounded-lg text-xs";
        btnQr.className = "py-2 border-2 border-diony-main text-diony-main font-bold rounded-lg text-xs";
        if (seccionEfectivo) seccionEfectivo.classList.remove('hidden');
    } else {
        btnQr.className = "py-2 border-2 border-diony-main bg-diony-main text-white font-bold rounded-lg text-xs";
        btnEfectivo.className = "py-2 border-2 border-diony-main text-diony-main font-bold rounded-lg text-xs";
        if (seccionEfectivo) seccionEfectivo.classList.add('hidden');
        
        // ABRIR MODAL QR CENTRADO
        document.getElementById('modal-qr').classList.remove('hidden');
    }
}

function cerrarModalQr() {
    document.getElementById('modal-qr').classList.add('hidden');
}

function calcularCambio() {
    const totalVenta = carrito.reduce((sum, item) => sum + item.subtotal, 0);
    const inputRecibido = document.getElementById('input-efectivo-recibido');
    const spanCambio = document.getElementById('cambio-devolver');
    if (!inputRecibido || !spanCambio) return;

    const efectivoRecibido = parseFloat(inputRecibido.value) || 0;
    const cambio = efectivoRecibido - totalVenta;

    if (cambio >= 0) {
        spanCambio.innerText = `Bs. ${cambio.toFixed(2)}`;
        spanCambio.className = "font-extrabold text-emerald-700 text-sm";
    } else {
        spanCambio.innerText = `Falta Bs. ${Math.abs(cambio).toFixed(2)}`;
        spanCambio.className = "font-extrabold text-red-600 text-sm";
    }
}

async function completarVenta() {
    if (carrito.length === 0) {
        alert('Agrega al menos un producto antes de cobrar.');
        return;
    }

    const total = carrito.reduce((sum, item) => sum + item.subtotal, 0);

    const datosVenta = {
        total,
        metodo_pago: metodoPagoSeleccionado,
        vendedor_id: 1,
        detalles: [...carrito]
    };

    try {
        const res = await fetch('/api/ventas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datosVenta)
        });

        const data = await res.json();

        if (res.ok) {
            mostrarRecibo(data.ventaId, datosVenta);
            carrito = [];
            actualizarCarrito();
            cargarProductos();
        } else {
            alert(`❌ Error: ${data.error}`);
        }
    } catch (err) {
        console.error('Error al registrar la venta:', err);
    }
}

function mostrarRecibo(ventaId, ventaData) {
    document.getElementById('recibo-id').innerText = `Ticket N°: #${ventaId}`;
    document.getElementById('recibo-fecha').innerText = new Date().toLocaleString();
    document.getElementById('recibo-metodo').innerText = ventaData.metodo_pago;
    document.getElementById('recibo-total').innerText = `Bs. ${ventaData.total.toFixed(2)}`;

    const containerItems = document.getElementById('recibo-items');
    containerItems.innerHTML = '';

    ventaData.detalles.forEach(item => {
        containerItems.innerHTML += `
            <div class="flex justify-between">
                <span>${item.cantidad}x ${item.nombre}</span>
                <span class="font-bold">Bs. ${item.subtotal.toFixed(2)}</span>
            </div>
        `;
    });

    document.getElementById('modal-recibo').classList.remove('hidden');
}

function cerrarModalRecibo() {
    document.getElementById('modal-recibo').classList.add('hidden');
}

function imprimirRecibo() {
    window.print();
}

function cambiarVista(vista) {
    const vPos = document.getElementById('vista-pos');
    const vInv = document.getElementById('vista-inventario');
    const vRep = document.getElementById('vista-reportes');

    if (vPos) vPos.classList.add('hidden');
    if (vInv) vInv.classList.add('hidden');
    if (vRep) vRep.classList.add('hidden');

    if (vista === 'pos' && vPos) {
        vPos.classList.remove('hidden');
    } else if (vista === 'inventario' && vInv) {
        vInv.classList.remove('hidden');
        renderizarTablaInventario(productos);
    } else if (vista === 'reportes' && vRep) {
        vRep.classList.remove('hidden');
        cargarReportes();
    }
}

function renderizarTablaInventario(lista) {
    const tbody = document.getElementById('tabla-inventario');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-gray-400">No hay productos registrados.</td></tr>';
        return;
    }

    lista.forEach(p => {
        const pCompra = p.precio_compra ? p.precio_compra.toFixed(2) : '0.00';
        const pVenta = p.precio_venta ? p.precio_venta.toFixed(2) : '0.00';
        const stockBajo = p.stock_actual <= p.stock_minimo;

        tbody.innerHTML += `
            <tr class="border-b hover:bg-emerald-50 text-sm">
                <td class="p-3 text-gray-600">${p.codigo_barras || '-'}</td>
                <td class="p-3 font-bold flex items-center gap-2">
                    <span>${p.imagen || '🍺'}</span>
                    <span>${p.nombre}</span>
                    ${stockBajo ? `<span class="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-bold">⚠️ Stock Bajo</span>` : ''}
                </td>
                <td class="p-3 text-gray-500">${p.categoria || 'General'}</td>
                <td class="p-3">Bs. ${pCompra}</td>
                <td class="p-3 font-bold text-diony-main">Bs. ${pVenta}</td>
                <td class="p-3 font-bold ${stockBajo ? 'text-red-500' : 'text-gray-700'}">${p.stock_actual} u. (Mín: ${p.stock_minimo})</td>
            </tr>
        `;
    });
}

function mostrarModalAgregar() {
    document.getElementById('modal-producto').classList.remove('hidden');
}

function cerrarModalAgregar() {
    document.getElementById('modal-producto').classList.add('hidden');
    document.getElementById('form-nuevo-producto').reset();
}

async function guardarNuevoProducto(event) {
    event.preventDefault();

    const nuevoProd = {
        nombre: document.getElementById('nuevo-nombre').value,
        categoria: document.getElementById('nuevo-categoria').value,
        codigo_barras: document.getElementById('nuevo-codigo').value,
        precio_compra: parseFloat(document.getElementById('nuevo-pcompra').value),
        precio_venta: parseFloat(document.getElementById('nuevo-pventa').value),
        stock_actual: parseInt(document.getElementById('nuevo-stock').value),
        stock_minimo: parseInt(document.getElementById('nuevo-minimo').value),
        imagen: document.getElementById('nuevo-imagen').value || '🍺'
    };

    try {
        const res = await fetch('/api/productos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(nuevoProd)
        });

        if (res.ok) {
            alert('🎉 ¡Producto registrado exitosamente!');
            cerrarModalAgregar();
            cargarProductos();
        } else {
            const errData = await res.json();
            alert(`❌ Error al guardar: ${errData.error}`);
        }
    } catch (err) {
        console.error('Error de red:', err);
    }
}

function mostrarModalCierre() {
    document.getElementById('modal-cierre').classList.remove('hidden');
}

function cerrarModalCierre() {
    document.getElementById('modal-cierre').classList.add('hidden');
    document.getElementById('form-cierre').reset();
}

async function enviarCierreCaja(event) {
    event.preventDefault();

    const cierreData = {
        vendedor_id: 1,
        efectivo_declarado: parseFloat(document.getElementById('cierre-efectivo').value),
        qr_declarado: parseFloat(document.getElementById('cierre-qr').value)
    };

    try {
        const res = await fetch('/api/cierre-caja', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(cierreData)
        });

        const data = await res.json();
        if (res.ok) {
            alert(`🔒 ${data.message}`);
            cerrarModalCierre();
        } else {
            alert(`❌ Error: ${data.error}`);
        }
    } catch (err) {
        console.error('Error al registrar el cierre de caja:', err);
    }
}

function mostrarModalPerdidas() {
    const select = document.getElementById('perdida-producto-id');
    select.innerHTML = '';

    if (productos.length === 0) {
        select.innerHTML = '<option value="">No hay productos disponibles</option>';
    } else {
        productos.forEach(p => {
            select.innerHTML += `<option value="${p.id}">${p.nombre} (Stock actual: ${p.stock_actual})</option>`;
        });
    }

    document.getElementById('modal-perdidas').classList.remove('hidden');
}

function cerrarModalPerdidas() {
    document.getElementById('modal-perdidas').classList.add('hidden');
    document.getElementById('form-perdida').reset();
}

async function enviarPerdida(event) {
    event.preventDefault();

    const perdidaData = {
        producto_id: parseInt(document.getElementById('perdida-producto-id').value),
        cantidad: parseInt(document.getElementById('perdida-cantidad').value),
        motivo: document.getElementById('perdida-motivo').value
    };

    try {
        const res = await fetch('/api/perdidas', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(perdidaData)
        });

        const data = await res.json();
        if (res.ok) {
            alert(`⚠️ ${data.message}`);
            cerrarModalPerdidas();
            cargarProductos();
        } else {
            alert(`❌ Error: ${data.error}`);
        }
    } catch (err) {
        console.error('Error al registrar la pérdida:', err);
    }
}

function filtrarReporte(tipo) {
    document.getElementById('filtro-fecha-dia').value = '';
    document.getElementById('filtro-fecha-mes').value = '';

    ['hoy', 'ayer', 'todo'].forEach(t => {
        const btn = document.getElementById(`btn-rep-${t}`);
        if (btn) {
            if (t === tipo) {
                btn.className = "px-3 py-1.5 bg-diony-main text-white font-bold rounded-lg text-xs transition";
            } else {
                btn.className = "px-3 py-1.5 bg-gray-200 text-gray-700 font-bold rounded-lg text-xs hover:bg-gray-300 transition";
            }
        }
    });

    const titulosLabels = {
        'hoy': 'Ventas Totales (Hoy)',
        'ayer': 'Ventas Totales (Ayer)',
        'todo': 'Ventas Totales (Histórico)'
    };
    document.getElementById('label-titulo-ventas').innerText = titulosLabels[tipo] || 'Ventas Totales';

    urlReporteActual = `/api/reportes?filtro=${tipo}`;
    cargarReportes();
}

function filtrarPorDiaEspecifico() {
    const fechaVal = document.getElementById('filtro-fecha-dia').value;
    if (!fechaVal) return;

    ['hoy', 'ayer', 'todo'].forEach(t => {
        const btn = document.getElementById(`btn-rep-${t}`);
        if (btn) btn.className = "px-3 py-1.5 bg-gray-200 text-gray-700 font-bold rounded-lg text-xs hover:bg-gray-300 transition";
    });
    document.getElementById('filtro-fecha-mes').value = '';

    document.getElementById('label-titulo-ventas').innerText = `Ventas del Día: ${fechaVal}`;
    urlReporteActual = `/api/reportes?dia=${fechaVal}`;
    cargarReportes();
}

function filtrarPorMesEspecifico() {
    const mesVal = document.getElementById('filtro-fecha-mes').value;
    if (!mesVal) return;

    ['hoy', 'ayer', 'todo'].forEach(t => {
        const btn = document.getElementById(`btn-rep-${t}`);
        if (btn) btn.className = "px-3 py-1.5 bg-gray-200 text-gray-700 font-bold rounded-lg text-xs hover:bg-gray-300 transition";
    });
    document.getElementById('filtro-fecha-dia').value = '';

    document.getElementById('label-titulo-ventas').innerText = `Ventas del Mes: ${mesVal}`;
    urlReporteActual = `/api/reportes?mes=${mesVal}`;
    cargarReportes();
}

async function cargarReportes() {
    try {
        const res = await fetch(urlReporteActual);
        const data = await res.json();

        document.getElementById('reporte-ventas-totales').innerText = `Bs. ${(data.total_ventas || 0).toFixed(2)}`;
        document.getElementById('reporte-efectivo').innerText = `Bs. ${(data.total_efectivo || 0).toFixed(2)}`;
        document.getElementById('reporte-qr').innerText = `Bs. ${(data.total_qr || 0).toFixed(2)}`;
        document.getElementById('reporte-ganancia-neta').innerText = `Bs. ${(data.ganancia_neta || 0).toFixed(2)}`;

        const tbody = document.getElementById('tabla-reporteVentas');
        tbody.innerHTML = '';

        if (!data.historial || data.historial.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-gray-400">No hay ventas registradas en este período.</td></tr>';
            return;
        }

        data.historial.forEach(v => {
            tbody.innerHTML += `
                <tr class="border-b hover:bg-emerald-50 text-sm">
                    <td class="p-3 font-bold">#${v.id}</td>
                    <td class="p-3 text-gray-600">${new Date(v.fecha).toLocaleString()}</td>
                    <td class="p-3 font-semibold uppercase">${v.metodo_pago === 'efectivo' ? '💵 Efectivo' : '📲 QR'}</td>
                    <td class="p-3 font-bold text-diony-main">Bs. ${v.total.toFixed(2)}</td>
                </tr>
            `;
        });
    } catch (err) {
        console.error('Error al cargar reportes:', err);
    }
}

function imprimirReportePDF() {
    window.print();
}