const db = require('../config/db');
const { getTodayString, formatDate } = require('../utils/date');
const {
  applyServiceConsumptionInTransaction,
  reverseServiceConsumptionInTransaction
} = require('./inventoryController');
const { postByRuleInTransaction, isBankMethod } = require('./accountingController');

const VALID_DEPARTMENTS = [
  'RESTAURANTE',
  'CAFETERIA',
  'ROOM_SERVICE',
  'MINIBAR',
  'LAVANDERIA',
  'SERVICIOS_ADICIONALES'
];

const DEPT_LABELS = {
  RESTAURANTE: 'Restaurante',
  CAFETERIA: 'Cafetería',
  ROOM_SERVICE: 'Room Service',
  MINIBAR: 'Minibar',
  LAVANDERIA: 'Lavandería',
  SERVICIOS_ADICIONALES: 'Servicios Adicionales'
};

const OPEN_ORDER_STATUSES = ['ABIERTA', 'EN_PREPARACION', 'ENTREGADA'];

const normalizeDepartment = (dept) => {
  const upper = String(dept || 'RESTAURANTE')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (VALID_DEPARTMENTS.includes(upper)) return upper;
  return 'RESTAURANTE';
};

const buildOrderNumber = (hotelId, orderId) => {
  return `POS-H${hotelId}-${String(orderId).padStart(5, '0')}`;
};

const buildReceiptNumber = (hotelId, isIncome, movementId) => {
  const prefix = isIncome ? 'RC' : 'CE';
  return `${prefix}-H${hotelId}-${String(movementId).padStart(5, '0')}`;
};

const recalculateAccountTotals = async (txOrDb, accountId) => {
  const chargesRow = await txOrDb.get(
    'SELECT COALESCE(SUM(amount), 0) as total_charges FROM account_charges WHERE account_id = ?',
    [accountId]
  );
  const paymentsRow = await txOrDb.get(
    'SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE account_id = ?',
    [accountId]
  );
  const totalCharges = Number(chargesRow?.total_charges || 0);
  const totalPaid = Number(paymentsRow?.total_paid || 0);
  const balance = Math.max(0, totalCharges - totalPaid);

  await txOrDb.run(
    'UPDATE guest_accounts SET total_charges = ?, total_paid = ?, balance = ? WHERE id = ?',
    [totalCharges, totalPaid, balance, accountId]
  );

  return { total_charges: totalCharges, total_paid: totalPaid, balance };
};

const resolveOpenCashRegister = async (tx, hotelId, registerId, userId, nowIso) => {
  let targetReg = null;
  if (registerId) {
    targetReg = await tx.get(
      'SELECT * FROM cash_registers WHERE id = ? AND hotel_id = ?',
      [Number(registerId), hotelId]
    );
    if (!targetReg) {
      const err = new Error('La caja seleccionada no existe en este hotel.');
      err.statusCode = 404;
      throw err;
    }
    if (targetReg.status !== 'ABIERTA') {
      const err = new Error(`La caja "${targetReg.name}" está cerrada. Seleccione una caja abierta.`);
      err.statusCode = 400;
      throw err;
    }
    return targetReg;
  }

  targetReg = await tx.get(
    "SELECT * FROM cash_registers WHERE hotel_id = ? AND status = 'ABIERTA' AND user_id = ? ORDER BY id DESC LIMIT 1",
    [hotelId, userId || 1]
  );
  if (!targetReg) {
    targetReg = await tx.get(
      "SELECT * FROM cash_registers WHERE hotel_id = ? AND status = 'ABIERTA' ORDER BY id DESC LIMIT 1",
      [hotelId]
    );
  }
  if (!targetReg) {
    const regIns = await tx.run(
      `INSERT INTO cash_registers (
        hotel_id, user_id, name, shift, operation_point, opening_time, opening_balance, status
      ) VALUES (?, ?, 'Caja Principal Recepción', 'MAÑANA', 'RECEPCION', ?, 0, 'ABIERTA')`,
      [hotelId, userId || 1, nowIso]
    );
    targetReg = await tx.get('SELECT * FROM cash_registers WHERE id = ?', [regIns.id]);
  }
  return targetReg;
};

const releaseTableIfIdle = async (tx, hotelId, tableId) => {
  if (!tableId) return;
  const openOnTable = await tx.get(
    `SELECT COUNT(*) as c FROM service_orders
     WHERE hotel_id = ? AND table_id = ? AND status IN ('ABIERTA', 'EN_PREPARACION', 'ENTREGADA')`,
    [hotelId, tableId]
  );
  if (!openOnTable || Number(openOnTable.c) === 0) {
    await tx.run(
      "UPDATE restaurant_tables SET status = 'LIBRE' WHERE id = ? AND hotel_id = ?",
      [tableId, hotelId]
    );
  }
};

