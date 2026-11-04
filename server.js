const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000; // <--- Cambio aplicado aquí

app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend')));

// Conexión a SQLite
const db = new sqlite3.Database('./diony.db', (err) => {
    if (err) console.error('Error al conectar con SQLite:', err.message);
    else console.log('Conectado a la base de datos SQLite (diony.db)');
});

// Inicializar Tablas
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        categoria TEXT,
        codigo_barras TEXT,
        precio_compra REAL NOT NULL,
        precio_venta REAL NOT NULL,
        stock_actual INTEGER NOT NULL,
        stock_minimo INTEGER DEFAULT 5,
        imagen TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        total REAL NOT NULL,
        metodo_pago TEXT NOT NULL,
        vendedor_id INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS detalle_ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venta_id INTEGER,
        producto_id INTEGER,
        cantidad INTEGER NOT NULL,
        subtotal REAL NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS perdidas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER,
        cantidad INTEGER NOT NULL,
        motivo TEXT,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS cierres_caja (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendedor_id INTEGER,
        efectivo_declarado REAL,
        qr_declarado REAL,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Obtener productos
app.get('/api/productos', (req, res) => {
    db.all(`SELECT * FROM productos`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Registrar producto
app.post('/api/productos', (req, res) => {
    const { nombre, categoria, codigo_barras, precio_compra, precio_venta, stock_actual, stock_minimo, imagen } = req.body;
    const query = `INSERT INTO productos (nombre, categoria, codigo_barras, precio_compra, precio_venta, stock_actual, stock_minimo, imagen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    db.run(query, [nombre, categoria, codigo_barras, precio_compra, precio_venta, stock_actual, stock_minimo, imagen || '🍺'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});
// Registrar venta normal con la fecha actual del sistema (CON CONTROL DE STOCK)
app.post('/api/ventas', (req, res) => {
    const { total, metodo_pago, vendedor_id, detalles } = req.body;

    db.serialize(() => {
        // 1. Iniciamos una transacción (si algo falla, se deshace todo)
        db.run("BEGIN TRANSACTION");

        db.run(`INSERT INTO ventas (total, metodo_pago, vendedor_id) VALUES (?, ?, ?)`, [total, metodo_pago, vendedor_id || 1], function(err) {
            if (err) {
                db.run("ROLLBACK");
                return res.status(500).json({ error: err.message });
            }
            const ventaId = this.lastID;
            let errorStock = false;

            const stmtDetalle = db.prepare(`INSERT INTO detalle_ventas (venta_id, producto_id, cantidad, subtotal) VALUES (?, ?, ?, ?)`);
            
            // 2. Agregamos la condición "AND stock_actual >= ?" para evitar stock negativo
            const stmtStock = db.prepare(`UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ? AND stock_actual >= ?`);

            detalles.forEach(item => {
                // Insertamos el detalle de la venta
                stmtDetalle.run(ventaId, item.id, item.cantidad, item.subtotal);
                
                // Intentamos restar el stock de forma segura
                stmtStock.run(item.cantidad, item.id, item.cantidad, function(err) {
                    // Si 'this.changes' es 0, significa que el UPDATE no afectó a ninguna fila (no había stock suficiente)
                    if (this.changes === 0) {
                        errorStock = true; 
                    }
                });
            });

            stmtDetalle.finalize();
            
            // 3. Cerramos el statement de stock y verificamos si hubo errores
            stmtStock.finalize(() => {
                if (errorStock) {
                    db.run("ROLLBACK"); // Cancelamos toda la venta
                    return res.status(400).json({ success: false, error: 'Stock insuficiente para uno o más productos. Venta cancelada.' });
                } else {
                    db.run("COMMIT"); // Guardamos los cambios definitivamente
                    return res.json({ success: true, ventaId, message: 'Venta registrada con éxito' });
                }
            });
        });
    });
});


// Registrar pérdida
app.post('/api/perdidas', (req, res) => {
    const { producto_id, cantidad, motivo } = req.body;
    db.serialize(() => {
        db.run(`INSERT INTO perdidas (producto_id, cantidad, motivo) VALUES (?, ?, ?)`, [producto_id, cantidad, motivo]);
        db.run(`UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?`, [cantidad, producto_id], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: 'Pérdida registrada y stock actualizado correctamente.' });
        });
    });
});

// Cierre de caja
app.post('/api/cierre-caja', (req, res) => {
    const { vendedor_id, efectivo_declarado, qr_declarado } = req.body;
    db.run(`INSERT INTO cierres_caja (vendedor_id, efectivo_declarado, qr_declarado) VALUES (?, ?, ?)`, 
        [vendedor_id || 1, efectivo_declarado, qr_declarado], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Cierre de caja registrado exitosamente.' });
    });
});

// Reportes con soporte para Día exacto, Mes exacto o Filtros rápidos (SEGURO)
app.get('/api/reportes', (req, res) => {
    const { filtro, dia, mes } = req.query;
    
    let condFecha = '';
    let params = []; // Arreglo para guardar los parámetros de forma segura

    if (dia) {
        condFecha = `WHERE date(v.fecha, 'localtime') = ?`;
        params.push(dia);
    } else if (mes) {
        condFecha = `WHERE strftime('%Y-%m', v.fecha, 'localtime') = ?`;
        params.push(mes);
    } else if (filtro === 'ayer') {
        condFecha = `WHERE date(v.fecha, 'localtime') = date('now', 'localtime', '-1 day')`;
    } else if (filtro === 'todo') {
        condFecha = '';
    } else {
        condFecha = `WHERE date(v.fecha, 'localtime') = date('now', 'localtime')`;
    }

    const queryVentas = `
        SELECT 
            SUM(v.total) as total_ventas,
            SUM(CASE WHEN v.metodo_pago = 'efectivo' THEN v.total ELSE 0 END) as total_efectivo,
            SUM(CASE WHEN v.metodo_pago = 'qr' THEN v.total ELSE 0 END) as total_qr
        FROM ventas v
        ${condFecha}
    `;

    const queryGanancias = `
        SELECT SUM((p.precio_venta - p.precio_compra) * dv.cantidad) as ganancia_neta
        FROM detalle_ventas dv
        JOIN ventas v ON dv.venta_id = v.id
        JOIN productos p ON dv.producto_id = p.id
        ${condFecha}
    `;

    const queryHistorial = `
        SELECT v.id, v.fecha, v.total, v.metodo_pago 
        FROM ventas v
        ${condFecha}
        ORDER BY v.fecha DESC
    `;

    // IMPORTANTE: Aquí cambiamos el [] por "params" en las tres consultas
    db.get(queryVentas, params, (err, resVentas) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.get(queryGanancias, params, (err, resGanancias) => {
            if (err) return res.status(500).json({ error: err.message });

            db.all(queryHistorial, params, (err, resHistorial) => {
                if (err) return res.status(500).json({ error: err.message });

                res.json({
                    total_ventas: resVentas.total_ventas || 0,
                    total_efectivo: resVentas.total_efectivo || 0,
                    total_qr: resVentas.total_qr || 0,
                    ganancia_neta: resGanancias.ganancia_neta || 0,
                    historial: resHistorial || []
                });
            });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Servidor de Diony corriendo en http://localhost:${PORT}`);
});