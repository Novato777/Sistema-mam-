const { dbType, run, get, query } = require('../config/db');
const { getTodayString } = require('../utils/date');

const isPg = dbType === 'pg';
const pkType = isPg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
const numType = isPg ? 'DECIMAL(12,2)' : 'REAL';
// Fecha del día (YYYY-MM-DD, hora de Colombia) calculada por la base en cada INSERT.
// Antes se usaba DEFAULT '<fecha de creación de la tabla>', que dejaba la fecha congelada.
const nowDateDefault = isPg
  ? "(to_char(now() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD'))"
  : "(date('now', '-5 hours'))";

// Helper idempotente para agregar columnas a tablas existentes sin destruir datos
const ensureColumn = async (table, column, definition) => {
  try {
    if (isPg) {
      await run(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition}`);
    } else {
      const cols = await query(`PRAGMA table_info(${table})`);
      const exists = cols.some((c) => c.name.toLowerCase() === column.toLowerCase());
      if (!exists) {
        await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    }
  } catch (err) {
    // No detener el arranque por una columna, pero dejar constancia del motivo.
    console.warn(`[db] No se pudo asegurar la columna ${table}.${column}: ${err.message}`);
  }
};

// Semilla idempotente de configuración base por hotel (Impuestos, Métodos de Pago, Departamentos y Tipo de Habitación)
const ensureHotelDefaults = async (hotelId) => {
  // 1. Impuestos por defecto
  const taxCount = await get('SELECT COUNT(*) as c FROM hotel_taxes WHERE hotel_id = ?', [hotelId]);
  if (!taxCount || Number(taxCount.c) === 0) {
    await run(
      `INSERT INTO hotel_taxes (hotel_id, name, code, percentage, is_inclusive, applies_to, active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [hotelId, 'Exento / Sin IVA (0%)', 'EXENTO', 0, 1, 'ALL']
    );
    await run(
      `INSERT INTO hotel_taxes (hotel_id, name, code, percentage, is_inclusive, applies_to, active)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [hotelId, 'IVA Alojamiento (19%)', 'IVA19', 19, 0, 'LODGING']
    );
    await run(
      `INSERT INTO hotel_taxes (hotel_id, name, code, percentage, is_inclusive, applies_to, active)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [hotelId, 'Impoconsumo Restaurante (8%)', 'INC8', 8, 0, 'RESTAURANT']
    );
  }

  // 2. Métodos de pago por defecto
  const pmCount = await get('SELECT COUNT(*) as c FROM hotel_payment_methods WHERE hotel_id = ?', [hotelId]);
  if (!pmCount || Number(pmCount.c) === 0) {
    const defaultMethods = [
      ['Efectivo', 'EFECTIVO', 'CASH', 0],
      ['Transferencia Bancaria', 'TRANSFERENCIA', 'BANK_TRANSFER', 1],
      ['Nequi', 'NEQUI', 'DIGITAL_WALLET', 1],
      ['Daviplata', 'DAVIPLATA', 'DIGITAL_WALLET', 1],
      ['Tarjeta Débito / Crédito', 'TARJETA', 'CARD', 1]
    ];
    for (const [name, code, type, reqRef] of defaultMethods) {
      await run(
        `INSERT INTO hotel_payment_methods (hotel_id, name, code, type, requires_reference, active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [hotelId, name, code, type, reqRef]
      );
    }
  }

  // 3. Departamentos operativos por defecto
  const deptCount = await get('SELECT COUNT(*) as c FROM hotel_departments WHERE hotel_id = ?', [hotelId]);
  if (!deptCount || Number(deptCount.c) === 0) {
    const defaultDepts = [
      ['Recepción y Alojamiento', 'RECEPCION', 'Gestión de reservas, check-in, check-out y atención al huésped'],
      ['Restaurante y Bebidas', 'RESTAURANTE', 'Servicio de comedor, cafetería, room service y minibar'],
      ['Limpieza y Housekeeping', 'LIMPIEZA', 'Aseo de habitaciones, áreas comunes y lencería'],
      ['Lavandería', 'LAVANDERIA', 'Lavado y planchado interno y servicio a huéspedes'],
      ['Mantenimiento', 'MANTENIMIENTO', 'Mantenimiento preventivo y correctivo de instalaciones'],
      ['Administración y Contabilidad', 'ADMINISTRACION', 'Gestión financiera, compras, caja general y contabilidad']
    ];
    for (const [name, code, description] of defaultDepts) {
      await run(
        `INSERT INTO hotel_departments (hotel_id, name, code, description, active)
         VALUES (?, ?, ?, ?, 1)`,
        [hotelId, name, code, description]
      );
    }
  }

  // 4. Tipo de habitación por defecto si no tiene ninguno
  const rtCount = await get('SELECT COUNT(*) as c FROM room_types WHERE hotel_id = ?', [hotelId]);
  if (!rtCount || Number(rtCount.c) === 0) {
    await run(
      `INSERT INTO room_types (hotel_id, name, code, base_price, capacity, bed_config, amenities, description, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        hotelId,
        'Habitación Estándar',
        'STD',
        25000,
        2,
        '1 Cama Doble',
        'Baño privado, TV, Wi-Fi, Ventilador/AC',
        'Habitación confortable para estancia individual o doble'
      ]
    );
  }

  // 5. Mesas iniciales de Restaurante / Cafetería por defecto (Bloque 9)
  const tableCount = await get('SELECT COUNT(*) as c FROM restaurant_tables WHERE hotel_id = ?', [hotelId]);
  if (!tableCount || Number(tableCount.c) === 0) {
    const defaultTables = [
      ['Mesa 1', 'Comedor Principal', 4],
      ['Mesa 2', 'Comedor Principal', 4],
      ['Mesa 3', 'Comedor Principal', 2],
      ['Mesa 4', 'Comedor Principal', 6],
      ['Terraza 1', 'Terraza', 4],
      ['Barra 1', 'Cafetería / Barra', 2]
    ];
    for (const [number, zone, capacity] of defaultTables) {
      await run(
        `INSERT INTO restaurant_tables (hotel_id, number, zone, capacity, status, active)
         VALUES (?, ?, ?, ?, 'LIBRE', 1)`,
        [hotelId, number, zone, capacity]
      );
    }
  }

  // 6. Catálogo inicial de Restaurante, Cafetería, Room Service, Minibar, Lavandería y Servicios (Bloque 9)
  const catalogCount = await get('SELECT COUNT(*) as c FROM service_catalog WHERE hotel_id = ?', [hotelId]);
  if (!catalogCount || Number(catalogCount.c) === 0) {
    const todayStr = getTodayString();
    const defaultCatalog = [
      ['RESTAURANTE', 'Platos Fuertes', 'REST-01', 'Almuerzo Ejecutivo del Día', 'Sopa, principio, proteína, arroz, ensalada y jugo natural', 14000, 6500, 'PORCION', 10],
      ['RESTAURANTE', 'Desayunos', 'REST-02', 'Desayuno Americano / Huésped', 'Huevos al gusto, pan o arepa, queso, bebida caliente y jugo', 11000, 4500, 'PORCION', 10],
      ['RESTAURANTE', 'Sopas y Caldos', 'REST-03', 'Sopa del Día', 'Porción individual de sopa casera caliente', 7000, 2800, 'PORCION', 5],
      ['RESTAURANTE', 'Sopas y Caldos', 'REST-04', 'Caldo de Costilla', 'Caldo tradicional con costilla de res, papa y cilantro', 10000, 4500, 'PORCION', 8],
      ['RESTAURANTE', 'Cenas', 'REST-05', 'Cena Ligera / Asado', 'Pechuga o carne a la plancha con acompañamiento y bebida', 16000, 7500, 'PORCION', 15],
      ['CAFETERIA', 'Bebidas Calientes', 'CAF-01', 'Tinto / Café Americano', 'Taza de café colombiano recién colado', 2500, 700, 'UND', 3],
      ['CAFETERIA', 'Bebidas Calientes', 'CAF-02', 'Café con Leche / Capuccino', 'Café espresso con leche vaporizada', 4500, 1400, 'UND', 4],
      ['CAFETERIA', 'Panadería', 'CAF-03', 'Combo Café + Almojábana / Pan', 'Bebida caliente acompañada de horneado del día', 6000, 2200, 'PORCION', 3],
      ['ROOM_SERVICE', 'Room Service', 'RS-01', 'Desayuno a la Habitación', 'Servicio completo llevado directamente a la habitación', 13500, 5000, 'SERVICIO', 15],
      ['ROOM_SERVICE', 'Room Service', 'RS-02', 'Combo Hamburguesa + Gaseosa', 'Hamburguesa artesanal con papas y gaseosa en habitación', 20000, 9000, 'SERVICIO', 18],
      ['MINIBAR', 'Bebidas Frías', 'MINI-01', 'Agua Embotellada 600 ml', 'Botella de agua purificada fría', 3500, 1200, 'UND', 1],
      ['MINIBAR', 'Bebidas Frías', 'MINI-02', 'Gaseosa Personal 400 ml', 'Gaseosa surtida fría de minibar', 4500, 2000, 'UND', 1],
      ['MINIBAR', 'Bebidas', 'MINI-03', 'Cerveza Nacional Lata/Botella', 'Cerveza fría de minibar', 6000, 2800, 'UND', 1],
      ['MINIBAR', 'Snacks', 'MINI-04', 'Snacks / Papas / Maní', 'Paquete individual de pasabocas de minibar', 4000, 1800, 'UND', 1],
      ['LAVANDERIA', 'Lavado y Planchado', 'LAV-01', 'Lavado y Doblado por Carga / Kg', 'Servicio estándar de lavado y secado de prendas', 15000, 4000, 'KG', 120],
      ['LAVANDERIA', 'Planchado', 'LAV-02', 'Planchado de Camisa / Pantalón', 'Planchado express por prenda', 5000, 1200, 'UND', 30],
      ['SERVICIOS_ADICIONALES', 'Estancia y Parqueo', 'SRV-01', 'Parqueadero Nocturno / Día', 'Cupo de parqueadero vigilado por noche/día', 10000, 0, 'SERVICIO', 1],
      ['SERVICIOS_ADICIONALES', 'Estancia', 'SRV-02', 'Late Check-out (Extensión de Salida)', 'Extensión de salida hasta las 5:00 PM sujeta a disponibilidad', 20000, 0, 'HORA', 5]
    ];
    for (const [dept, cat, code, name, desc, price, cost, unit, prep] of defaultCatalog) {
      await run(
        `INSERT INTO service_catalog (hotel_id, department, category, code, name, description, price, cost, unit, prep_time_minutes, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [hotelId, dept, cat, code, name, desc, price, cost, unit, prep, todayStr]
      );
    }
  }

  // 7. Proveedores iniciales por defecto (Bloque 10)
  const supplierCount = await get('SELECT COUNT(*) as c FROM suppliers WHERE hotel_id = ?', [hotelId]);
  if (!supplierCount || Number(supplierCount.c) === 0) {
    const todayStr = getTodayString();
    const defaultSuppliers = [
      ['Distribuidora Alimentos del Centro', '900456123-1', 'Carlos Mendoza', '3104458899', 'pedidos@alimentoscentro.com', 'Restaurante y Víveres', 'Contado / 15 días'],
      ['Bebidas y Minibar Express', '900789456-2', 'Laura Gómez', '3157891122', 'ventas@minibarexpress.com', 'Bebidas y Snacks', 'Contado'],
      ['Insumos Hoteleros & Lencería S.A.S.', '901234567-8', 'Andrés Rojas', '3209984455', 'comercial@insumoshoteleros.com', 'Aseo, Amenidades y Lencería', '30 días']
    ];
    for (const [name, taxId, contact, phone, email, cat, terms] of defaultSuppliers) {
      await run(
        `INSERT INTO suppliers (hotel_id, name, tax_id, contact_name, phone, email, category, payment_terms, active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [hotelId, name, taxId, contact, phone, email, cat, terms, todayStr]
      );
    }
  }

  // 8. Inventario Hotelero Integral inicial por defecto (Bloque 10)
  const invCount = await get('SELECT COUNT(*) as c FROM inventory_products WHERE hotel_id = ?', [hotelId]);
  if (!invCount || Number(invCount.c) === 0) {
    const todayStr = getTodayString();
    const nowIso = new Date().toISOString();
    const firstSup = await get('SELECT id FROM suppliers WHERE hotel_id = ? ORDER BY id ASC LIMIT 1', [hotelId]);
    const defaultSupId = firstSup ? firstSup.id : null;

    const defaultInventory = [
      ['INV-REST-01', 'RESTAURANTE', 'Carnes y Proteínas', 'Pechuga de Pollo / Carne Res (Porción)', 'PORCION', 5200, 0, 30, 10, 15, 'Cocina / Restaurante'],
      ['INV-REST-02', 'RESTAURANTE', 'Granos y Acompañantes', 'Arroz Blanco Premium', 'KG', 4200, 0, 25, 8, 12, 'Cocina / Restaurante'],
      ['INV-REST-03', 'RESTAURANTE', 'Cafetería', 'Café Molido Especial Hotel', 'KG', 32000, 0, 5, 2, 3, 'Cocina / Restaurante'],
      ['INV-MINI-01', 'MINIBAR', 'Bebidas Frías', 'Agua Embotellada 600 ml', 'UND', 1200, 3500, 48, 12, 20, 'Bar / Minibar'],
      ['INV-MINI-02', 'MINIBAR', 'Bebidas Frías', 'Gaseosa Personal 400 ml', 'UND', 2000, 4500, 36, 12, 18, 'Bar / Minibar'],
      ['INV-MINI-03', 'MINIBAR', 'Bebidas', 'Cerveza Nacional Lata/Botella', 'UND', 2800, 6000, 24, 10, 15, 'Bar / Minibar'],
      ['INV-MINI-04', 'MINIBAR', 'Snacks', 'Paquete Snacks / Papas / Maní', 'UND', 1800, 4000, 20, 8, 12, 'Bar / Minibar'],
      ['INV-AMEN-01', 'AMENIDADES', 'Baño Huésped', 'Kit Amenidades (Jabón + Shampoo)', 'KIT', 1600, 0, 80, 25, 40, 'Cuarto de Lencería / Aseo'],
      ['INV-AMEN-02', 'AMENIDADES', 'Papelería / Baño', 'Papel Higiénico Institucional', 'ROLLO', 1400, 0, 60, 20, 30, 'Cuarto de Lencería / Aseo'],
      ['INV-ASEO-01', 'ASEO', 'Desinfección', 'Detergente / Desinfectante Multiusos', 'LITRO', 7500, 0, 18, 5, 8, 'Cuarto de Lencería / Aseo'],
      ['INV-ASEO-02', 'ASEO', 'Lavandería', 'Suavizante y Detergente Ropa', 'LITRO', 9800, 0, 15, 5, 8, 'Cuarto de Lencería / Aseo'],
      ['INV-LENC-01', 'LENCERIA', 'Ropa de Cama', 'Juego Sábanas Cama Doble Blanco', 'JUEGO', 65000, 0, 20, 6, 10, 'Cuarto de Lencería / Aseo'],
      ['INV-LENC-02', 'LENCERIA', 'Toallas', 'Toalla Cuerpo Algodón 500g', 'UND', 22000, 0, 30, 10, 15, 'Cuarto de Lencería / Aseo'],
      ['INV-MANT-01', 'MANTENIMIENTO', 'Eléctricos', 'Bombillo LED 12W Luz Cálida', 'UND', 6500, 0, 15, 5, 8, 'Mantenimiento']
    ];

    for (const [sku, dept, cat, name, unit, cost, price, stock, minStock, reorderPt, loc] of defaultInventory) {
      const ins = await run(
        `INSERT INTO inventory_products (
          hotel_id, sku, department, category, name, unit, cost, last_cost, price, stock, min_stock, reorder_point, location, preferred_supplier_id, active, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [hotelId, sku, dept, cat, name, unit, cost, cost, price, stock, minStock, reorderPt, loc, defaultSupId, todayStr]
      );

      await run(
        `INSERT INTO inventory_movements (
          hotel_id, product_id, movement_type, direction, quantity, unit_cost, total_cost,
          previous_stock, new_stock, department, source_location, target_location,
          reference_type, reference_code, notes, movement_date, created_at
        ) VALUES (?, ?, 'ENTRADA_AJUSTE', 'IN', ?, ?, ?, 0, ?, ?, 'Inventario Inicial', ?, 'MANUAL', 'INIT-INV', 'Carga inicial de inventario hotelero', ?, ?)`,
        [hotelId, ins.id, stock, cost, stock * cost, stock, dept, loc, todayStr, nowIso]
      );
    }
  }

  // 9. Recetas / Fichas Técnicas iniciales por defecto (Bloque 10)
  const recipeCount = await get('SELECT COUNT(*) as c FROM service_recipes WHERE hotel_id = ?', [hotelId]);
  if (!recipeCount || Number(recipeCount.c) === 0) {
    const todayStr = getTodayString();
    const mappings = [
      ['MINI-01', 'INV-MINI-01', 1, 'UND'],
      ['MINI-02', 'INV-MINI-02', 1, 'UND'],
      ['MINI-03', 'INV-MINI-03', 1, 'UND'],
      ['MINI-04', 'INV-MINI-04', 1, 'UND'],
      ['REST-01', 'INV-REST-01', 1, 'PORCION'],
      ['REST-01', 'INV-REST-02', 0.15, 'KG'],
      ['CAF-01', 'INV-REST-03', 0.02, 'KG'],
      ['LAV-01', 'INV-ASEO-02', 0.15, 'LITRO']
    ];
    for (const [catCode, invSku, qty, unit] of mappings) {
      const catRow = await get('SELECT id FROM service_catalog WHERE hotel_id = ? AND code = ? LIMIT 1', [hotelId, catCode]);
      const invRow = await get('SELECT id FROM inventory_products WHERE hotel_id = ? AND sku = ? LIMIT 1', [hotelId, invSku]);
      if (catRow && invRow) {
        await run(
          `INSERT INTO service_recipes (hotel_id, catalog_id, inventory_product_id, quantity, unit, notes, created_at)
           VALUES (?, ?, ?, ?, ?, 'Ficha técnica base', ?)`,
          [hotelId, catRow.id, invRow.id, qty, unit, todayStr]
        );
      }
    }
  }

  // 10. Plan Único de Cuentas (PUC Hotelero) base por defecto (Bloque 11)
  const pucCount = await get('SELECT COUNT(*) as c FROM accounting_accounts WHERE hotel_id = ?', [hotelId]);
  if (!pucCount || Number(pucCount.c) === 0) {
    const defaultPuc = [
      // Clases y Grupos agrupadores (is_detail = 0)
      ['1', 'ACTIVO', 'ACTIVO', 'DEBITO', 1, '', 0],
      ['11', 'DISPONIBLE', 'ACTIVO', 'DEBITO', 2, '1', 0],
      ['1105', 'Caja', 'ACTIVO', 'DEBITO', 3, '11', 0],
      ['110505', 'Caja General Recepción', 'ACTIVO', 'DEBITO', 4, '1105', 1],
      ['1110', 'Bancos y Cuentas Digitales', 'ACTIVO', 'DEBITO', 3, '11', 0],
      ['111005', 'Bancos Nacionales (Transferencias / Datafono)', 'ACTIVO', 'DEBITO', 4, '1110', 1],
      ['13', 'DEUDORES', 'ACTIVO', 'DEBITO', 2, '1', 0],
      ['1305', 'Clientes y Huéspedes', 'ACTIVO', 'DEBITO', 3, '13', 0],
      ['130505', 'Cuentas por Cobrar Huéspedes y Agencias', 'ACTIVO', 'DEBITO', 4, '1305', 1],
      ['14', 'INVENTARIOS', 'ACTIVO', 'DEBITO', 2, '1', 0],
      ['1435', 'Mercancías e Insumos Hoteleros', 'ACTIVO', 'DEBITO', 3, '14', 0],
      ['143505', 'Inventario General (Alimentos, Bebidas y Aseo)', 'ACTIVO', 'DEBITO', 4, '1435', 1],

      ['2', 'PASIVO', 'PASIVO', 'CREDITO', 1, '', 0],
      ['22', 'PROVEEDORES', 'PASIVO', 'CREDITO', 2, '2', 0],
      ['2205', 'Proveedores Nacionales', 'PASIVO', 'CREDITO', 3, '22', 0],
      ['220505', 'Proveedores Nacionales por Pagar (CXP)', 'PASIVO', 'CREDITO', 4, '2205', 1],
      ['23', 'CUENTAS POR PAGAR', 'PASIVO', 'CREDITO', 2, '2', 0],
      ['2335', 'Costos y Gastos por Pagar', 'PASIVO', 'CREDITO', 3, '23', 0],
      ['233595', 'Otros Costos y Gastos por Pagar', 'PASIVO', 'CREDITO', 4, '2335', 1],
      ['24', 'IMPUESTOS, GRAVAMENES Y TASAS', 'PASIVO', 'CREDITO', 2, '2', 0],
      ['2408', 'Impuesto sobre las Ventas por Pagar', 'PASIVO', 'CREDITO', 3, '24', 0],
      ['240805', 'IVA / Impoconsumo Generado por Pagar', 'PASIVO', 'CREDITO', 4, '2408', 1],
      ['28', 'OTROS PASIVOS', 'PASIVO', 'CREDITO', 2, '2', 0],
      ['2805', 'Anticipos y Avances Recibidos', 'PASIVO', 'CREDITO', 3, '28', 0],
      ['280505', 'Anticipos de Reservas de Huéspedes', 'PASIVO', 'CREDITO', 4, '2805', 1],

      ['3', 'PATRIMONIO', 'PATRIMONIO', 'CREDITO', 1, '', 0],
      ['31', 'CAPITAL SOCIAL', 'PATRIMONIO', 'CREDITO', 2, '3', 0],
      ['3115', 'Aportes Sociales', 'PATRIMONIO', 'CREDITO', 3, '31', 0],
      ['311505', 'Capital Social / Aportes Propietario', 'PATRIMONIO', 'CREDITO', 4, '3115', 1],
      ['36', 'RESULTADOS DEL EJERCICIO', 'PATRIMONIO', 'CREDITO', 2, '3', 0],
      ['3605', 'Utilidad del Ejercicio', 'PATRIMONIO', 'CREDITO', 3, '36', 0],
      ['360505', 'Utilidad / Pérdida Acumulada', 'PATRIMONIO', 'CREDITO', 4, '3605', 1],

      ['4', 'INGRESOS', 'INGRESOS', 'CREDITO', 1, '', 0],
      ['41', 'OPERACIONALES', 'INGRESOS', 'CREDITO', 2, '4', 0],
      ['4140', 'Hoteles y Restaurantes', 'INGRESOS', 'CREDITO', 3, '41', 0],
      ['414005', 'Ingresos por Alojamiento y Hospedaje', 'INGRESOS', 'CREDITO', 4, '4140', 1],
      ['414010', 'Ingresos Restaurante y Cafetería', 'INGRESOS', 'CREDITO', 4, '4140', 1],
      ['414015', 'Ingresos Room Service, Minibar y Lavandería', 'INGRESOS', 'CREDITO', 4, '4140', 1],
      ['414020', 'Otros Ingresos y Servicios Hoteleros', 'INGRESOS', 'CREDITO', 4, '4140', 1],

      ['5', 'GASTOS', 'GASTOS', 'DEBITO', 1, '', 0],
      ['51', 'OPERACIONALES DE ADMINISTRACIÓN', 'GASTOS', 'DEBITO', 2, '5', 0],
      ['5105', 'Gastos de Personal', 'GASTOS', 'DEBITO', 3, '51', 0],
      ['510506', 'Sueldos, Turnos y Honorarios Personal', 'GASTOS', 'DEBITO', 4, '5105', 1],
      ['5135', 'Servicios Públicos', 'GASTOS', 'DEBITO', 3, '51', 0],
      ['513530', 'Energía, Acueducto, Gas e Internet', 'GASTOS', 'DEBITO', 4, '5135', 1],
      ['5145', 'Mantenimiento y Reparaciones', 'GASTOS', 'DEBITO', 3, '51', 0],
      ['514510', 'Mantenimiento Habitaciones y Locativo', 'GASTOS', 'DEBITO', 4, '5145', 1],
      ['5195', 'Gastos Diversos', 'GASTOS', 'DEBITO', 3, '51', 0],
      ['519595', 'Gastos Operativos y Suministros Generales', 'GASTOS', 'DEBITO', 4, '5195', 1],

      ['6', 'COSTOS DE VENTAS', 'COSTOS', 'DEBITO', 1, '', 0],
      ['61', 'COSTO DE VENTAS Y PRESTACIÓN DE SERVICIOS', 'COSTOS', 'DEBITO', 2, '6', 0],
      ['6140', 'Costo Hoteles y Restaurantes', 'COSTOS', 'DEBITO', 3, '61', 0],
      ['614005', 'Costo de Alimentos, Bebidas e Insumos Vendidos', 'COSTOS', 'DEBITO', 4, '6140', 1]
    ];
    for (const [code, name, cls, nature, level, parentCode, isDetail] of defaultPuc) {
      await run(
        `INSERT INTO accounting_accounts (hotel_id, code, name, account_class, nature, level, parent_code, is_detail, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [hotelId, code, name, cls, nature, level, parentCode, isDetail]
      );
    }
  }

  // 11. Reglas de Contabilización Automática por defecto (Bloque 11)
  const ruleCount = await get('SELECT COUNT(*) as c FROM accounting_rules WHERE hotel_id = ?', [hotelId]);
  if (!ruleCount || Number(ruleCount.c) === 0) {
    const defaultRules = [
      ['HOSPEDAJE_CARGO', 'Cargo de Alojamiento en Folio', 'Reconocimiento de ingreso por hospedaje contra CXC huésped', '130505', '414005'],
      ['HOSPEDAJE_PAGO_EFECTIVO', 'Pago de Folio en Efectivo', 'Ingreso a Caja General contra abono de CXC huésped', '110505', '130505'],
      ['HOSPEDAJE_PAGO_BANCO', 'Pago de Folio por Transferencia/Tarjeta', 'Ingreso a Bancos contra abono de CXC huésped', '111005', '130505'],
      ['ANTICIPO_RESERVA', 'Anticipo de Reserva Recibido', 'Ingreso a Caja/Bancos contra pasivo por anticipos de clientes', '110505', '280505'],
      ['POS_RESTAURANTE_CAJA', 'Venta Directa Restaurante / Cafetería', 'Ingreso directo en Caja por ventas de restaurante y cafetería', '110505', '414010'],
      ['POS_RESTAURANTE_BANCO', 'Venta Restaurante por Transferencia/Tarjeta', 'Ingreso a Bancos por ventas de restaurante y cafetería', '111005', '414010'],
      ['POS_SERVICIOS_CAJA', 'Venta Directa Minibar / Lavandería / Servicios', 'Ingreso en Caja por servicios complementarios del hotel', '110505', '414015'],
      ['POS_CARGO_FOLIO', 'Cargo POS / Servicios a Habitación', 'Cargo a CXC huésped por consumos de restaurante/minibar/servicios', '130505', '414015'],
      ['COMPRA_INVENTARIO_CONTADO', 'Compra de Inventario de Contado', 'Entrada a Inventario contra salida de Caja General', '143505', '110505'],
      ['COMPRA_INVENTARIO_CREDITO', 'Compra de Inventario a Proveedor (CXP)', 'Entrada a Inventario contra Cuentas por Pagar Proveedores', '143505', '220505'],
      ['GASTO_CAJA', 'Egreso / Gasto Operativo en Caja', 'Reconocimiento de gasto operativo contra salida de Caja', '519595', '110505'],
      ['CXC_ALTA', 'Registro CXC Corporativa / Agencia', 'Cuenta por cobrar a agencia/empresa contra otros ingresos', '130505', '414020'],
      ['CXP_ALTA', 'Registro CXP Proveedor / Servicio', 'Gasto operativo contra cuenta por pagar a proveedor', '519595', '220505'],
      ['CXP_PAGO_CAJA', 'Pago de CXP desde Caja', 'Cancelación de cuenta por pagar proveedor contra Caja', '220505', '110505']
    ];
    for (const [evCode, evName, desc, debCode, credCode] of defaultRules) {
      await run(
        `INSERT INTO accounting_rules (hotel_id, event_code, event_name, description, debit_account_code, credit_account_code, active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [hotelId, evCode, evName, desc, debCode, credCode]
      );
    }
    // 12. Plantillas de Mensajería para Huéspedes por defecto (Bloque 14)
    const tplCount = await get('SELECT COUNT(*) as c FROM message_templates WHERE hotel_id = ?', [hotelId]);
    if (!tplCount || Number(tplCount.c) === 0) {
      const nowIso = new Date().toISOString();
      const defaultTemplates = [
        [
          'CONFIRMACION_RESERVA',
          'WHATSAPP',
          'Confirmación de Reserva',
          '¡Hola {{guest_name}}! Confirmamos tu reserva {{reservation_code}} en {{hotel_name}} para el check-in el {{check_in_date}} en la habitación {{room_number}}. Saldo pendiente: ${{balance}} COP. ¡Te esperamos!',
          JSON.stringify(['guest_name', 'reservation_code', 'hotel_name', 'check_in_date', 'room_number', 'balance'])
        ],
        [
          'CONFIRMACION_RESERVA',
          'EMAIL',
          'Confirmación de Reserva en {{hotel_name}}',
          'Estimado(a) {{guest_name}},\n\nNos complace confirmar su reserva #{{reservation_code}} en {{hotel_name}}.\n\nDetalles:\n- Check-in: {{check_in_date}} (a partir de las {{check_in_time}})\n- Check-out: {{check_out_date}}\n- Habitación: {{room_number}}\n- Total reserva: ${{total}} COP\n- Saldo pendiente: ${{balance}} COP\n\nDirección: {{hotel_address}}\nTeléfono: {{hotel_phone}}\n\n¡Gracias por elegirnos!',
          JSON.stringify(['guest_name', 'reservation_code', 'hotel_name', 'check_in_date', 'check_in_time', 'check_out_date', 'room_number', 'total', 'balance', 'hotel_address', 'hotel_phone'])
        ],
        [
          'RECORDATORIO_CHECKIN',
          'WHATSAPP',
          'Recordatorio de Check-in Hoy',
          '¡Buen día {{guest_name}}! Te recordamos que hoy es tu fecha de llegada a {{hotel_name}}. Tu habitación {{room_number}} estará lista a partir de las {{check_in_time}}. Contáctanos si tienes algún requerimiento especial al {{hotel_phone}}.',
          JSON.stringify(['guest_name', 'hotel_name', 'room_number', 'check_in_time', 'hotel_phone'])
        ],
        [
          'AVISO_CHECKOUT',
          'WHATSAPP',
          'Aviso de Check-out',
          'Estimado(a) {{guest_name}}, te recordamos que el horario de check-out en {{hotel_name}} es hasta las {{check_out_time}}. Tu saldo pendiente en recepción es ${{balance}} COP. Agradecemos tu visita.',
          JSON.stringify(['guest_name', 'hotel_name', 'check_out_time', 'balance'])
        ],
        [
          'BIENVENIDA_HUESPED',
          'WHATSAPP',
          'Bienvenida al Hotel',
          '¡Bienvenido(a) a {{hotel_name}}, {{guest_name}}! Deseamos que disfrutes tu estancia en la habitación {{room_number}}. Si requieres room service o restaurante, puedes comunicarte con recepción marcando a recepción.',
          JSON.stringify(['hotel_name', 'guest_name', 'room_number'])
        ]
      ];

      for (const [code, channel, title, body, vars] of defaultTemplates) {
        await run(
          `INSERT INTO message_templates (hotel_id, code, channel, title, body_template, variables_json, active, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
          [hotelId, code, channel, title, body, vars, nowIso]
        );
      }
    }
  }
};

const initDatabase = async () => {
  try {
    console.log('Inicializando esquema Multi-Tenant del PMS Hotelero...');
    const today = getTodayString();

    // 1. Tabla de Usuarios
    await run(`
      CREATE TABLE IF NOT EXISTS users (
        id ${pkType},
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        full_name TEXT DEFAULT 'Administrador Principal',
        document TEXT,
        position TEXT DEFAULT 'Administrador',
        email TEXT,
        phone TEXT,
        role TEXT DEFAULT 'PROPIETARIO',
        custom_permissions TEXT,
        active INTEGER DEFAULT 1,
        default_hotel_id INTEGER,
        last_login_at TEXT,
        created_at TEXT DEFAULT ${nowDateDefault}
      )
    `);
    await ensureColumn('users', 'full_name', "TEXT DEFAULT 'Administrador Principal'");
    await ensureColumn('users', 'document', 'TEXT');
    await ensureColumn('users', 'position', "TEXT DEFAULT 'Administrador'");
    await ensureColumn('users', 'email', 'TEXT');
    await ensureColumn('users', 'phone', 'TEXT');
    await ensureColumn('users', 'role', "TEXT DEFAULT 'PROPIETARIO'");
    await ensureColumn('users', 'custom_permissions', 'TEXT');
    await ensureColumn('users', 'active', 'INTEGER DEFAULT 1');
    await ensureColumn('users', 'default_hotel_id', 'INTEGER');
    await ensureColumn('users', 'last_login_at', 'TEXT');
    await ensureColumn('users', 'created_at', 'TEXT');

    // 2. Tabla de Hoteles (Tenants / Sedes)
    await run(`
      CREATE TABLE IF NOT EXISTS hotels (
        id ${pkType},
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        legal_name TEXT,
        tax_id TEXT,
        tax_regime TEXT DEFAULT 'Régimen Simplificado / No Responsable de IVA',
        logo_url TEXT DEFAULT '/logo.png',
        address TEXT,
        city TEXT DEFAULT 'La Dorada, Caldas',
        country TEXT DEFAULT 'Colombia',
        phone TEXT,
        email TEXT,
        website TEXT,
        currency TEXT DEFAULT 'COP',
        timezone TEXT DEFAULT 'America/Bogota',
        check_in_time TEXT DEFAULT '15:00',
        check_out_time TEXT DEFAULT '13:00',
        accommodation_policy TEXT DEFAULT 'Todo huésped debe registrarse con documento de identidad válido al momento del Check-in.',
        cancellation_policy TEXT DEFAULT 'Cancelaciones sin penalidad hasta 24 horas antes de la fecha prevista de llegada.',
        reservation_policy TEXT DEFAULT 'Las reservas se garantizan mediante anticipo o confirmación telefónica.',
        sire_code TEXT,
        tra_code TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT ${nowDateDefault}
      )
    `);
    await ensureColumn('hotels', 'code', 'TEXT');
    await ensureColumn('hotels', 'legal_name', 'TEXT');
    await ensureColumn('hotels', 'tax_id', 'TEXT');
    await ensureColumn('hotels', 'tax_regime', "TEXT DEFAULT 'Régimen Simplificado / No Responsable de IVA'");
    await ensureColumn('hotels', 'logo_url', "TEXT DEFAULT '/logo.png'");
    await ensureColumn('hotels', 'city', "TEXT DEFAULT 'La Dorada, Caldas'");
    await ensureColumn('hotels', 'country', "TEXT DEFAULT 'Colombia'");
    await ensureColumn('hotels', 'email', 'TEXT');
    await ensureColumn('hotels', 'website', 'TEXT');
    await ensureColumn('hotels', 'currency', "TEXT DEFAULT 'COP'");
    await ensureColumn('hotels', 'timezone', "TEXT DEFAULT 'America/Bogota'");
    await ensureColumn('hotels', 'check_in_time', "TEXT DEFAULT '15:00'");
    await ensureColumn('hotels', 'check_out_time', "TEXT DEFAULT '13:00'");
    await ensureColumn('hotels', 'accommodation_policy', 'TEXT');
    await ensureColumn('hotels', 'cancellation_policy', 'TEXT');
    await ensureColumn('hotels', 'reservation_policy', 'TEXT');
    await ensureColumn('hotels', 'sire_code', 'TEXT');
    await ensureColumn('hotels', 'tra_code', 'TEXT');
    await ensureColumn('hotels', 'dian_environment', "TEXT DEFAULT 'HABILITACION'");
    await ensureColumn('hotels', 'dian_provider', "TEXT DEFAULT 'ADAPTADOR_ESTANDAR'");
    await ensureColumn('hotels', 'dian_resolution', 'TEXT');
    await ensureColumn('hotels', 'dian_prefix', "TEXT DEFAULT 'FE'");
    await ensureColumn('hotels', 'dian_api_url', 'TEXT');
    await ensureColumn('hotels', 'whatsapp_phone_number_id', 'TEXT');
    await ensureColumn('hotels', 'whatsapp_access_token', 'TEXT');
    await ensureColumn('hotels', 'whatsapp_business_account_id', 'TEXT');
    await ensureColumn('hotels', 'smtp_host', 'TEXT');
    await ensureColumn('hotels', 'smtp_port', 'INTEGER DEFAULT 587');
    await ensureColumn('hotels', 'smtp_user', 'TEXT');
    await ensureColumn('hotels', 'smtp_pass', 'TEXT');
    await ensureColumn('hotels', 'smtp_from_email', 'TEXT');
    await ensureColumn('hotels', 'smtp_secure', 'INTEGER DEFAULT 0');
    await ensureColumn('hotels', 'active', 'INTEGER DEFAULT 1');
    await ensureColumn('hotels', 'created_at', 'TEXT');

    // 3. Relación Usuarios <-> Hoteles (Permisos por Sede / Tenant)
    await run(`
      CREATE TABLE IF NOT EXISTS user_hotels (
        id ${pkType},
        user_id INTEGER NOT NULL,
        hotel_id INTEGER NOT NULL,
        role TEXT NOT NULL DEFAULT 'RECEPCIONISTA',
        active INTEGER DEFAULT 1,
        UNIQUE(user_id, hotel_id),
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
      )
    `);

    // 3b. Registro y Control de Sesiones de Usuario (Bloque 2)
    await run(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id ${pkType},
        user_id INTEGER NOT NULL,
        hotel_id INTEGER,
        session_token TEXT UNIQUE NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        revoked INTEGER DEFAULT 0,
        revoked_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // 4. Impuestos por Hotel (Módulo 13)
    await run(`
      CREATE TABLE IF NOT EXISTS hotel_taxes (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        percentage ${numType} NOT NULL DEFAULT 0,
        is_inclusive INTEGER DEFAULT 0,
        applies_to TEXT DEFAULT 'ALL',
        active INTEGER DEFAULT 1,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
      )
    `);

    // 5. Métodos de Pago por Hotel (Módulo 13)
    await run(`
      CREATE TABLE IF NOT EXISTS hotel_payment_methods (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'CASH',
        requires_reference INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
      )
    `);

    // 6. Departamentos Operativos por Hotel (Módulo 13)
    await run(`
      CREATE TABLE IF NOT EXISTS hotel_departments (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        description TEXT,
        active INTEGER DEFAULT 1,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
      )
    `);

    // 7. Tipos de Habitación
    await run(`
      CREATE TABLE IF NOT EXISTS room_types (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        code TEXT DEFAULT 'STD',
        base_price ${numType} NOT NULL,
        rate_3_days ${numType},
        rate_weekly ${numType},
        capacity INTEGER NOT NULL DEFAULT 2,
        bed_config TEXT DEFAULT '1 Cama Doble',
        amenities TEXT DEFAULT 'Baño privado, TV, Wi-Fi',
        photos TEXT DEFAULT '[]',
        description TEXT,
        active INTEGER DEFAULT 1,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
      )
    `);
    await ensureColumn('room_types', 'code', "TEXT DEFAULT 'STD'");
    await ensureColumn('room_types', 'rate_3_days', `${numType}`);
    await ensureColumn('room_types', 'rate_weekly', `${numType}`);
    await ensureColumn('room_types', 'bed_config', "TEXT DEFAULT '1 Cama Doble'");
    await ensureColumn('room_types', 'amenities', "TEXT DEFAULT 'Baño privado, TV, Wi-Fi'");
    await ensureColumn('room_types', 'photos', "TEXT DEFAULT '[]'");
    await ensureColumn('room_types', 'active', 'INTEGER DEFAULT 1');

    // 8. Habitaciones
    await run(`
      CREATE TABLE IF NOT EXISTS rooms (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        room_type_id INTEGER,
        number TEXT NOT NULL,
        floor TEXT DEFAULT '1',
        price_override ${numType},
        rate_3_days ${numType},
        rate_weekly ${numType},
        capacity INTEGER,
        bed_config TEXT,
        amenities TEXT,
        photos TEXT DEFAULT '[]',
        status TEXT DEFAULT 'DISPONIBLE',
        observations TEXT,
        active INTEGER DEFAULT 1,
        UNIQUE(hotel_id, number),
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (room_type_id) REFERENCES room_types (id) ON DELETE SET NULL
      )
    `);
    await ensureColumn('rooms', 'floor', "TEXT DEFAULT '1'");
    await ensureColumn('rooms', 'price_override', `${numType}`);
    await ensureColumn('rooms', 'rate_3_days', `${numType}`);
    await ensureColumn('rooms', 'rate_weekly', `${numType}`);
    await ensureColumn('rooms', 'capacity', 'INTEGER');
    await ensureColumn('rooms', 'bed_config', 'TEXT');
    await ensureColumn('rooms', 'amenities', 'TEXT');
    await ensureColumn('rooms', 'photos', "TEXT DEFAULT '[]'");
    await ensureColumn('rooms', 'active', 'INTEGER DEFAULT 1');

    // 8b. Historial Operativo de Habitaciones (Ocupación, Limpieza y Mantenimiento - Bloque 4)
    await run(`
      CREATE TABLE IF NOT EXISTS room_history (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        room_id INTEGER NOT NULL,
        category TEXT NOT NULL DEFAULT 'STATUS_CHANGE',
        previous_status TEXT,
        new_status TEXT NOT NULL,
        notes TEXT,
        cost ${numType} DEFAULT 0,
        user_id INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // 9. Huéspedes (Aislados por hotel_id)
    // Si existe la tabla guests antigua sin hotel_id y está vacía, la recreamos con aislamiento multi-tenant
    if (!isPg) {
      const guestCols = await query('PRAGMA table_info(guests)');
      const hasHotelId = guestCols.some((c) => c.name === 'hotel_id');
      if (guestCols.length > 0 && !hasHotelId) {
        const gCount = await get('SELECT COUNT(*) as c FROM guests');
        if (!gCount || Number(gCount.c) === 0) {
          await run('DROP TABLE guests');
        }
      }
    }

    await run(`
      CREATE TABLE IF NOT EXISTS guests (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT DEFAULT '',
        doc_type TEXT DEFAULT 'CC',
        document TEXT,
        phone TEXT,
        email TEXT,
        nationality TEXT DEFAULT 'Colombiana',
        origin_city TEXT,
        destination_city TEXT,
        address TEXT,
        birth_date TEXT,
        observations TEXT,
        created_at TEXT DEFAULT ${nowDateDefault},
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
      )
    `);
    await ensureColumn('guests', 'hotel_id', 'INTEGER NOT NULL DEFAULT 1');
    await ensureColumn('guests', 'origin_city', 'TEXT');
    await ensureColumn('guests', 'destination_city', 'TEXT');
    await ensureColumn('guests', 'travel_purpose', "TEXT DEFAULT 'Turismo'");
    await ensureColumn('guests', 'occupation', 'TEXT');
    await ensureColumn('guests', 'company', 'TEXT');
    await ensureColumn('guests', 'vehicle_plate', 'TEXT');
    await ensureColumn('guests', 'emergency_contact', 'TEXT');
    await ensureColumn('guests', 'documents_json', "TEXT DEFAULT '[]'");
    await ensureColumn('guests', 'vip_status', 'INTEGER DEFAULT 0');
    await ensureColumn('guests', 'created_at', 'TEXT');

    // 10. Reservas
    await run(`
      CREATE TABLE IF NOT EXISTS reservations (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        code TEXT,
        guest_id INTEGER NOT NULL,
        is_group INTEGER DEFAULT 0,
        group_name TEXT,
        check_in_expected TEXT NOT NULL,
        check_in_time TEXT DEFAULT '15:00',
        check_out_expected TEXT NOT NULL,
        check_out_time TEXT DEFAULT '13:00',
        nights INTEGER DEFAULT 1,
        adults INTEGER DEFAULT 1,
        children INTEGER DEFAULT 0,
        status TEXT DEFAULT 'PENDIENTE',
        subtotal_price ${numType} DEFAULT 0,
        discount_amount ${numType} DEFAULT 0,
        discount_reason TEXT,
        total_price ${numType} NOT NULL DEFAULT 0,
        advance_paid ${numType} DEFAULT 0,
        payment_method TEXT DEFAULT 'Efectivo',
        cancellation_reason TEXT,
        cancelled_at TEXT,
        confirmed_at TEXT,
        user_id INTEGER,
        observations TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (guest_id) REFERENCES guests (id) ON DELETE RESTRICT
      )
    `);
    await ensureColumn('reservations', 'code', 'TEXT');
    await ensureColumn('reservations', 'is_group', 'INTEGER DEFAULT 0');
    await ensureColumn('reservations', 'group_name', 'TEXT');
    await ensureColumn('reservations', 'check_in_time', "TEXT DEFAULT '15:00'");
    await ensureColumn('reservations', 'check_out_time', "TEXT DEFAULT '13:00'");
    await ensureColumn('reservations', 'nights', 'INTEGER DEFAULT 1');
    await ensureColumn('reservations', 'adults', 'INTEGER DEFAULT 1');
    await ensureColumn('reservations', 'children', 'INTEGER DEFAULT 0');
    await ensureColumn('reservations', 'subtotal_price', `${numType} DEFAULT 0`);
    await ensureColumn('reservations', 'discount_amount', `${numType} DEFAULT 0`);
    await ensureColumn('reservations', 'discount_reason', 'TEXT');
    await ensureColumn('reservations', 'advance_paid', `${numType} DEFAULT 0`);
    await ensureColumn('reservations', 'payment_method', "TEXT DEFAULT 'Efectivo'");
    await ensureColumn('reservations', 'cancellation_reason', 'TEXT');
    await ensureColumn('reservations', 'cancelled_at', 'TEXT');
    await ensureColumn('reservations', 'confirmed_at', 'TEXT');
    await ensureColumn('reservations', 'user_id', 'INTEGER');

    // 11. Habitaciones por Reserva
    await run(`
      CREATE TABLE IF NOT EXISTS reservation_rooms (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        reservation_id INTEGER NOT NULL,
        room_id INTEGER NOT NULL,
        room_type_id INTEGER,
        rate_per_night ${numType} DEFAULT 0,
        price ${numType} NOT NULL,
        FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE RESTRICT
      )
    `);
    await ensureColumn('reservation_rooms', 'hotel_id', 'INTEGER NOT NULL DEFAULT 1');
    await ensureColumn('reservation_rooms', 'room_type_id', 'INTEGER');
    await ensureColumn('reservation_rooms', 'rate_per_night', `${numType} DEFAULT 0`);

    // 12. Estadías (Alojamientos activos e históricos)
    await run(`
      CREATE TABLE IF NOT EXISTS stays (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        reservation_id INTEGER,
        room_id INTEGER NOT NULL,
        guest_id INTEGER NOT NULL,
        check_in_time TEXT NOT NULL,
        check_out_time TEXT,
        payment_type TEXT DEFAULT 'Pago diario',
        next_payment_date TEXT,
        rate_per_period ${numType} DEFAULT 0,
        status TEXT DEFAULT 'ACTIVA',
        observations TEXT,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (reservation_id) REFERENCES reservations (id) ON DELETE SET NULL,
        FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE RESTRICT,
        FOREIGN KEY (guest_id) REFERENCES guests (id) ON DELETE RESTRICT
      )
    `);
    await ensureColumn('stays', 'hotel_id', 'INTEGER NOT NULL DEFAULT 1');
    await ensureColumn('stays', 'rate_per_period', `${numType} DEFAULT 0`);
    await ensureColumn('stays', 'observations', 'TEXT');
    await ensureColumn('stays', 'expected_check_out', 'TEXT');
    await ensureColumn('stays', 'adults', 'INTEGER DEFAULT 1');
    await ensureColumn('stays', 'children', 'INTEGER DEFAULT 0');
    await ensureColumn('stays', 'origin_city', 'TEXT');
    await ensureColumn('stays', 'destination_city', 'TEXT');
    await ensureColumn('stays', 'travel_purpose', "TEXT DEFAULT 'Turismo'");
    await ensureColumn('stays', 'vehicle_plate', 'TEXT');
    await ensureColumn('stays', 'documents_json', "TEXT DEFAULT '[]'");
    await ensureColumn('stays', 'authorized_balance_checkout', 'INTEGER DEFAULT 0');
    await ensureColumn('stays', 'checkout_auth_reason', 'TEXT');

    // 12b. Acompañantes por Estancia (Módulo 4 - Recepción y Cumplimiento Legal / Menores)
    await run(`
      CREATE TABLE IF NOT EXISTS stay_companions (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        stay_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        doc_type TEXT DEFAULT 'CC',
        document TEXT,
        nationality TEXT DEFAULT 'Colombiana',
        birth_date TEXT,
        relationship TEXT DEFAULT 'Acompañante',
        is_minor INTEGER DEFAULT 0,
        parental_auth_notes TEXT,
        created_at TEXT DEFAULT ${nowDateDefault},
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (stay_id) REFERENCES stays (id) ON DELETE CASCADE
      )
    `);

    // 12c. Tareas de Limpieza / Housekeeping (Disparo automático en Check-out y Módulo 6)
    await run(`
      CREATE TABLE IF NOT EXISTS housekeeping_tasks (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        room_id INTEGER NOT NULL,
        stay_id INTEGER,
        task_type TEXT DEFAULT 'ASEO_SALIDA',
        priority TEXT DEFAULT 'ALTA',
        status TEXT DEFAULT 'PENDIENTE',
        assigned_to INTEGER,
        created_by INTEGER,
        inspected_by INTEGER,
        inspected_at TEXT,
        inspection_notes TEXT,
        duration_minutes INTEGER DEFAULT 0,
        checklist_json TEXT DEFAULT '{}',
        evidence_json TEXT DEFAULT '[]',
        issues_reported TEXT,
        lost_and_found TEXT,
        scheduled_date TEXT,
        notes TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT DEFAULT ${nowDateDefault},
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE,
        FOREIGN KEY (stay_id) REFERENCES stays (id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL
      )
    `);
    await ensureColumn('housekeeping_tasks', 'created_by', 'INTEGER');
    await ensureColumn('housekeeping_tasks', 'inspected_by', 'INTEGER');
    await ensureColumn('housekeeping_tasks', 'inspected_at', 'TEXT');
    await ensureColumn('housekeeping_tasks', 'inspection_notes', 'TEXT');
    await ensureColumn('housekeeping_tasks', 'duration_minutes', 'INTEGER DEFAULT 0');
    await ensureColumn('housekeeping_tasks', 'checklist_json', "TEXT DEFAULT '{}'");
    await ensureColumn('housekeeping_tasks', 'evidence_json', "TEXT DEFAULT '[]'");
    await ensureColumn('housekeeping_tasks', 'issues_reported', 'TEXT');
    await ensureColumn('housekeeping_tasks', 'lost_and_found', 'TEXT');
    await ensureColumn('housekeeping_tasks', 'scheduled_date', 'TEXT');

    // 12d. Reportes de Daños y Órdenes de Mantenimiento (Integrado con Limpieza - Módulos 6 y 11)
    await run(`
      CREATE TABLE IF NOT EXISTS maintenance_tickets (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        room_id INTEGER NOT NULL,
        housekeeping_task_id INTEGER,
        reported_by INTEGER,
        assigned_to INTEGER,
        issue_type TEXT DEFAULT 'CORRECTIVO',
        category TEXT DEFAULT 'General',
        priority TEXT DEFAULT 'ALTA',
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'PENDIENTE',
        block_room INTEGER DEFAULT 0,
        room_blocked_status TEXT,
        estimated_cost ${numType} DEFAULT 0,
        actual_cost ${numType} DEFAULT 0,
        evidence_json TEXT DEFAULT '[]',
        resolution_notes TEXT,
        started_at TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE,
        FOREIGN KEY (housekeeping_task_id) REFERENCES housekeeping_tasks (id) ON DELETE SET NULL,
        FOREIGN KEY (reported_by) REFERENCES users (id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL
      )
    `);
    await ensureColumn('maintenance_tickets', 'ticket_number', 'TEXT');
    await ensureColumn('maintenance_tickets', 'scheduled_date', 'TEXT');
    await ensureColumn('maintenance_tickets', 'materials_cost', `${numType} DEFAULT 0`);
    await ensureColumn('maintenance_tickets', 'labor_cost', `${numType} DEFAULT 0`);
    await ensureColumn('maintenance_tickets', 'previous_room_status', 'TEXT');
    await ensureColumn('maintenance_tickets', 'unlocked_room_status', 'TEXT');
    await ensureColumn('maintenance_tickets', 'location_area', "TEXT DEFAULT 'HABITACION'");

    // 13. Folios / Cuentas de Huésped
    await run(`
      CREATE TABLE IF NOT EXISTS guest_accounts (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        stay_id INTEGER NOT NULL UNIQUE,
        total_charges ${numType} DEFAULT 0,
        total_paid ${numType} DEFAULT 0,
        balance ${numType} DEFAULT 0,
        status TEXT DEFAULT 'ABIERTA',
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (stay_id) REFERENCES stays (id) ON DELETE CASCADE
      )
    `);
    await ensureColumn('guest_accounts', 'hotel_id', 'INTEGER NOT NULL DEFAULT 1');
    await ensureColumn('guest_accounts', 'status', "TEXT DEFAULT 'ABIERTA'");

    // 14. Cargos al Folio
    await run(`
      CREATE TABLE IF NOT EXISTS account_charges (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        amount ${numType} NOT NULL,
        date TEXT NOT NULL,
        user_id INTEGER,
        FOREIGN KEY (account_id) REFERENCES guest_accounts (id) ON DELETE CASCADE
      )
    `);
    await ensureColumn('account_charges', 'hotel_id', 'INTEGER NOT NULL DEFAULT 1');
    await ensureColumn('account_charges', 'user_id', 'INTEGER');
    await ensureColumn('account_charges', 'source_module', 'TEXT');
    await ensureColumn('account_charges', 'source_id', 'INTEGER');

    // 15. Pagos y Abonos al Folio
    await run(`
      CREATE TABLE IF NOT EXISTS payments (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        method TEXT NOT NULL,
        amount ${numType} NOT NULL,
        date TEXT NOT NULL,
        reference TEXT,
        user_id INTEGER,
        FOREIGN KEY (account_id) REFERENCES guest_accounts (id) ON DELETE CASCADE
      )
    `);
    await ensureColumn('payments', 'hotel_id', 'INTEGER NOT NULL DEFAULT 1');
    await ensureColumn('payments', 'user_id', 'INTEGER');

    // 16. Cajas por Turno y Establecimiento
    await run(`
      CREATE TABLE IF NOT EXISTS cash_registers (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        name TEXT DEFAULT 'Caja Principal Recepción',
        opening_time TEXT NOT NULL,
        closing_time TEXT,
        opening_balance ${numType} NOT NULL DEFAULT 0,
        closing_balance ${numType},
        expected_balance ${numType},
        status TEXT DEFAULT 'ABIERTA',
        observations TEXT,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
      )
    `);
    await ensureColumn('cash_registers', 'name', "TEXT DEFAULT 'Caja Principal Recepción'");
    await ensureColumn('cash_registers', 'observations', 'TEXT');
    await ensureColumn('cash_registers', 'shift', "TEXT DEFAULT 'MAÑANA'");
    await ensureColumn('cash_registers', 'operation_point', "TEXT DEFAULT 'RECEPCION'");
    await ensureColumn('cash_registers', 'difference', `${numType} DEFAULT 0`);
    await ensureColumn('cash_registers', 'declared_cash', `${numType} DEFAULT 0`);
    await ensureColumn('cash_registers', 'declared_transfer', `${numType} DEFAULT 0`);
    await ensureColumn('cash_registers', 'declared_card', `${numType} DEFAULT 0`);
    await ensureColumn('cash_registers', 'closed_by', 'INTEGER');

    // 17. Movimientos de Caja
    await run(`
      CREATE TABLE IF NOT EXISTS cash_movements (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        register_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount ${numType} NOT NULL,
        category TEXT NOT NULL,
        payment_method TEXT DEFAULT 'Efectivo',
        description TEXT,
        date TEXT NOT NULL,
        payment_id INTEGER,
        user_id INTEGER,
        voided INTEGER DEFAULT 0,
        receipt_number TEXT,
        movement_subtype TEXT DEFAULT 'OPERATIVO',
        reference TEXT,
        stay_id INTEGER,
        reservation_id INTEGER,
        void_reason TEXT,
        voided_at TEXT,
        voided_by INTEGER,
        compensating_movement_id INTEGER,
        original_movement_id INTEGER,
        created_at TEXT,
        FOREIGN KEY (register_id) REFERENCES cash_registers (id) ON DELETE CASCADE,
        FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE SET NULL
      )
    `);
    await ensureColumn('cash_movements', 'hotel_id', 'INTEGER NOT NULL DEFAULT 1');
    await ensureColumn('cash_movements', 'payment_method', "TEXT DEFAULT 'Efectivo'");
    await ensureColumn('cash_movements', 'user_id', 'INTEGER');
    await ensureColumn('cash_movements', 'voided', 'INTEGER DEFAULT 0');
    await ensureColumn('cash_movements', 'receipt_number', 'TEXT');
    await ensureColumn('cash_movements', 'movement_subtype', "TEXT DEFAULT 'OPERATIVO'");
    await ensureColumn('cash_movements', 'reference', 'TEXT');
    await ensureColumn('cash_movements', 'stay_id', 'INTEGER');
    await ensureColumn('cash_movements', 'reservation_id', 'INTEGER');
    await ensureColumn('cash_movements', 'void_reason', 'TEXT');
    await ensureColumn('cash_movements', 'voided_at', 'TEXT');
    await ensureColumn('cash_movements', 'voided_by', 'INTEGER');
    await ensureColumn('cash_movements', 'compensating_movement_id', 'INTEGER');
    await ensureColumn('cash_movements', 'original_movement_id', 'INTEGER');
    await ensureColumn('cash_movements', 'created_at', 'TEXT');

    // 17b. Arqueos de Caja (Módulo 5 - Bloque 7)
    await run(`
      CREATE TABLE IF NOT EXISTS cash_audits (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        register_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        audit_type TEXT DEFAULT 'ARQUEO_PARCIAL',
        expected_cash ${numType} DEFAULT 0,
        counted_cash ${numType} DEFAULT 0,
        cash_difference ${numType} DEFAULT 0,
        expected_transfer ${numType} DEFAULT 0,
        counted_transfer ${numType} DEFAULT 0,
        expected_card ${numType} DEFAULT 0,
        counted_card ${numType} DEFAULT 0,
        total_expected ${numType} DEFAULT 0,
        total_counted ${numType} DEFAULT 0,
        total_difference ${numType} DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (register_id) REFERENCES cash_registers (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // 18. Productos de Inventario / Servicios Base
    await run(`
      CREATE TABLE IF NOT EXISTS inventory_products (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        category TEXT,
        unit TEXT DEFAULT 'UND',
        cost ${numType} DEFAULT 0,
        price ${numType} NOT NULL,
        stock ${numType} DEFAULT 0,
        min_stock ${numType} DEFAULT 0,
        active INTEGER DEFAULT 1,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
      )
    `);
    await ensureColumn('inventory_products', 'unit', "TEXT DEFAULT 'UND'");
    await ensureColumn('inventory_products', 'cost', `${numType} DEFAULT 0`);
    await ensureColumn('inventory_products', 'active', 'INTEGER DEFAULT 1');
    await ensureColumn('inventory_products', 'sku', 'TEXT');
    await ensureColumn('inventory_products', 'department', "TEXT DEFAULT 'GENERAL'");
    await ensureColumn('inventory_products', 'reorder_point', `${numType} DEFAULT 0`);
    await ensureColumn('inventory_products', 'location', "TEXT DEFAULT 'Bodega Principal'");
    await ensureColumn('inventory_products', 'preferred_supplier_id', 'INTEGER');
    await ensureColumn('inventory_products', 'last_cost', `${numType} DEFAULT 0`);
    await ensureColumn('inventory_products', 'updated_at', 'TEXT');

    // 18f. Proveedores de Inventario (Módulo 8 - Bloque 10)
    await run(`
      CREATE TABLE IF NOT EXISTS suppliers (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        tax_id TEXT,
        contact_name TEXT,
        phone TEXT,
        email TEXT,
        address TEXT,
        category TEXT DEFAULT 'General',
        payment_terms TEXT DEFAULT 'Contado',
        notes TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT ${nowDateDefault},
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
      )
    `);

    // 18g. Órdenes / Facturas de Compra (Módulo 8 - Bloque 10)
    await run(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        order_number TEXT,
        supplier_id INTEGER,
        invoice_number TEXT,
        purchase_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'RECIBIDA',
        payment_method TEXT DEFAULT 'Efectivo',
        register_id INTEGER,
        cash_movement_id INTEGER,
        subtotal ${numType} DEFAULT 0,
        tax_amount ${numType} DEFAULT 0,
        total_amount ${numType} DEFAULT 0,
        notes TEXT,
        created_by INTEGER,
        received_by INTEGER,
        received_at TEXT,
        void_reason TEXT,
        voided_by INTEGER,
        voided_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL,
        FOREIGN KEY (register_id) REFERENCES cash_registers (id) ON DELETE SET NULL,
        FOREIGN KEY (cash_movement_id) REFERENCES cash_movements (id) ON DELETE SET NULL
      )
    `);

    // 18h. Ítems de Órdenes de Compra (Módulo 8 - Bloque 10)
    await run(`
      CREATE TABLE IF NOT EXISTS purchase_order_items (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        purchase_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        item_name TEXT NOT NULL,
        quantity ${numType} NOT NULL DEFAULT 1,
        unit_cost ${numType} NOT NULL DEFAULT 0,
        subtotal ${numType} NOT NULL DEFAULT 0,
        location TEXT DEFAULT 'Bodega Principal',
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (purchase_id) REFERENCES purchase_orders (id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES inventory_products (id) ON DELETE RESTRICT
      )
    `);

    // 18i. Movimientos y Kardex de Inventario (Módulo 8 - Bloque 10)
    await run(`
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        movement_type TEXT NOT NULL,
        direction TEXT NOT NULL DEFAULT 'IN',
        quantity ${numType} NOT NULL DEFAULT 0,
        unit_cost ${numType} DEFAULT 0,
        total_cost ${numType} DEFAULT 0,
        previous_stock ${numType} DEFAULT 0,
        new_stock ${numType} DEFAULT 0,
        department TEXT DEFAULT 'GENERAL',
        source_location TEXT,
        target_location TEXT,
        reference_type TEXT DEFAULT 'MANUAL',
        reference_id INTEGER,
        reference_code TEXT,
        notes TEXT,
        user_id INTEGER,
        movement_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES inventory_products (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // 18b. Catálogo de Productos y Servicios del Hotel (Módulo 7 - Bloque 9)
    await run(`
      CREATE TABLE IF NOT EXISTS service_catalog (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        department TEXT NOT NULL DEFAULT 'RESTAURANTE',
        category TEXT DEFAULT 'General',
        code TEXT,
        name TEXT NOT NULL,
        description TEXT,
        price ${numType} NOT NULL DEFAULT 0,
        cost ${numType} DEFAULT 0,
        unit TEXT DEFAULT 'UND',
        prep_time_minutes INTEGER DEFAULT 10,
        inventory_product_id INTEGER,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT ${nowDateDefault},
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
      )
    `);
    await ensureColumn('service_catalog', 'department', "TEXT NOT NULL DEFAULT 'RESTAURANTE'");
    await ensureColumn('service_catalog', 'category', "TEXT DEFAULT 'General'");
    await ensureColumn('service_catalog', 'code', 'TEXT');
    await ensureColumn('service_catalog', 'description', 'TEXT');
    await ensureColumn('service_catalog', 'cost', `${numType} DEFAULT 0`);
    await ensureColumn('service_catalog', 'unit', "TEXT DEFAULT 'UND'");
    await ensureColumn('service_catalog', 'prep_time_minutes', 'INTEGER DEFAULT 10');
    await ensureColumn('service_catalog', 'inventory_product_id', 'INTEGER');
    await ensureColumn('service_catalog', 'active', 'INTEGER DEFAULT 1');

    // 18j. Recetas y Fichas Técnicas de Consumo Automático (Módulo 8 - Bloque 10)
    await run(`
      CREATE TABLE IF NOT EXISTS service_recipes (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        catalog_id INTEGER NOT NULL,
        inventory_product_id INTEGER NOT NULL,
        quantity ${numType} NOT NULL DEFAULT 1,
        unit TEXT DEFAULT 'UND',
        notes TEXT,
        created_at TEXT DEFAULT ${nowDateDefault},
        UNIQUE(catalog_id, inventory_product_id),
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (catalog_id) REFERENCES service_catalog (id) ON DELETE CASCADE,
        FOREIGN KEY (inventory_product_id) REFERENCES inventory_products (id) ON DELETE CASCADE
      )
    `);

    // 18c. Mesas de Restaurante / Cafetería (Módulo 7 - Bloque 9)
    await run(`
      CREATE TABLE IF NOT EXISTS restaurant_tables (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        number TEXT NOT NULL,
        zone TEXT DEFAULT 'Comedor Principal',
        capacity INTEGER DEFAULT 4,
        status TEXT DEFAULT 'LIBRE',
        active INTEGER DEFAULT 1,
        UNIQUE(hotel_id, number),
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
      )
    `);

    // 18d. Pedidos, Comandas y Consumos de Servicios (Módulo 7 - Bloque 9)
    await run(`
      CREATE TABLE IF NOT EXISTS service_orders (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        order_number TEXT,
        department TEXT NOT NULL DEFAULT 'RESTAURANTE',
        order_type TEXT NOT NULL DEFAULT 'MESA',
        table_id INTEGER,
        stay_id INTEGER,
        room_id INTEGER,
        guest_id INTEGER,
        customer_name TEXT,
        status TEXT NOT NULL DEFAULT 'ABIERTA',
        payment_mode TEXT DEFAULT 'PENDIENTE',
        payment_method TEXT,
        payment_reference TEXT,
        subtotal ${numType} DEFAULT 0,
        discount_amount ${numType} DEFAULT 0,
        tax_amount ${numType} DEFAULT 0,
        total_amount ${numType} DEFAULT 0,
        register_id INTEGER,
        cash_movement_id INTEGER,
        account_charge_id INTEGER,
        notes TEXT,
        created_by INTEGER,
        settled_by INTEGER,
        settled_at TEXT,
        void_reason TEXT,
        voided_by INTEGER,
        voided_at TEXT,
        order_date TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (table_id) REFERENCES restaurant_tables (id) ON DELETE SET NULL,
        FOREIGN KEY (stay_id) REFERENCES stays (id) ON DELETE SET NULL,
        FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE SET NULL,
        FOREIGN KEY (guest_id) REFERENCES guests (id) ON DELETE SET NULL,
        FOREIGN KEY (register_id) REFERENCES cash_registers (id) ON DELETE SET NULL,
        FOREIGN KEY (cash_movement_id) REFERENCES cash_movements (id) ON DELETE SET NULL,
        FOREIGN KEY (account_charge_id) REFERENCES account_charges (id) ON DELETE SET NULL
      )
    `);

    // 18e. Detalle / Ítems de Pedidos y Consumos (Módulo 7 - Bloque 9)
    await run(`
      CREATE TABLE IF NOT EXISTS service_order_items (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        order_id INTEGER NOT NULL,
        catalog_id INTEGER,
        department TEXT DEFAULT 'RESTAURANTE',
        item_name TEXT NOT NULL,
        unit_price ${numType} NOT NULL DEFAULT 0,
        quantity ${numType} NOT NULL DEFAULT 1,
        subtotal ${numType} NOT NULL DEFAULT 0,
        notes TEXT,
        status TEXT DEFAULT 'ACTIVO',
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES service_orders (id) ON DELETE CASCADE,
        FOREIGN KEY (catalog_id) REFERENCES service_catalog (id) ON DELETE SET NULL
      )
    `);

    // 19. Registro de Auditoría Multi-Tenant
    await run(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id ${pkType},
        hotel_id INTEGER,
        user_id INTEGER,
        action TEXT NOT NULL,
        module TEXT NOT NULL,
        entity_id INTEGER,
        details TEXT,
        ip_address TEXT,
        date TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);
    await ensureColumn('audit_logs', 'hotel_id', 'INTEGER');
    await ensureColumn('audit_logs', 'ip_address', 'TEXT');

    // 20. Plan Único de Cuentas (PUC) por Hotel (Módulo 9 - Bloque 11)
    await run(`
      CREATE TABLE IF NOT EXISTS accounting_accounts (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        account_class TEXT NOT NULL,
        nature TEXT NOT NULL DEFAULT 'DEBITO',
        level INTEGER NOT NULL DEFAULT 4,
        parent_code TEXT,
        is_detail INTEGER DEFAULT 1,
        active INTEGER DEFAULT 1,
        UNIQUE(hotel_id, code),
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
      )
    `);

    // 21. Reglas de Contabilización Automática (Módulo 9 - Bloque 11)
    await run(`
      CREATE TABLE IF NOT EXISTS accounting_rules (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        event_code TEXT NOT NULL,
        event_name TEXT NOT NULL,
        description TEXT,
        debit_account_code TEXT NOT NULL,
        credit_account_code TEXT NOT NULL,
        active INTEGER DEFAULT 1,
        UNIQUE(hotel_id, event_code),
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
      )
    `);

    // 22. Periodos Contables Mensuales (Separados estrictamente del Cierre de Turno de Caja)
    await run(`
      CREATE TABLE IF NOT EXISTS accounting_periods (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        period_code TEXT NOT NULL,
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'ABIERTO',
        closed_by INTEGER,
        closed_at TEXT,
        closing_notes TEXT,
        UNIQUE(hotel_id, period_code),
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (closed_by) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // 23. Comprobantes y Asientos Contables (Libro Diario - Partida Doble)
    await run(`
      CREATE TABLE IF NOT EXISTS journal_entries (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        entry_number TEXT,
        entry_type TEXT NOT NULL DEFAULT 'MANUAL',
        entry_date TEXT NOT NULL,
        period_code TEXT NOT NULL,
        description TEXT NOT NULL,
        reference TEXT,
        source_module TEXT,
        source_id INTEGER,
        total_debit ${numType} NOT NULL DEFAULT 0,
        total_credit ${numType} NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'CONTABILIZADO',
        created_by INTEGER,
        void_reason TEXT,
        voided_by INTEGER,
        voided_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // 24. Líneas de Asiento Contable (Débitos y Créditos)
    await run(`
      CREATE TABLE IF NOT EXISTS journal_entry_lines (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        entry_id INTEGER NOT NULL,
        account_id INTEGER NOT NULL,
        account_code TEXT NOT NULL,
        account_name TEXT NOT NULL,
        third_party_name TEXT,
        third_party_doc TEXT,
        description TEXT,
        debit ${numType} NOT NULL DEFAULT 0,
        credit ${numType} NOT NULL DEFAULT 0,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (entry_id) REFERENCES journal_entries (id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES accounting_accounts (id) ON DELETE RESTRICT
      )
    `);

    // 25. Cuentas por Cobrar (Corporativas/Agencias) y Cuentas por Pagar (Proveedores)
    await run(`
      CREATE TABLE IF NOT EXISTS accounts_receivable_payable (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        doc_type TEXT NOT NULL DEFAULT 'CXC',
        doc_number TEXT,
        third_party_type TEXT NOT NULL DEFAULT 'EMPRESA',
        third_party_name TEXT NOT NULL,
        third_party_doc TEXT,
        guest_id INTEGER,
        supplier_id INTEGER,
        stay_id INTEGER,
        purchase_id INTEGER,
        issue_date TEXT NOT NULL,
        due_date TEXT,
        total_amount ${numType} NOT NULL DEFAULT 0,
        paid_amount ${numType} NOT NULL DEFAULT 0,
        balance ${numType} NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDIENTE',
        notes TEXT,
        journal_entry_id INTEGER,
        created_by INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (guest_id) REFERENCES guests (id) ON DELETE SET NULL,
        FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE SET NULL,
        FOREIGN KEY (stay_id) REFERENCES stays (id) ON DELETE SET NULL,
        FOREIGN KEY (purchase_id) REFERENCES purchase_orders (id) ON DELETE SET NULL,
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL
      )
    `);

    // 26. Abonos y Pagos a CXC / CXP
    await run(`
      CREATE TABLE IF NOT EXISTS ar_ap_payments (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        ar_ap_id INTEGER NOT NULL,
        payment_date TEXT NOT NULL,
        amount ${numType} NOT NULL DEFAULT 0,
        payment_method TEXT DEFAULT 'Efectivo',
        reference TEXT,
        register_id INTEGER,
        cash_movement_id INTEGER,
        journal_entry_id INTEGER,
        notes TEXT,
        user_id INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (ar_ap_id) REFERENCES accounts_receivable_payable (id) ON DELETE CASCADE,
        FOREIGN KEY (register_id) REFERENCES cash_registers (id) ON DELETE SET NULL,
        FOREIGN KEY (cash_movement_id) REFERENCES cash_movements (id) ON DELETE SET NULL,
        FOREIGN KEY (journal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL
      )
    `);

    // 27. Conciliación de Cajas y Bancos
    await run(`
      CREATE TABLE IF NOT EXISTS bank_reconciliations (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        account_code TEXT NOT NULL,
        account_name TEXT NOT NULL,
        period_from TEXT NOT NULL,
        period_to TEXT NOT NULL,
        statement_balance ${numType} NOT NULL DEFAULT 0,
        book_balance ${numType} NOT NULL DEFAULT 0,
        difference ${numType} NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'CONCILIADA',
        notes TEXT,
        reconciled_by INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (reconciled_by) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // 28. Adaptador de Facturación Electrónica DIAN (Cola y Previsualización UBL 2.1)
    await run(`
      CREATE TABLE IF NOT EXISTS electronic_invoices (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        invoice_number TEXT NOT NULL,
        prefix TEXT DEFAULT 'FE',
        doc_type TEXT NOT NULL DEFAULT 'FACTURA_VENTA',
        customer_name TEXT NOT NULL,
        customer_doc_type TEXT DEFAULT 'CC',
        customer_doc TEXT,
        customer_email TEXT,
        stay_id INTEGER,
        service_order_id INTEGER,
        issue_date TEXT NOT NULL,
        subtotal ${numType} NOT NULL DEFAULT 0,
        tax_amount ${numType} NOT NULL DEFAULT 0,
        total_amount ${numType} NOT NULL DEFAULT 0,
        cufe TEXT,
        qr_payload TEXT,
        xml_ubl_preview TEXT,
        provider_name TEXT DEFAULT 'ADAPTADOR_ESTANDAR',
        provider_status TEXT DEFAULT 'LISTA_PARA_ENVIO',
        provider_response_json TEXT,
        created_by INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (stay_id) REFERENCES stays (id) ON DELETE SET NULL,
        FOREIGN KEY (service_order_id) REFERENCES service_orders (id) ON DELETE SET NULL
      )
    `);

    // 29. Fichas de Empleados por Hotel (Módulo 10 - Bloque 12)
    await run(`
      CREATE TABLE IF NOT EXISTS employee_profiles (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        employee_code TEXT,
        department TEXT DEFAULT 'RECEPCION',
        contract_type TEXT DEFAULT 'Término Indefinido',
        hire_date TEXT,
        base_salary ${numType} DEFAULT 0,
        eps TEXT,
        arl TEXT,
        emergency_contact TEXT,
        emergency_phone TEXT,
        shift_preference TEXT DEFAULT 'MAÑANA',
        notes TEXT,
        updated_at TEXT,
        UNIQUE(hotel_id, user_id),
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    // 30. Programación y Control de Turnos de Personal (Módulo 10 - Bloque 12)
    await run(`
      CREATE TABLE IF NOT EXISTS staff_shifts (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        shift_date TEXT NOT NULL,
        shift_name TEXT NOT NULL DEFAULT 'MAÑANA',
        start_time TEXT DEFAULT '06:00',
        end_time TEXT DEFAULT '14:00',
        department TEXT DEFAULT 'RECEPCION',
        status TEXT NOT NULL DEFAULT 'PROGRAMADO',
        notes TEXT,
        created_by INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // 31. Centro de Notificaciones Internas (Módulo 14 - Bloque 14)
    await run(`
      CREATE TABLE IF NOT EXISTS notification_center (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        user_id INTEGER,
        category TEXT NOT NULL DEFAULT 'OPERACION',
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        severity TEXT NOT NULL DEFAULT 'INFO',
        action_url TEXT,
        read_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);

    // 32. Motor de Plantillas de Mensajes por Hotel (Módulo 14 - Bloque 14)
    await run(`
      CREATE TABLE IF NOT EXISTS message_templates (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        channel TEXT NOT NULL DEFAULT 'WHATSAPP',
        title TEXT NOT NULL,
        body_template TEXT NOT NULL,
        variables_json TEXT,
        active INTEGER DEFAULT 1,
        updated_at TEXT,
        UNIQUE(hotel_id, code, channel),
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
      )
    `);

    // 33. Buzón de Salida y Bitácora de Mensajes Huésped (Módulo 14 - Bloque 14)
    await run(`
      CREATE TABLE IF NOT EXISTS message_outbox (
        id ${pkType},
        hotel_id INTEGER NOT NULL,
        channel TEXT NOT NULL,
        recipient TEXT NOT NULL,
        recipient_name TEXT,
        template_code TEXT,
        message_body TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDIENTE',
        external_id TEXT,
        error_message TEXT,
        sent_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE CASCADE
      )
    `);

    // Ejecutar migración automática e idempotente de datos históricos y hoteles iniciales
    const migrateLegacyData = require('./migrateLegacy');
    await migrateLegacyData(ensureHotelDefaults);

    // Migraciones versionadas: limpieza de datos, blindaje multi-tenant e índices
    const { runMigrations } = require('./migrations');
    await runMigrations();

    console.log('Tablas y configuración Multi-Tenant inicializadas correctamente.');
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error);
    process.exit(1);
  }
};

initDatabase.ensureHotelDefaults = ensureHotelDefaults;
module.exports = initDatabase;