const settleOrderInTransaction = async ({
  tx,
  hotelId,
  order,
  itemsSummaryText,
  settlementMode,
  paymentMethod,
  paymentReference,
  registerId,
  stayId,
  userId,
  today,
  nowIso
}) => {
  const totalAmount = Number(order.total_amount || 0);
  if (totalAmount <= 0) {
    const err = new Error('El total del pedido debe ser mayor a cero para poder liquidarlo.');
    err.statusCode = 400;
    throw err;
  }

  const deptLabel = DEPT_LABELS[order.department] || order.department;
  const activeOrderItems = await tx.query(
    "SELECT * FROM service_order_items WHERE order_id = ? AND hotel_id = ? AND status = 'ACTIVO'",
    [order.id, hotelId]
  );

  if (settlementMode === 'CARGO_HABITACION') {
    const targetStayId = Number(stayId || order.stay_id);
    if (!targetStayId) {
      const err = new Error('Debe seleccionar una habitación/estancia activa para cargar el consumo al folio.');
      err.statusCode = 400;
      throw err;
    }

    const stayInfo = await tx.get(
      `SELECT s.id, s.room_id, s.guest_id, s.status, r.number as room_number,
              g.first_name, g.last_name, ga.id as account_id
       FROM stays s
       JOIN rooms r ON s.room_id = r.id
       JOIN guests g ON s.guest_id = g.id
       LEFT JOIN guest_accounts ga ON ga.stay_id = s.id
       WHERE s.id = ? AND s.hotel_id = ?`,
      [targetStayId, hotelId]
    );

    if (!stayInfo || stayInfo.status !== 'ACTIVA') {
      const err = new Error('La estancia seleccionada no se encuentra activa para recibir cargos.');
      err.statusCode = 400;
      throw err;
    }

    let accountId = stayInfo.account_id;
    if (!accountId) {
      const accIns = await tx.run(
        `INSERT INTO guest_accounts (hotel_id, stay_id, total_charges, total_paid, balance, status)
         VALUES (?, ?, 0, 0, 0, 'ABIERTA')`,
        [hotelId, stayInfo.id]
      );
      accountId = accIns.id;
    }

    const chargeDescription = `[${order.order_number}] ${deptLabel}: ${itemsSummaryText}`;
    const chargeIns = await tx.run(
      `INSERT INTO account_charges (
        hotel_id, account_id, type, description, amount, date, user_id, source_module, source_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'POS_SERVICIOS', ?)`,
      [
        hotelId,
        accountId,
        order.department,
        chargeDescription,
        totalAmount,
        today,
        userId || 1,
        order.id
      ]
    );

    await recalculateAccountTotals(tx, accountId);

    const guestFullName = `${stayInfo.first_name || ''}${stayInfo.last_name ? ' ' + stayInfo.last_name : ''}`.trim();

    await tx.run(
      `UPDATE service_orders
       SET status = 'CARGADA_HABITACION',
           payment_mode = 'CARGO_HABITACION',
           stay_id = ?,
           room_id = ?,
           guest_id = ?,
           customer_name = COALESCE(NULLIF(customer_name, ''), ?),
           account_charge_id = ?,
           settled_by = ?,
           settled_at = ?
       WHERE id = ? AND hotel_id = ?`,
      [
        stayInfo.id,
        stayInfo.room_id,
        stayInfo.guest_id,
        guestFullName,
        chargeIns.id,
        userId || 1,
        nowIso,
        order.id,
        hotelId
      ]
    );

    await tx.run(
      `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
       VALUES (?, ?, 'CARGO_SERVICIO_HABITACION', 'RESTAURANTE', ?, ?, ?)`,
      [
        hotelId,
        userId || 1,
        order.id,
        `Consumo ${order.order_number} (${deptLabel}) cargado a Hab. #${stayInfo.room_number} (${guestFullName}) por $${totalAmount}`,
        today
      ]
    );

    await releaseTableIfIdle(tx, hotelId, order.table_id);
    await applyServiceConsumptionInTransaction({
      tx,
      hotelId,
      order,
      activeItems: activeOrderItems,
      userId,
      today,
      nowIso
    });

    await postByRuleInTransaction({
      tx,
      hotelId,
      eventCode: 'POS_CARGO_FOLIO',
      amount: totalAmount,
      entryDate: today,
      description: `Cargo POS ${order.order_number} (${deptLabel}) Hab. #${stayInfo.room_number}`,
      reference: order.order_number,
      sourceModule: 'SERVICE_ORDER',
      sourceId: order.id,
      thirdPartyName: guestFullName,
      userId
    });

    return {
      status: 'CARGADA_HABITACION',
      payment_mode: 'CARGO_HABITACION',
      account_charge_id: chargeIns.id,
      room_number: stayInfo.room_number
    };
  }

  // Modalidad: CAJA_DIRECTA (Pago directo en Caja)
  const targetReg = await resolveOpenCashRegister(tx, hotelId, registerId, userId, nowIso);
  const resolvedMethod = paymentMethod || 'Efectivo';
  const descContext = order.room_id
    ? `Hab. #${order.room_number || order.room_id}`
    : order.table_id
    ? `Mesa ${order.table_number || order.table_id}`
    : order.customer_name || 'Mostrador';

  const movIns = await tx.run(
    `INSERT INTO cash_movements (
      hotel_id, register_id, type, movement_subtype, amount,
      category, payment_method, description, reference, date,
      stay_id, user_id, voided, created_at
    ) VALUES (?, ?, 'INGRESO', 'PAGO_SERVICIO', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    [
      hotelId,
      targetReg.id,
      totalAmount,
      deptLabel,
      resolvedMethod,
      `${order.order_number} (${deptLabel} · ${descContext}): ${itemsSummaryText}`,
      paymentReference || order.order_number,
      today,
      order.stay_id || null,
      userId || 1,
      nowIso
    ]
  );

  const receiptNumber = buildReceiptNumber(hotelId, true, movIns.id);
  await tx.run('UPDATE cash_movements SET receipt_number = ? WHERE id = ?', [
    receiptNumber,
    movIns.id
  ]);

  await tx.run(
    `UPDATE service_orders
     SET status = 'PAGADA',
         payment_mode = 'CAJA_DIRECTA',
         payment_method = ?,
         payment_reference = ?,
         register_id = ?,
         cash_movement_id = ?,
         settled_by = ?,
         settled_at = ?
     WHERE id = ? AND hotel_id = ?`,
    [
      resolvedMethod,
      paymentReference || receiptNumber,
      targetReg.id,
      movIns.id,
      userId || 1,
      nowIso,
      order.id,
      hotelId
    ]
  );

  await tx.run(
    `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
     VALUES (?, ?, 'VENTA_POS_SERVICIO', 'RESTAURANTE', ?, ?, ?)`,
    [
      hotelId,
      userId || 1,
      order.id,
      `Pago directo ${order.order_number} (${deptLabel}) por $${totalAmount} en ${resolvedMethod} - Comprobante ${receiptNumber}`,
      today
    ]
  );

  await releaseTableIfIdle(tx, hotelId, order.table_id);
  await applyServiceConsumptionInTransaction({
    tx,
    hotelId,
    order,
    activeItems: activeOrderItems,
    userId,
    today,
    nowIso
  });

  const isRest = ['RESTAURANTE', 'CAFETERIA'].includes(order.department);
  const posRuleCode = isRest
    ? isBankMethod(resolvedMethod)
      ? 'POS_RESTAURANTE_BANCO'
      : 'POS_RESTAURANTE_CAJA'
    : 'POS_SERVICIOS_CAJA';

  await postByRuleInTransaction({
    tx,
    hotelId,
    eventCode: posRuleCode,
    amount: totalAmount,
    entryDate: today,
    description: `Venta POS ${order.order_number} (${deptLabel}) - ${resolvedMethod}`,
    reference: receiptNumber,
    sourceModule: 'SERVICE_ORDER',
    sourceId: order.id,
    thirdPartyName: order.customer_name || 'Cliente Mostrador',
    userId
  });

  return {
    status: 'PAGADA',
    payment_mode: 'CAJA_DIRECTA',
    cash_movement_id: movIns.id,
    receipt_number: receiptNumber,
    register_id: targetReg.id
  };
};

const hydrateOrders = async (hotelId, orders) => {
  if (!orders || orders.length === 0) return [];
  const orderIds = orders.map((o) => o.id);
  const placeholders = orderIds.map(() => '?').join(',');
  const items = await db.query(
    `SELECT * FROM service_order_items
     WHERE hotel_id = ? AND order_id IN (${placeholders})
     ORDER BY id ASC`,
    [hotelId, ...orderIds]
  );

  const itemsMap = new Map();
  for (const item of items) {
    if (!itemsMap.has(item.order_id)) itemsMap.set(item.order_id, []);
    itemsMap.get(item.order_id).push({
      ...item,
      unit_price: Number(item.unit_price || 0),
      quantity: Number(item.quantity || 0),
      subtotal: Number(item.subtotal || 0)
    });
  }

  return orders.map((o) => ({
    ...o,
    subtotal: Number(o.subtotal || 0),
    discount_amount: Number(o.discount_amount || 0),
    tax_amount: Number(o.tax_amount || 0),
    total_amount: Number(o.total_amount || 0),
    items: itemsMap.get(o.id) || []
  }));
};

// 1. Vista general del módulo de Restaurante y Servicios del Hotel
exports.getOverview = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const today = getTodayString();
    const filterDate = req.query.date || today;
    const filterDept = req.query.department && req.query.department !== 'ALL' ? req.query.department : null;

    const catalog = await db.query(
      `SELECT * FROM service_catalog
       WHERE hotel_id = ?
       ORDER BY department ASC, category ASC, name ASC`,
      [hotelId]
    );

    const tables = await db.query(
      `SELECT * FROM restaurant_tables
       WHERE hotel_id = ? AND active = 1
       ORDER BY id ASC`,
      [hotelId]
    );

    const openOrdersRaw = await db.query(
      `SELECT so.*, rt.number as table_number, r.number as room_number,
              g.first_name, g.last_name,
              u.full_name as created_by_name
       FROM service_orders so
       LEFT JOIN restaurant_tables rt ON so.table_id = rt.id
       LEFT JOIN rooms r ON so.room_id = r.id
       LEFT JOIN guests g ON so.guest_id = g.id
       LEFT JOIN users u ON so.created_by = u.id
       WHERE so.hotel_id = ? AND so.status IN ('ABIERTA', 'EN_PREPARACION', 'ENTREGADA')
       ORDER BY so.id DESC`,
      [hotelId]
    );
    const openOrders = await hydrateOrders(hotelId, openOrdersRaw);

    const openOrderByTable = new Map();
    for (const o of openOrders) {
      if (o.table_id && !openOrderByTable.has(o.table_id)) {
        openOrderByTable.set(o.table_id, o);
      }
    }

    const enrichedTables = tables.map((t) => {
      const activeOrd = openOrderByTable.get(t.id) || null;
      return {
        ...t,
        status: activeOrd ? 'OCUPADA' : t.status === 'INACTIVA' ? 'INACTIVA' : 'LIBRE',
        active_order: activeOrd
      };
    });

    const activeStays = await db.query(
      `SELECT s.id as stay_id, s.room_id, s.guest_id, s.check_in_time,
              r.number as room_number, r.floor,
              g.first_name, g.last_name, g.document,
              ga.id as account_id, ga.balance as folio_balance
       FROM stays s
       JOIN rooms r ON s.room_id = r.id
       JOIN guests g ON s.guest_id = g.id
       LEFT JOIN guest_accounts ga ON ga.stay_id = s.id
       WHERE s.hotel_id = ? AND s.status = 'ACTIVA'
       ORDER BY r.number ASC`,
      [hotelId]
    );

    const openRegisters = await db.query(
      `SELECT cr.*, u.full_name as operator_name
       FROM cash_registers cr
       LEFT JOIN users u ON cr.user_id = u.id
       WHERE cr.hotel_id = ? AND cr.status = 'ABIERTA'
       ORDER BY cr.id DESC`,
      [hotelId]
    );

    const paymentMethods = await db.query(
      `SELECT * FROM hotel_payment_methods
       WHERE hotel_id = ? AND active = 1
       ORDER BY id ASC`,
      [hotelId]
    );

    let ordersSql = `
      SELECT so.*,
             rt.number as table_number,
             r.number as room_number,
             g.first_name, g.last_name,
             cr.name as register_name, cr.shift as register_shift,
             cm.receipt_number,
             u1.full_name as created_by_name,
             u2.full_name as settled_by_name,
             u3.full_name as voided_by_name
      FROM service_orders so
      LEFT JOIN restaurant_tables rt ON so.table_id = rt.id
      LEFT JOIN rooms r ON so.room_id = r.id
      LEFT JOIN guests g ON so.guest_id = g.id
      LEFT JOIN cash_registers cr ON so.register_id = cr.id
      LEFT JOIN cash_movements cm ON so.cash_movement_id = cm.id
      LEFT JOIN users u1 ON so.created_by = u1.id
      LEFT JOIN users u2 ON so.settled_by = u2.id
      LEFT JOIN users u3 ON so.voided_by = u3.id
      WHERE so.hotel_id = ?
    `;
    const params = [hotelId];

    if (filterDate && filterDate !== 'ALL') {
      ordersSql += ' AND so.order_date = ?';
      params.push(formatDate(filterDate));
    }
    if (filterDept) {
      ordersSql += ' AND so.department = ?';
      params.push(filterDept);
    }
    ordersSql += ' ORDER BY so.id DESC LIMIT 120';

    const ordersRaw = await db.query(ordersSql, params);
    const orders = await hydrateOrders(hotelId, ordersRaw);

    // KPIs de hoy
    const todayOrders = await db.query(
      `SELECT status, payment_mode, department, total_amount
       FROM service_orders
       WHERE hotel_id = ? AND order_date = ?`,
      [hotelId, today]
    );

    let soldTodayTotal = 0;
    let directCashToday = 0;
    let roomChargeToday = 0;
    let voidedTodayTotal = 0;
    let activeOrdersCount = openOrders.length;

    for (const row of todayOrders) {
      const amt = Number(row.total_amount || 0);
      if (row.status === 'ANULADA') {
        voidedTodayTotal += amt;
      } else if (row.status === 'PAGADA') {
        soldTodayTotal += amt;
        directCashToday += amt;
      } else if (row.status === 'CARGADA_HABITACION') {
        soldTodayTotal += amt;
        roomChargeToday += amt;
      }
    }

    res.json({
      catalog: catalog.map((c) => ({
        ...c,
        price: Number(c.price || 0),
        cost: Number(c.cost || 0),
        active: Number(c.active)
      })),
      tables: enrichedTables,
      open_orders: openOrders,
      orders,
      active_stays: activeStays.map((s) => ({
        ...s,
        guest_name: `${s.first_name || ''}${s.last_name ? ' ' + s.last_name : ''}`.trim(),
        folio_balance: Number(s.folio_balance || 0)
      })),
      open_registers: openRegisters,
      payment_methods: paymentMethods,
      kpis: {
        sold_today_total: soldTodayTotal,
        direct_cash_today: directCashToday,
        room_charge_today: roomChargeToday,
        voided_today_total: voidedTodayTotal,
        open_orders_count: activeOrdersCount,
        occupied_tables_count: enrichedTables.filter((t) => t.status === 'OCUPADA').length,
        total_tables_count: enrichedTables.length
      }
    });
  } catch (error) {
    console.error('Error al cargar módulo de restaurante y servicios:', error);
    res.status(500).json({ error: 'Error al cargar el módulo de restaurante y servicios.' });
  }
};

// 2. CRUD de Catálogo por Departamento
exports.listCatalog = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { department, active_only } = req.query;

    let sql = 'SELECT * FROM service_catalog WHERE hotel_id = ?';
    const params = [hotelId];
    if (department && department !== 'ALL') {
      sql += ' AND department = ?';
      params.push(normalizeDepartment(department));
    }
    if (active_only === '1' || active_only === 'true') {
      sql += ' AND active = 1';
    }
    sql += ' ORDER BY department ASC, category ASC, name ASC';

    const items = await db.query(sql, params);
    res.json(
      items.map((c) => ({
        ...c,
        price: Number(c.price || 0),
        cost: Number(c.cost || 0),
        active: Number(c.active)
      }))
    );
  } catch (error) {
    console.error('Error al listar catálogo POS:', error);
    res.status(500).json({ error: 'Error al consultar el catálogo de servicios.' });
  }
};

exports.createCatalogItem = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      department,
      category,
      code,
      name,
      description,
      price,
      cost,
      unit,
      prep_time_minutes
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'El nombre del producto o servicio es obligatorio.' });
    }
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice < 0) {
      return res.status(400).json({ error: 'El precio debe ser un valor válido mayor o igual a cero.' });
    }

    const dept = normalizeDepartment(department);
    const today = getTodayString();

    const ins = await db.run(
      `INSERT INTO service_catalog (
        hotel_id, department, category, code, name, description,
        price, cost, unit, prep_time_minutes, active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        hotelId,
        dept,
        (category || 'General').trim(),
        (code || '').trim(),
        String(name).trim(),
        (description || '').trim(),
        numPrice,
        Number(cost || 0),
        (unit || 'UND').trim(),
        Number(prep_time_minutes || 10),
        today
      ]
    );

    const created = await db.get('SELECT * FROM service_catalog WHERE id = ?', [ins.id]);
    res.status(201).json({
      message: 'Producto o servicio agregado al catálogo.',
      item: { ...created, price: Number(created.price), cost: Number(created.cost || 0) }
    });
  } catch (error) {
    console.error('Error al crear producto/servicio en catálogo:', error);
    res.status(500).json({ error: 'Error al crear el ítem en el catálogo.' });
  }
};

exports.updateCatalogItem = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const itemId = Number(req.params.itemId);
    const existing = await db.get(
      'SELECT * FROM service_catalog WHERE id = ? AND hotel_id = ?',
      [itemId, hotelId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Ítem del catálogo no encontrado.' });
    }

    const {
      department,
      category,
      code,
      name,
      description,
      price,
      cost,
      unit,
      prep_time_minutes,
      active
    } = req.body;

    const numPrice = price !== undefined ? Number(price) : Number(existing.price);
    if (isNaN(numPrice) || numPrice < 0) {
      return res.status(400).json({ error: 'El precio debe ser un número válido.' });
    }

    await db.run(
      `UPDATE service_catalog
       SET department = ?,
           category = ?,
           code = ?,
           name = ?,
           description = ?,
           price = ?,
           cost = ?,
           unit = ?,
           prep_time_minutes = ?,
           active = ?
       WHERE id = ? AND hotel_id = ?`,
      [
        department ? normalizeDepartment(department) : existing.department,
        category !== undefined ? String(category).trim() : existing.category,
        code !== undefined ? String(code).trim() : existing.code,
        name !== undefined && String(name).trim() ? String(name).trim() : existing.name,
        description !== undefined ? String(description).trim() : existing.description,
        numPrice,
        cost !== undefined ? Number(cost || 0) : Number(existing.cost || 0),
        unit !== undefined ? String(unit).trim() : existing.unit,
        prep_time_minutes !== undefined ? Number(prep_time_minutes || 0) : existing.prep_time_minutes,
        active !== undefined ? (active ? 1 : 0) : existing.active,
        itemId,
        hotelId
      ]
    );

    const updated = await db.get('SELECT * FROM service_catalog WHERE id = ?', [itemId]);
    res.json({
      message: 'Catálogo actualizado correctamente.',
      item: { ...updated, price: Number(updated.price), cost: Number(updated.cost || 0) }
    });
  } catch (error) {
    console.error('Error al actualizar catálogo POS:', error);
    res.status(500).json({ error: 'Error al actualizar el ítem del catálogo.' });
  }
};

exports.toggleCatalogItem = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const itemId = Number(req.params.itemId);
    const existing = await db.get(
      'SELECT * FROM service_catalog WHERE id = ? AND hotel_id = ?',
      [itemId, hotelId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Ítem del catálogo no encontrado.' });
    }

    const nextActive = Number(existing.active) === 1 ? 0 : 1;
    await db.run('UPDATE service_catalog SET active = ? WHERE id = ? AND hotel_id = ?', [
      nextActive,
      itemId,
      hotelId
    ]);
    res.json({
      message: nextActive ? 'Ítem activado en el catálogo.' : 'Ítem desactivado del catálogo.',
      active: nextActive
    });
  } catch (error) {
    console.error('Error al cambiar estado de catálogo:', error);
    res.status(500).json({ error: 'Error al cambiar el estado del ítem.' });
  }
};

// 3. Gestión de Mesas de Restaurante
exports.listTables = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const tables = await db.query(
      'SELECT * FROM restaurant_tables WHERE hotel_id = ? AND active = 1 ORDER BY id ASC',
      [hotelId]
    );
    res.json(tables);
  } catch (error) {
    console.error('Error al listar mesas:', error);
    res.status(500).json({ error: 'Error al consultar mesas del restaurante.' });
  }
};

exports.createTable = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { number, zone, capacity } = req.body;
    if (!number || !String(number).trim()) {
      return res.status(400).json({ error: 'El nombre o número de la mesa es obligatorio.' });
    }

    const cleanNum = String(number).trim();
    const dup = await db.get(
      'SELECT id FROM restaurant_tables WHERE hotel_id = ? AND LOWER(number) = LOWER(?) AND active = 1',
      [hotelId, cleanNum]
    );
    if (dup) {
      return res.status(400).json({ error: `Ya existe una mesa llamada "${cleanNum}".` });
    }

    const ins = await db.run(
      `INSERT INTO restaurant_tables (hotel_id, number, zone, capacity, status, active)
       VALUES (?, ?, ?, ?, 'LIBRE', 1)`,
      [hotelId, cleanNum, (zone || 'Comedor Principal').trim(), Number(capacity || 4)]
    );

    const created = await db.get('SELECT * FROM restaurant_tables WHERE id = ?', [ins.id]);
    res.status(201).json({ message: 'Mesa creada correctamente.', table: created });
  } catch (error) {
    console.error('Error al crear mesa:', error);
    res.status(500).json({ error: 'Error al crear la mesa.' });
  }
};

exports.updateTable = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const tableId = Number(req.params.tableId);
    const existing = await db.get(
      'SELECT * FROM restaurant_tables WHERE id = ? AND hotel_id = ?',
      [tableId, hotelId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Mesa no encontrada.' });
    }

    const { number, zone, capacity, status } = req.body;
    await db.run(
      `UPDATE restaurant_tables
       SET number = ?, zone = ?, capacity = ?, status = ?
       WHERE id = ? AND hotel_id = ?`,
      [
        number !== undefined && String(number).trim() ? String(number).trim() : existing.number,
        zone !== undefined ? String(zone).trim() : existing.zone,
        capacity !== undefined ? Number(capacity || 4) : existing.capacity,
        status || existing.status,
        tableId,
        hotelId
      ]
    );
    const updated = await db.get('SELECT * FROM restaurant_tables WHERE id = ?', [tableId]);
    res.json({ message: 'Mesa actualizada correctamente.', table: updated });
  } catch (error) {
    console.error('Error al actualizar mesa:', error);
    res.status(500).json({ error: 'Error al actualizar la mesa.' });
  }
};

exports.deleteTable = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const tableId = Number(req.params.tableId);
    const openOrders = await db.get(
      `SELECT COUNT(*) as c FROM service_orders
       WHERE hotel_id = ? AND table_id = ? AND status IN ('ABIERTA', 'EN_PREPARACION', 'ENTREGADA')`,
      [hotelId, tableId]
    );
    if (openOrders && Number(openOrders.c) > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar la mesa porque tiene una comanda abierta.'
      });
    }

    await db.run(
      'UPDATE restaurant_tables SET active = 0 WHERE id = ? AND hotel_id = ?',
      [tableId, hotelId]
    );
    res.json({ message: 'Mesa desactivada correctamente.' });
  } catch (error) {
    console.error('Error al eliminar mesa:', error);
    res.status(500).json({ error: 'Error al eliminar la mesa.' });
  }
};

// 4. Pedidos, Comandas y Consumos (Creación rápida con liquidación inmediata o comanda abierta)
exports.listOrders = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { date, department, status, room_id, register_id } = req.query;

    let sql = `
      SELECT so.*,
             rt.number as table_number,
             r.number as room_number,
             g.first_name, g.last_name,
             cr.name as register_name, cr.shift as register_shift,
             cm.receipt_number,
             u1.full_name as created_by_name,
             u2.full_name as settled_by_name
      FROM service_orders so
      LEFT JOIN restaurant_tables rt ON so.table_id = rt.id
      LEFT JOIN rooms r ON so.room_id = r.id
      LEFT JOIN guests g ON so.guest_id = g.id
      LEFT JOIN cash_registers cr ON so.register_id = cr.id
      LEFT JOIN cash_movements cm ON so.cash_movement_id = cm.id
      LEFT JOIN users u1 ON so.created_by = u1.id
      LEFT JOIN users u2 ON so.settled_by = u2.id
      WHERE so.hotel_id = ?
    `;
    const params = [hotelId];

    if (date && date !== 'ALL') {
      sql += ' AND so.order_date = ?';
      params.push(formatDate(date));
    }
    if (department && department !== 'ALL') {
      sql += ' AND so.department = ?';
      params.push(normalizeDepartment(department));
    }
    if (status && status !== 'ALL') {
      sql += ' AND so.status = ?';
      params.push(status);
    }
    if (room_id) {
      sql += ' AND so.room_id = ?';
      params.push(Number(room_id));
    }
    if (register_id) {
      sql += ' AND so.register_id = ?';
      params.push(Number(register_id));
    }

    sql += ' ORDER BY so.id DESC LIMIT 200';
    const raw = await db.query(sql, params);
    const hydrated = await hydrateOrders(hotelId, raw);
    res.json(hydrated);
  } catch (error) {
    console.error('Error al listar pedidos/consumos:', error);
    res.status(500).json({ error: 'Error al consultar los pedidos y consumos.' });
  }
};

exports.createOrder = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      department,
      order_type,
      table_id,
      stay_id,
      customer_name,
      discount_amount,
      notes,
      items,
      settlement_mode, // 'PENDIENTE' | 'CAJA_DIRECTA' | 'CARGO_HABITACION'
      payment_method,
      payment_reference,
      register_id
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe agregar al menos un producto o servicio al pedido.' });
    }

    const dept = normalizeDepartment(department);
    const resolvedOrderType = String(order_type || (table_id ? 'MESA' : stay_id ? dept : 'MOSTRADOR'))
      .trim()
      .toUpperCase();
    const resolvedSettlement = String(settlement_mode || 'PENDIENTE').trim().toUpperCase();
    const numDiscount = Math.max(0, Number(discount_amount || 0));
    const today = getTodayString();
    const nowIso = new Date().toISOString();

    const createdOrder = await db.withTransaction(async (tx) => {
      // Resolver ítems contra el catálogo si traen catalog_id
      const resolvedItems = [];
      let subtotal = 0;

      for (const rawItem of items) {
        const qty = Number(rawItem.quantity || 1);
        if (isNaN(qty) || qty <= 0) {
          const err = new Error('La cantidad de cada ítem debe ser mayor a cero.');
          err.statusCode = 400;
          throw err;
        }

        let itemName = String(rawItem.item_name || rawItem.name || '').trim();
        let unitPrice = Number(rawItem.unit_price ?? rawItem.price ?? 0);
        let itemDept = rawItem.department ? normalizeDepartment(rawItem.department) : dept;
        let catalogId = rawItem.catalog_id ? Number(rawItem.catalog_id) : null;

        if (catalogId) {
          const catItem = await tx.get(
            'SELECT * FROM service_catalog WHERE id = ? AND hotel_id = ?',
            [catalogId, hotelId]
          );
          if (!catItem) {
            const err = new Error(`Producto #${catalogId} no encontrado en el catálogo de este hotel.`);
            err.statusCode = 404;
            throw err;
          }
          if (!itemName) itemName = catItem.name;
          if (rawItem.unit_price === undefined && rawItem.price === undefined) {
            unitPrice = Number(catItem.price || 0);
          }
          if (!rawItem.department) itemDept = catItem.department;
        }

        if (!itemName || isNaN(unitPrice) || unitPrice < 0) {
          const err = new Error('Cada ítem debe tener nombre y precio unitario válido.');
          err.statusCode = 400;
          throw err;
        }

        const lineSub = Math.round(qty * unitPrice * 100) / 100;
        subtotal += lineSub;

        resolvedItems.push({
          catalog_id: catalogId,
          department: itemDept,
          item_name: itemName,
          unit_price: unitPrice,
          quantity: qty,
          subtotal: lineSub,
          notes: rawItem.notes ? String(rawItem.notes).trim() : ''
        });
      }

      const totalAmount = Math.max(0, subtotal - numDiscount);

      // Validar mesa si aplica
      let tableRow = null;
      if (table_id) {
        tableRow = await tx.get(
          'SELECT * FROM restaurant_tables WHERE id = ? AND hotel_id = ? AND active = 1',
          [Number(table_id), hotelId]
        );
        if (!tableRow) {
          const err = new Error('Mesa no encontrada en este establecimiento.');
          err.statusCode = 404;
          throw err;
        }
      }

      // Validar estancia si viene asociada (ej: Room Service, Minibar, Lavandería, Cargo a Habitación)
      let stayRow = null;
      if (stay_id) {
        stayRow = await tx.get(
          `SELECT s.id, s.room_id, s.guest_id, s.status, r.number as room_number,
                  g.first_name, g.last_name
           FROM stays s
           JOIN rooms r ON s.room_id = r.id
           JOIN guests g ON s.guest_id = g.id
           WHERE s.id = ? AND s.hotel_id = ?`,
          [Number(stay_id), hotelId]
        );
        if (!stayRow || stayRow.status !== 'ACTIVA') {
          const err = new Error('La habitación/estancia seleccionada no está activa.');
          err.statusCode = 400;
          throw err;
        }
      }

      if (resolvedSettlement === 'CARGO_HABITACION' && !stayRow) {
        const err = new Error('Debe seleccionar una habitación ocupada para cargar el consumo al folio.');
        err.statusCode = 400;
        throw err;
      }

      const resolvedCustomer =
        (customer_name || '').trim() ||
        (stayRow
          ? `${stayRow.first_name || ''}${stayRow.last_name ? ' ' + stayRow.last_name : ''}`.trim()
          : tableRow
          ? tableRow.number
          : 'Cliente Mostrador');

      const orderIns = await tx.run(
        `INSERT INTO service_orders (
          hotel_id, department, order_type, table_id, stay_id, room_id, guest_id,
          customer_name, status, payment_mode, subtotal, discount_amount, tax_amount,
          total_amount, notes, created_by, order_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ABIERTA', 'PENDIENTE', ?, ?, 0, ?, ?, ?, ?, ?)`,
        [
          hotelId,
          dept,
          resolvedOrderType,
          tableRow ? tableRow.id : null,
          stayRow ? stayRow.id : null,
          stayRow ? stayRow.room_id : null,
          stayRow ? stayRow.guest_id : null,
          resolvedCustomer,
          subtotal,
          numDiscount,
          totalAmount,
          (notes || '').trim(),
          req.user?.id || 1,
          today,
          nowIso
        ]
      );

      const orderNumber = buildOrderNumber(hotelId, orderIns.id);
      await tx.run('UPDATE service_orders SET order_number = ? WHERE id = ?', [
        orderNumber,
        orderIns.id
      ]);

      for (const ri of resolvedItems) {
        await tx.run(
          `INSERT INTO service_order_items (
            hotel_id, order_id, catalog_id, department, item_name, unit_price, quantity, subtotal, notes, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO')`,
          [
            hotelId,
            orderIns.id,
            ri.catalog_id,
            ri.department,
            ri.item_name,
            ri.unit_price,
            ri.quantity,
            ri.subtotal,
            ri.notes
          ]
        );
      }

      if (tableRow && resolvedSettlement === 'PENDIENTE') {
        await tx.run(
          "UPDATE restaurant_tables SET status = 'OCUPADA' WHERE id = ? AND hotel_id = ?",
          [tableRow.id, hotelId]
        );
      }

      const orderObj = {
        id: orderIns.id,
        hotel_id: hotelId,
        order_number: orderNumber,
        department: dept,
        order_type: resolvedOrderType,
        table_id: tableRow ? tableRow.id : null,
        table_number: tableRow ? tableRow.number : null,
        stay_id: stayRow ? stayRow.id : null,
        room_id: stayRow ? stayRow.room_id : null,
        room_number: stayRow ? stayRow.room_number : null,
        guest_id: stayRow ? stayRow.guest_id : null,
        customer_name: resolvedCustomer,
        total_amount: totalAmount
      };

      const itemsSummaryText = resolvedItems
        .map((it) => `${it.quantity}x ${it.item_name}`)
        .join(', ');

      if (resolvedSettlement === 'CAJA_DIRECTA' || resolvedSettlement === 'CARGO_HABITACION') {
        await settleOrderInTransaction({
          tx,
          hotelId,
          order: orderObj,
          itemsSummaryText,
          settlementMode: resolvedSettlement,
          paymentMethod: payment_method,
          paymentReference: payment_reference,
          registerId: register_id,
          stayId: stayRow ? stayRow.id : null,
          userId: req.user?.id || 1,
          today,
          nowIso
        });
      } else {
        await tx.run(
          `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
           VALUES (?, ?, 'CREAR_COMANDA', 'RESTAURANTE', ?, ?, ?)`,
          [
            hotelId,
            req.user?.id || 1,
            orderIns.id,
            `Comanda abierta ${orderNumber} (${DEPT_LABELS[dept] || dept}) - ${resolvedCustomer} por $${totalAmount}`,
            today
          ]
        );
      }

      return tx.get('SELECT * FROM service_orders WHERE id = ?', [orderIns.id]);
    });

    const [hydrated] = await hydrateOrders(hotelId, [createdOrder]);
    res.status(201).json({
      message:
        hydrated.status === 'PAGADA'
          ? `Consumo ${hydrated.order_number} cobrado en caja exitosamente.`
          : hydrated.status === 'CARGADA_HABITACION'
          ? `Consumo ${hydrated.order_number} cargado al folio de la habitación.`
          : `Comanda ${hydrated.order_number} registrada como abierta.`,
      order: hydrated
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al crear pedido/consumo:', error);
    res.status(500).json({ error: 'Error interno al registrar el pedido o consumo.' });
  }
};

// 5. Agregar ítems a una comanda abierta
exports.addOrderItems = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const orderId = Number(req.params.orderId);
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe indicar los ítems a agregar.' });
    }

    const order = await db.get(
      'SELECT * FROM service_orders WHERE id = ? AND hotel_id = ?',
      [orderId, hotelId]
    );
    if (!order) {
      return res.status(404).json({ error: 'Comanda no encontrada.' });
    }
    if (!OPEN_ORDER_STATUSES.includes(order.status)) {
      return res.status(400).json({
        error: `No se pueden agregar ítems a una comanda en estado ${order.status}.`
      });
    }

    await db.withTransaction(async (tx) => {
      for (const rawItem of items) {
        const qty = Number(rawItem.quantity || 1);
        if (isNaN(qty) || qty <= 0) continue;

        let itemName = String(rawItem.item_name || rawItem.name || '').trim();
        let unitPrice = Number(rawItem.unit_price ?? rawItem.price ?? 0);
        let itemDept = rawItem.department ? normalizeDepartment(rawItem.department) : order.department;
        const catalogId = rawItem.catalog_id ? Number(rawItem.catalog_id) : null;

        if (catalogId) {
          const catItem = await tx.get(
            'SELECT * FROM service_catalog WHERE id = ? AND hotel_id = ?',
            [catalogId, hotelId]
          );
          if (catItem) {
            if (!itemName) itemName = catItem.name;
            if (rawItem.unit_price === undefined && rawItem.price === undefined) {
              unitPrice = Number(catItem.price || 0);
            }
            if (!rawItem.department) itemDept = catItem.department;
          }
        }

        if (!itemName || isNaN(unitPrice) || unitPrice < 0) continue;
        const lineSub = Math.round(qty * unitPrice * 100) / 100;

        await tx.run(
          `INSERT INTO service_order_items (
            hotel_id, order_id, catalog_id, department, item_name, unit_price, quantity, subtotal, notes, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO')`,
          [
            hotelId,
            orderId,
            catalogId,
            itemDept,
            itemName,
            unitPrice,
            qty,
            lineSub,
            rawItem.notes ? String(rawItem.notes).trim() : ''
          ]
        );
      }

      const sumRow = await tx.get(
        "SELECT COALESCE(SUM(subtotal), 0) as sub FROM service_order_items WHERE order_id = ? AND hotel_id = ? AND status = 'ACTIVO'",
        [orderId, hotelId]
      );
      const newSub = Number(sumRow?.sub || 0);
      const newTotal = Math.max(0, newSub - Number(order.discount_amount || 0));
      await tx.run(
        'UPDATE service_orders SET subtotal = ?, total_amount = ? WHERE id = ? AND hotel_id = ?',
        [newSub, newTotal, orderId, hotelId]
      );
    });

    const updated = await db.get('SELECT * FROM service_orders WHERE id = ?', [orderId]);
    const [hydrated] = await hydrateOrders(hotelId, [updated]);
    res.json({ message: 'Ítems agregados a la comanda.', order: hydrated });
  } catch (error) {
    console.error('Error al agregar ítems a comanda:', error);
    res.status(500).json({ error: 'Error al agregar ítems a la comanda.' });
  }
};

// 6. Quitar un ítem de una comanda abierta
exports.removeOrderItem = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const orderId = Number(req.params.orderId);
    const itemId = Number(req.params.itemId);

    const order = await db.get(
      'SELECT * FROM service_orders WHERE id = ? AND hotel_id = ?',
      [orderId, hotelId]
    );
    if (!order) {
      return res.status(404).json({ error: 'Comanda no encontrada.' });
    }
    if (!OPEN_ORDER_STATUSES.includes(order.status)) {
      return res.status(400).json({
        error: 'Solo se pueden retirar ítems de comandas abiertas.'
      });
    }

    await db.withTransaction(async (tx) => {
      await tx.run(
        "UPDATE service_order_items SET status = 'ANULADO' WHERE id = ? AND order_id = ? AND hotel_id = ?",
        [itemId, orderId, hotelId]
      );
      const sumRow = await tx.get(
        "SELECT COALESCE(SUM(subtotal), 0) as sub FROM service_order_items WHERE order_id = ? AND hotel_id = ? AND status = 'ACTIVO'",
        [orderId, hotelId]
      );
      const newSub = Number(sumRow?.sub || 0);
      const newTotal = Math.max(0, newSub - Number(order.discount_amount || 0));
      await tx.run(
        'UPDATE service_orders SET subtotal = ?, total_amount = ? WHERE id = ? AND hotel_id = ?',
        [newSub, newTotal, orderId, hotelId]
      );
    });

    const updated = await db.get('SELECT * FROM service_orders WHERE id = ?', [orderId]);
    const [hydrated] = await hydrateOrders(hotelId, [updated]);
    res.json({ message: 'Ítem retirado de la comanda.', order: hydrated });
  } catch (error) {
    console.error('Error al retirar ítem de comanda:', error);
    res.status(500).json({ error: 'Error al retirar el ítem.' });
  }
};

// 7. Cambiar estado operativo de una comanda abierta (ABIERTA -> EN_PREPARACION -> ENTREGADA)
exports.updateOrderStatus = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const orderId = Number(req.params.orderId);
    const { status } = req.body;

    if (!OPEN_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Estado operativo inválido para la comanda.' });
    }

    const order = await db.get(
      'SELECT * FROM service_orders WHERE id = ? AND hotel_id = ?',
      [orderId, hotelId]
    );
    if (!order) {
      return res.status(404).json({ error: 'Comanda no encontrada.' });
    }
    if (!OPEN_ORDER_STATUSES.includes(order.status)) {
      return res.status(400).json({
        error: `La comanda ya fue cerrada (${order.status}) y no puede cambiar de estado operativo.`
      });
    }

    await db.run('UPDATE service_orders SET status = ? WHERE id = ? AND hotel_id = ?', [
      status,
      orderId,
      hotelId
    ]);
    res.json({ message: `Estado de comanda actualizado a ${status}.`, status });
  } catch (error) {
    console.error('Error al actualizar estado de comanda:', error);
    res.status(500).json({ error: 'Error al actualizar el estado de la comanda.' });
  }
};

// 8. Liquidar Comanda Abierta (Modalidad Dual: Pago Directo en Caja o Cargo a Habitación/Folio)
exports.settleOrder = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const orderId = Number(req.params.orderId);
    const { settlement_mode, payment_method, payment_reference, register_id, stay_id } = req.body;

    const mode = String(settlement_mode || 'CAJA_DIRECTA').trim().toUpperCase();
    if (!['CAJA_DIRECTA', 'CARGO_HABITACION'].includes(mode)) {
      return res.status(400).json({
        error: 'Modalidad de cobro inválida. Use CAJA_DIRECTA o CARGO_HABITACION.'
      });
    }

    const order = await db.get(
      `SELECT so.*, rt.number as table_number, r.number as room_number
       FROM service_orders so
       LEFT JOIN restaurant_tables rt ON so.table_id = rt.id
       LEFT JOIN rooms r ON so.room_id = r.id
       WHERE so.id = ? AND so.hotel_id = ?`,
      [orderId, hotelId]
    );
    if (!order) {
      return res.status(404).json({ error: 'Comanda no encontrada.' });
    }
    if (!OPEN_ORDER_STATUSES.includes(order.status)) {
      return res.status(400).json({
        error: `Esta comanda no se puede liquidar porque su estado actual es ${order.status}.`
      });
    }

    const activeItems = await db.query(
      "SELECT * FROM service_order_items WHERE order_id = ? AND hotel_id = ? AND status = 'ACTIVO'",
      [orderId, hotelId]
    );
    if (activeItems.length === 0) {
      return res.status(400).json({ error: 'La comanda no tiene ítems activos para cobrar.' });
    }

    const itemsSummaryText = activeItems
      .map((it) => `${Number(it.quantity)}x ${it.item_name}`)
      .join(', ');

    const today = getTodayString();
    const nowIso = new Date().toISOString();

    const result = await db.withTransaction(async (tx) => {
      return settleOrderInTransaction({
        tx,
        hotelId,
        order,
        itemsSummaryText,
        settlementMode: mode,
        paymentMethod: payment_method,
        paymentReference: payment_reference,
        registerId: register_id,
        stayId: stay_id,
        userId: req.user?.id || 1,
        today,
        nowIso
      });
    });

    const updated = await db.get('SELECT * FROM service_orders WHERE id = ?', [orderId]);
    const [hydrated] = await hydrateOrders(hotelId, [updated]);

    res.json({
      message:
        mode === 'CARGO_HABITACION'
          ? `Comanda ${hydrated.order_number} cargada al folio de la habitación #${result.room_number}.`
          : `Comanda ${hydrated.order_number} pagada en caja (${result.receipt_number}).`,
      settlement: result,
      order: hydrated
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al liquidar comanda:', error);
    res.status(500).json({ error: 'Error interno al liquidar la comanda.' });
  }
};

// 9. Anulación / Devolución Autorizada de Consumo (Con reversión en Caja o Folio y Auditoría)
exports.voidOrder = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const orderId = Number(req.params.orderId);
    const { void_reason, reason } = req.body || {};

    const effectiveReason = String(void_reason || reason || '').trim();
    if (!effectiveReason) {
      return res.status(400).json({
        error: 'Por control financiero, debe indicar el motivo de la anulación o devolución.'
      });
    }

    const order = await db.get(
      'SELECT * FROM service_orders WHERE id = ? AND hotel_id = ?',
      [orderId, hotelId]
    );
    if (!order) {
      return res.status(404).json({ error: 'Consumo o comanda no encontrada.' });
    }
    if (order.status === 'ANULADA') {
      return res.status(400).json({ error: 'Este consumo ya fue anulado anteriormente.' });
    }

    const today = getTodayString();
    const nowIso = new Date().toISOString();

    await db.withTransaction(async (tx) => {
      // A. Si fue cobrado en Caja Directa -> generar movimiento compensatorio y marcar movimiento original como anulado
      if (order.status === 'PAGADA' && order.cash_movement_id) {
        const origMov = await tx.get(
          'SELECT * FROM cash_movements WHERE id = ? AND hotel_id = ?',
          [order.cash_movement_id, hotelId]
        );

        if (origMov && Number(origMov.voided) !== 1) {
          const compIns = await tx.run(
            `INSERT INTO cash_movements (
              hotel_id, register_id, type, movement_subtype, amount,
              category, payment_method, description, reference, date,
              original_movement_id, user_id, voided, void_reason, voided_at, voided_by, created_at
            ) VALUES (?, ?, 'EGRESO', 'ANULACION_COMPENSATORIA', ?, 'Devolución / Anulación POS', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
            [
              hotelId,
              origMov.register_id,
              Number(origMov.amount || 0),
              origMov.payment_method || 'Efectivo',
              `[DEVOLUCIÓN POS] Anulación ${order.order_number} (${origMov.receipt_number || ''}) — Motivo: ${effectiveReason}`,
              order.order_number,
              today,
              origMov.id,
              req.user?.id || 1,
              effectiveReason,
              nowIso,
              req.user?.id || 1,
              nowIso
            ]
          );

          const compReceipt = `ANUL-H${hotelId}-${String(compIns.id).padStart(5, '0')}`;
          await tx.run('UPDATE cash_movements SET receipt_number = ? WHERE id = ?', [
            compReceipt,
            compIns.id
          ]);

          await tx.run(
            `UPDATE cash_movements
             SET voided = 1, void_reason = ?, voided_at = ?, voided_by = ?, compensating_movement_id = ?
             WHERE id = ? AND hotel_id = ?`,
            [effectiveReason, nowIso, req.user?.id || 1, compIns.id, origMov.id, hotelId]
          );
        }
      }

      // B. Si fue cargado al Folio de una Habitación -> registrar cargo compensatorio negativo y recalcular folio
      if (order.status === 'CARGADA_HABITACION' && order.account_charge_id) {
        const origCharge = await tx.get(
          'SELECT * FROM account_charges WHERE id = ? AND hotel_id = ?',
          [order.account_charge_id, hotelId]
        );
        if (origCharge) {
          const revAmount = -Math.abs(Number(origCharge.amount || order.total_amount || 0));
          await tx.run(
            `INSERT INTO account_charges (
              hotel_id, account_id, type, description, amount, date, user_id, source_module, source_id
            ) VALUES (?, ?, 'DEVOLUCION_SERVICIO', ?, ?, ?, ?, 'POS_SERVICIOS_ANULACION', ?)`,
            [
              hotelId,
              origCharge.account_id,
              `[ANULACIÓN ${order.order_number}] ${origCharge.description} — Motivo: ${effectiveReason}`,
              revAmount,
              today,
              req.user?.id || 1,
              order.id
            ]
          );
          await recalculateAccountTotals(tx, origCharge.account_id);
        }
      }

      // C. Marcar la orden como ANULADA y liberar mesa si aplica
      await tx.run(
        `UPDATE service_orders
         SET status = 'ANULADA',
             void_reason = ?,
             voided_by = ?,
             voided_at = ?
         WHERE id = ? AND hotel_id = ?`,
        [effectiveReason, req.user?.id || 1, nowIso, order.id, hotelId]
      );

      await releaseTableIfIdle(tx, hotelId, order.table_id);
      await reverseServiceConsumptionInTransaction({
        tx,
        hotelId,
        order,
        voidReason: effectiveReason,
        userId: req.user?.id || 1,
        today,
        nowIso
      });

      if (order.status === 'PAGADA' || order.status === 'CARGADA_HABITACION') {
        const isRest = ['RESTAURANTE', 'CAFETERIA'].includes(order.department);
        const revRule =
          order.status === 'CARGADA_HABITACION'
            ? 'POS_CARGO_FOLIO'
            : isRest
            ? isBankMethod(order.payment_method)
              ? 'POS_RESTAURANTE_BANCO'
              : 'POS_RESTAURANTE_CAJA'
            : 'POS_SERVICIOS_CAJA';
        await postByRuleInTransaction({
          tx,
          hotelId,
          eventCode: revRule,
          amount: Number(order.total_amount || 0),
          entryDate: today,
          description: `[REVERSIÓN] Anulación ${order.order_number}: ${effectiveReason}`,
          reference: order.order_number,
          sourceModule: 'SERVICE_ORDER_VOID',
          sourceId: order.id,
          invert: true,
          userId: req.user?.id || 1
        });
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'ANULAR_CONSUMO_SERVICIO', 'RESTAURANTE', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          order.id,
          `Anulación/Devolución autorizada de ${order.order_number} ($${order.total_amount}, estado previo ${order.status}). Motivo: ${effectiveReason}`,
          today
        ]
      );
    });

    const updated = await db.get('SELECT * FROM service_orders WHERE id = ?', [orderId]);
    const [hydrated] = await hydrateOrders(hotelId, [updated]);
    res.json({
      message: `Consumo ${hydrated.order_number} anulado y reversado correctamente.`,
      order: hydrated
    });
  } catch (error) {
    console.error('Error al anular consumo/comanda:', error);
    res.status(500).json({ error: 'Error al procesar la anulación o devolución.' });
  }
};

// 10. Reportes y Consultas de Ventas y Consumos por Servicio, Habitación y Turno
exports.getServiceReports = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const today = getTodayString();
    const fromDate = req.query.from_date ? formatDate(req.query.from_date) : today;
    const toDate = req.query.to_date ? formatDate(req.query.to_date) : today;
    const department =
      req.query.department && req.query.department !== 'ALL'
        ? normalizeDepartment(req.query.department)
        : null;
    const roomId = req.query.room_id ? Number(req.query.room_id) : null;
    const registerId = req.query.register_id ? Number(req.query.register_id) : null;
    const paymentMode =
      req.query.payment_mode && req.query.payment_mode !== 'ALL' ? req.query.payment_mode : null;

    let sql = `
      SELECT so.*,
             rt.number as table_number,
             r.number as room_number,
             g.first_name, g.last_name,
             cr.name as register_name, cr.shift as register_shift,
             cm.receipt_number,
             u1.full_name as created_by_name,
             u2.full_name as settled_by_name
      FROM service_orders so
      LEFT JOIN restaurant_tables rt ON so.table_id = rt.id
      LEFT JOIN rooms r ON so.room_id = r.id
      LEFT JOIN guests g ON so.guest_id = g.id
      LEFT JOIN cash_registers cr ON so.register_id = cr.id
      LEFT JOIN cash_movements cm ON so.cash_movement_id = cm.id
      LEFT JOIN users u1 ON so.created_by = u1.id
      LEFT JOIN users u2 ON so.settled_by = u2.id
      WHERE so.hotel_id = ?
        AND so.order_date >= ?
        AND so.order_date <= ?
    `;
    const params = [hotelId, fromDate, toDate];

    if (department) {
      sql += ' AND so.department = ?';
      params.push(department);
    }
    if (roomId) {
      sql += ' AND so.room_id = ?';
      params.push(roomId);
    }
    if (registerId) {
      sql += ' AND so.register_id = ?';
      params.push(registerId);
    }
    if (paymentMode) {
      sql += ' AND so.payment_mode = ?';
      params.push(paymentMode);
    }

    sql += ' ORDER BY so.id DESC';
    const rawOrders = await db.query(sql, params);
    const orders = await hydrateOrders(hotelId, rawOrders);

    const validOrders = orders.filter(
      (o) => o.status === 'PAGADA' || o.status === 'CARGADA_HABITACION'
    );

    // A. Agrupación por departamento / servicio
    const byDeptMap = new Map();
    for (const d of VALID_DEPARTMENTS) {
      byDeptMap.set(d, {
        department: d,
        label: DEPT_LABELS[d],
        orders_count: 0,
        direct_cash_total: 0,
        room_charge_total: 0,
        total_amount: 0
      });
    }

    // B. Agrupación por habitación
    const byRoomMap = new Map();
    // C. Agrupación por turno / caja
    const byShiftMap = new Map();
    // D. Agrupación por producto/servicio
    const byProductMap = new Map();

    let grandTotal = 0;
    let totalDirectCash = 0;
    let totalRoomCharge = 0;
    let voidedTotal = 0;

    for (const o of orders) {
      if (o.status === 'ANULADA') {
        voidedTotal += o.total_amount;
        continue;
      }
      if (!['PAGADA', 'CARGADA_HABITACION'].includes(o.status)) continue;

      grandTotal += o.total_amount;
      if (o.payment_mode === 'CAJA_DIRECTA') totalDirectCash += o.total_amount;
      if (o.payment_mode === 'CARGO_HABITACION') totalRoomCharge += o.total_amount;

      const dEntry = byDeptMap.get(o.department) || {
        department: o.department,
        label: DEPT_LABELS[o.department] || o.department,
        orders_count: 0,
        direct_cash_total: 0,
        room_charge_total: 0,
        total_amount: 0
      };
      dEntry.orders_count += 1;
      dEntry.total_amount += o.total_amount;
      if (o.payment_mode === 'CAJA_DIRECTA') dEntry.direct_cash_total += o.total_amount;
      if (o.payment_mode === 'CARGO_HABITACION') dEntry.room_charge_total += o.total_amount;
      byDeptMap.set(o.department, dEntry);

      if (o.room_id) {
        const rKey = String(o.room_id);
        const rEntry = byRoomMap.get(rKey) || {
          room_id: o.room_id,
          room_number: o.room_number || `#${o.room_id}`,
          orders_count: 0,
          charged_to_folio: 0,
          paid_direct: 0,
          total_amount: 0
        };
        rEntry.orders_count += 1;
        rEntry.total_amount += o.total_amount;
        if (o.payment_mode === 'CARGO_HABITACION') rEntry.charged_to_folio += o.total_amount;
        else rEntry.paid_direct += o.total_amount;
        byRoomMap.set(rKey, rEntry);
      }

      const shiftKey = o.register_id
        ? `REG-${o.register_id}`
        : o.payment_mode === 'CARGO_HABITACION'
        ? 'FOLIO-HAB'
        : 'SIN-CAJA';
      const sEntry = byShiftMap.get(shiftKey) || {
        key: shiftKey,
        register_id: o.register_id || null,
        register_name: o.register_id
          ? `${o.register_name || 'Caja'} (${o.register_shift || 'TURNO'})`
          : 'Cargos a Folio de Habitación',
        orders_count: 0,
        total_amount: 0
      };
      sEntry.orders_count += 1;
      sEntry.total_amount += o.total_amount;
      byShiftMap.set(shiftKey, sEntry);

      for (const it of o.items) {
        if (it.status === 'ANULADO') continue;
        const pKey = `${it.department}::${it.item_name}`;
        const pEntry = byProductMap.get(pKey) || {
          department: it.department,
          department_label: DEPT_LABELS[it.department] || it.department,
          item_name: it.item_name,
          quantity_sold: 0,
          total_sales: 0
        };
        pEntry.quantity_sold += Number(it.quantity || 0);
        pEntry.total_sales += Number(it.subtotal || 0);
        byProductMap.set(pKey, pEntry);
      }
    }

    const registers = await db.query(
      `SELECT id, name, shift, status, opening_time
       FROM cash_registers
       WHERE hotel_id = ?
       ORDER BY id DESC LIMIT 30`,
      [hotelId]
    );
    const rooms = await db.query(
      'SELECT id, number, floor FROM rooms WHERE hotel_id = ? AND active = 1 ORDER BY number ASC',
      [hotelId]
    );

    res.json({
      period: { from_date: fromDate, to_date: toDate },
      summary: {
        orders_count: validOrders.length,
        grand_total: grandTotal,
        direct_cash_total: totalDirectCash,
        room_charge_total: totalRoomCharge,
        voided_total: voidedTotal
      },
      by_department: Array.from(byDeptMap.values()).filter((d) => d.orders_count > 0 || !department),
      by_room: Array.from(byRoomMap.values()).sort((a, b) => b.total_amount - a.total_amount),
      by_shift: Array.from(byShiftMap.values()).sort((a, b) => b.total_amount - a.total_amount),
      by_product: Array.from(byProductMap.values()).sort((a, b) => b.total_sales - a.total_sales),
      filters_meta: { registers, rooms },
      orders
    });
  } catch (error) {
    console.error('Error al generar reportes de servicios:', error);
    res.status(500).json({ error: 'Error al generar el reporte de ventas y consumos.' });
  }
};
