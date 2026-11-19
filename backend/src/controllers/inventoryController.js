const db = require('../config/db');
const { getTodayString, formatDate } = require('../utils/date');
const { postByRuleInTransaction } = require('./accountingController');

const VALID_DEPARTMENTS = [
  'RESTAURANTE',
  'MINIBAR',
  'AMENIDADES',
  'ASEO',
  'LENCERIA',
  'MANTENIMIENTO',
  'GENERAL'
];

const DEFAULT_LOCATIONS = [
  'Bodega Principal',
  'Cocina / Restaurante',
  'Bar / Minibar',
  'Cuarto de Lencería / Aseo',
  'Recepción',
  'Mantenimiento'
];

const normalizeDept = (dept) => {
  const upper = String(dept || 'GENERAL')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  return VALID_DEPARTMENTS.includes(upper) ? upper : 'GENERAL';
};

const computeStockStatus = (stock, minStock, reorderPoint) => {
  const s = Number(stock || 0);
  const m = Number(minStock || 0);
  const r = Number(reorderPoint || 0);
  if (s <= 0) return 'AGOTADO';
  if (m > 0 && s <= m) return 'CRITICO';
  if (r > 0 && s <= r) return 'REPOSICION';
  return 'NORMAL';
};

const buildPurchaseNumber = (hotelId, purchaseId) =>
  `OC-H${hotelId}-${String(purchaseId).padStart(5, '0')}`;

const buildReceiptNumber = (hotelId, isIncome, movementId) => {
  const prefix = isIncome ? 'RC' : 'CE';
  return `${prefix}-H${hotelId}-${String(movementId).padStart(5, '0')}`;
};

const enrichProduct = (p) => {
  const stock = Number(p.stock || 0);
  const minStock = Number(p.min_stock || 0);
  const reorderPoint = Number(p.reorder_point || 0);
  const cost = Number(p.cost || 0);
  const stockStatus = computeStockStatus(stock, minStock, reorderPoint);
  const suggestedOrderQty =
    stockStatus === 'NORMAL'
      ? 0
      : Math.max(1, Math.ceil(Math.max(reorderPoint, minStock, 5) * 1.5 - stock));

  return {
    ...p,
    cost,
    last_cost: Number(p.last_cost || cost),
    price: Number(p.price || 0),
    stock,
    min_stock: minStock,
    reorder_point: reorderPoint,
    active: Number(p.active ?? 1),
    valuation: Math.round(stock * cost * 100) / 100,
    stock_status: stockStatus,
    suggested_order_qty: suggestedOrderQty
  };
};

// Helper exportado para descontar insumos al liquidar ventas/servicios POS (Bloque 9 + Bloque 10)
const applyServiceConsumptionInTransaction = async ({
  tx,
  hotelId,
  order,
  activeItems,
  userId,
  today,
  nowIso
}) => {
  const deductedSummary = [];

  for (const item of activeItems) {
    if (!item.catalog_id) continue;
    const soldQty = Number(item.quantity || 0);
    if (soldQty <= 0) continue;

    // 1. Buscar receta / ficha técnica del ítem de catálogo
    const recipes = await tx.query(
      `SELECT sr.*, ip.id as inv_id, ip.name as inv_name, ip.stock as inv_stock,
              ip.cost as inv_cost, ip.location as inv_location, ip.department as inv_dept
       FROM service_recipes sr
       JOIN inventory_products ip ON sr.inventory_product_id = ip.id
       WHERE sr.hotel_id = ? AND sr.catalog_id = ?`,
      [hotelId, item.catalog_id]
    );

    const targets = [];
    if (recipes.length > 0) {
      for (const r of recipes) {
        targets.push({
          productId: r.inv_id,
          name: r.inv_name,
          qtyToDeduct: Math.round(Number(r.quantity || 0) * soldQty * 1000) / 1000,
          cost: Number(r.inv_cost || 0),
          location: r.inv_location || 'Bodega Principal',
          department: r.inv_dept || order.department || 'RESTAURANTE'
        });
      }
    } else {
      // 2. Respaldo: enlace directo 1:1 en service_catalog.inventory_product_id
      const catRow = await tx.get(
        `SELECT sc.inventory_product_id, ip.name as inv_name, ip.cost as inv_cost,
                ip.location as inv_location, ip.department as inv_dept
         FROM service_catalog sc
         JOIN inventory_products ip ON sc.inventory_product_id = ip.id
         WHERE sc.id = ? AND sc.hotel_id = ?`,
        [item.catalog_id, hotelId]
      );
      if (catRow && catRow.inventory_product_id) {
        targets.push({
          productId: catRow.inventory_product_id,
          name: catRow.inv_name,
          qtyToDeduct: soldQty,
          cost: Number(catRow.inv_cost || 0),
          location: catRow.inv_location || 'Bodega Principal',
          department: catRow.inv_dept || order.department || 'RESTAURANTE'
        });
      }
    }

    for (const t of targets) {
      if (t.qtyToDeduct <= 0) continue;
      const prod = await tx.get(
        'SELECT id, stock, cost FROM inventory_products WHERE id = ? AND hotel_id = ?',
        [t.productId, hotelId]
      );
      if (!prod) continue;

      const prevStock = Number(prod.stock || 0);
      const newStock = Math.round((prevStock - t.qtyToDeduct) * 1000) / 1000;
      const unitCost = Number(prod.cost || t.cost || 0);

      await tx.run(
        'UPDATE inventory_products SET stock = ?, updated_at = ? WHERE id = ? AND hotel_id = ?',
        [newStock, today, prod.id, hotelId]
      );

      await tx.run(
        `INSERT INTO inventory_movements (
          hotel_id, product_id, movement_type, direction, quantity, unit_cost, total_cost,
          previous_stock, new_stock, department, source_location, target_location,
          reference_type, reference_id, reference_code, notes, user_id, movement_date, created_at
        ) VALUES (?, ?, 'SALIDA_VENTA_POS', 'OUT', ?, ?, ?, ?, ?, ?, ?, 'Consumo POS / Huésped', 'SERVICE_ORDER', ?, ?, ?, ?, ?, ?)`,
        [
          hotelId,
          prod.id,
          t.qtyToDeduct,
          unitCost,
          Math.round(t.qtyToDeduct * unitCost * 100) / 100,
          prevStock,
          newStock,
          t.department,
          t.location,
          order.id,
          order.order_number,
          `Descuento automático por venta ${order.order_number}: ${soldQty}x ${item.item_name}`,
          userId || 1,
          today,
          nowIso
        ]
      );

      deductedSummary.push({ product_id: prod.id, name: t.name, qty: t.qtyToDeduct });
    }
  }

  return deductedSummary;
};

// Helper exportado para revertir consumo en Kardex al anular un pedido POS
const reverseServiceConsumptionInTransaction = async ({
  tx,
  hotelId,
  order,
  voidReason,
  userId,
  today,
  nowIso
}) => {
  const posMovements = await tx.query(
    `SELECT * FROM inventory_movements
     WHERE hotel_id = ? AND reference_type = 'SERVICE_ORDER' AND reference_id = ? AND movement_type = 'SALIDA_VENTA_POS'`,
    [hotelId, order.id]
  );

  for (const mov of posMovements) {
    const prod = await tx.get(
      'SELECT id, stock, cost, location FROM inventory_products WHERE id = ? AND hotel_id = ?',
      [mov.product_id, hotelId]
    );
    if (!prod) continue;

    const qty = Number(mov.quantity || 0);
    const prevStock = Number(prod.stock || 0);
    const newStock = Math.round((prevStock + qty) * 1000) / 1000;
    const unitCost = Number(mov.unit_cost || prod.cost || 0);

    await tx.run(
      'UPDATE inventory_products SET stock = ?, updated_at = ? WHERE id = ? AND hotel_id = ?',
      [newStock, today, prod.id, hotelId]
    );

    await tx.run(
      `INSERT INTO inventory_movements (
        hotel_id, product_id, movement_type, direction, quantity, unit_cost, total_cost,
        previous_stock, new_stock, department, source_location, target_location,
        reference_type, reference_id, reference_code, notes, user_id, movement_date, created_at
      ) VALUES (?, ?, 'DEVOLUCION_POS', 'IN', ?, ?, ?, ?, ?, ?, 'Anulación POS', ?, 'SERVICE_ORDER', ?, ?, ?, ?, ?, ?)`,
      [
        hotelId,
        prod.id,
        qty,
        unitCost,
        Math.round(qty * unitCost * 100) / 100,
        prevStock,
        newStock,
        mov.department || 'RESTAURANTE',
        prod.location || mov.source_location || 'Bodega Principal',
        order.id,
        order.order_number,
        `Reintegro automático por anulación ${order.order_number}: ${voidReason}`,
        userId || 1,
        today,
        nowIso
      ]
    );
  }
};

// 1. Overview completo de Inventario, Compras, Proveedores, Kardex, Recetas y Alertas
exports.getOverview = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const today = getTodayString();
    const currentMonth = today.substring(0, 7);

    const rawProducts = await db.query(
      `SELECT ip.*, s.name as preferred_supplier_name
       FROM inventory_products ip
       LEFT JOIN suppliers s ON ip.preferred_supplier_id = s.id
       WHERE ip.hotel_id = ?
       ORDER BY ip.active DESC, ip.department ASC, ip.name ASC`,
      [hotelId]
    );
    const products = rawProducts.map(enrichProduct);

    const alerts = products
      .filter((p) => p.active === 1 && p.stock_status !== 'NORMAL')
      .sort((a, b) => {
        const order = { AGOTADO: 0, CRITICO: 1, REPOSICION: 2, NORMAL: 3 };
        return (order[a.stock_status] ?? 3) - (order[b.stock_status] ?? 3);
      });

    const suppliers = await db.query(
      'SELECT * FROM suppliers WHERE hotel_id = ? ORDER BY active DESC, name ASC',
      [hotelId]
    );

    const rawPurchases = await db.query(
      `SELECT po.*, s.name as supplier_name, u.full_name as created_by_name, u2.full_name as received_by_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       LEFT JOIN users u ON po.created_by = u.id
       LEFT JOIN users u2 ON po.received_by = u2.id
       WHERE po.hotel_id = ?
       ORDER BY po.id DESC
       LIMIT 50`,
      [hotelId]
    );

    let purchases = rawPurchases;
    if (rawPurchases.length > 0) {
      const pIds = rawPurchases.map((p) => p.id);
      const ph = pIds.map(() => '?').join(',');
      const pItems = await db.query(
        `SELECT poi.*, ip.sku, ip.unit
         FROM purchase_order_items poi
         LEFT JOIN inventory_products ip ON poi.product_id = ip.id
         WHERE poi.hotel_id = ? AND poi.purchase_id IN (${ph})
         ORDER BY poi.id ASC`,
        [hotelId, ...pIds]
      );
      const itemMap = new Map();
      for (const it of pItems) {
        if (!itemMap.has(it.purchase_id)) itemMap.set(it.purchase_id, []);
        itemMap.get(it.purchase_id).push({
          ...it,
          quantity: Number(it.quantity || 0),
          unit_cost: Number(it.unit_cost || 0),
          subtotal: Number(it.subtotal || 0)
        });
      }
      purchases = rawPurchases.map((p) => ({
        ...p,
        subtotal: Number(p.subtotal || 0),
        tax_amount: Number(p.tax_amount || 0),
        total_amount: Number(p.total_amount || 0),
        items: itemMap.get(p.id) || []
      }));
    }

    const recentMovements = await db.query(
      `SELECT im.*, ip.name as product_name, ip.sku as product_sku, ip.unit as product_unit,
              u.full_name as user_name
       FROM inventory_movements im
       JOIN inventory_products ip ON im.product_id = ip.id
       LEFT JOIN users u ON im.user_id = u.id
       WHERE im.hotel_id = ?
       ORDER BY im.id DESC
       LIMIT 80`,
      [hotelId]
    );

    const serviceCatalog = await db.query(
      `SELECT id, department, category, code, name, price, unit, inventory_product_id, active
       FROM service_catalog
       WHERE hotel_id = ? AND active = 1
       ORDER BY department ASC, name ASC`,
      [hotelId]
    );

    const recipeRows = await db.query(
      `SELECT sr.*, ip.name as product_name, ip.sku, ip.cost as product_cost, ip.unit as product_unit, ip.stock as product_stock
       FROM service_recipes sr
       JOIN inventory_products ip ON sr.inventory_product_id = ip.id
       WHERE sr.hotel_id = ?
       ORDER BY sr.id ASC`,
      [hotelId]
    );

    const openRegisters = await db.query(
      `SELECT id, name, shift, operation_point
       FROM cash_registers
       WHERE hotel_id = ? AND status = 'ABIERTA'
       ORDER BY id DESC`,
      [hotelId]
    );

    const paymentMethods = await db.query(
      'SELECT id, name, code, type FROM hotel_payment_methods WHERE hotel_id = ? AND active = 1 ORDER BY id ASC',
      [hotelId]
    );

    const activeProducts = products.filter((p) => p.active === 1);
    const totalValuation = activeProducts.reduce((acc, p) => acc + p.valuation, 0);
    const purchasesMonthTotal = purchases
      .filter((p) => p.status === 'RECIBIDA' && String(p.purchase_date || '').startsWith(currentMonth))
      .reduce((acc, p) => acc + Number(p.total_amount || 0), 0);

    res.json({
      products,
      alerts,
      suppliers,
      purchases,
      recent_movements: recentMovements.map((m) => ({
        ...m,
        quantity: Number(m.quantity || 0),
        unit_cost: Number(m.unit_cost || 0),
        total_cost: Number(m.total_cost || 0),
        previous_stock: Number(m.previous_stock || 0),
        new_stock: Number(m.new_stock || 0)
      })),
      service_catalog: serviceCatalog.map((sc) => ({
        ...sc,
        price: Number(sc.price || 0),
        recipes: recipeRows
          .filter((r) => r.catalog_id === sc.id)
          .map((r) => ({
            ...r,
            quantity: Number(r.quantity || 0),
            product_cost: Number(r.product_cost || 0),
            line_cost: Math.round(Number(r.quantity || 0) * Number(r.product_cost || 0) * 100) / 100
          }))
      })),
      open_registers: openRegisters,
      payment_methods: paymentMethods,
      locations: DEFAULT_LOCATIONS,
      kpis: {
        total_products: activeProducts.length,
        total_valuation: Math.round(totalValuation * 100) / 100,
        out_of_stock_count: alerts.filter((a) => a.stock_status === 'AGOTADO').length,
        low_stock_count: alerts.filter((a) => a.stock_status === 'CRITICO').length,
        reorder_alerts_count: alerts.length,
        purchases_month_total: Math.round(purchasesMonthTotal * 100) / 100,
        movements_today_count: recentMovements.filter((m) => m.movement_date === today).length
      }
    });
  } catch (error) {
    console.error('Error al cargar módulo de inventario:', error);
    res.status(500).json({ error: 'Error al cargar el módulo de inventario y compras.' });
  }
};

// 2. CRUD de Productos / Insumos de Inventario
exports.listProducts = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { department, active_only, search } = req.query;

    let sql = `
      SELECT ip.*, s.name as preferred_supplier_name
      FROM inventory_products ip
      LEFT JOIN suppliers s ON ip.preferred_supplier_id = s.id
      WHERE ip.hotel_id = ?
    `;
    const params = [hotelId];

    if (department && department !== 'ALL') {
      sql += ' AND ip.department = ?';
      params.push(normalizeDept(department));
    }
    if (active_only === '1' || active_only === 'true') {
      sql += ' AND ip.active = 1';
    }
    sql += ' ORDER BY ip.department ASC, ip.name ASC';

    let rows = (await db.query(sql, params)).map(enrichProduct);
    if (search && String(search).trim()) {
      const q = String(search).toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.sku || '').toLowerCase().includes(q) ||
          (r.category || '').toLowerCase().includes(q)
      );
    }

    res.json(rows);
  } catch (error) {
    console.error('Error al listar productos de inventario:', error);
    res.status(500).json({ error: 'Error al listar productos de inventario.' });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      sku,
      department,
      category,
      name,
      unit,
      cost,
      price,
      stock,
      min_stock,
      reorder_point,
      location,
      preferred_supplier_id
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'El nombre del insumo o producto es obligatorio.' });
    }

    const numCost = Math.max(0, Number(cost || 0));
    const numPrice = Math.max(0, Number(price || 0));
    const numStock = Math.max(0, Number(stock || 0));
    const numMin = Math.max(0, Number(min_stock || 0));
    const numReorder = Math.max(0, Number(reorder_point || numMin || 0));
    const dept = normalizeDept(department);
    const resolvedLoc = (location || 'Bodega Principal').trim();
    const today = getTodayString();
    const nowIso = new Date().toISOString();

    const created = await db.withTransaction(async (tx) => {
      const ins = await tx.run(
        `INSERT INTO inventory_products (
          hotel_id, sku, department, category, name, unit, cost, last_cost,
          price, stock, min_stock, reorder_point, location, preferred_supplier_id, active, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        [
          hotelId,
          (sku || '').trim(),
          dept,
          (category || 'General').trim(),
          String(name).trim(),
          (unit || 'UND').trim(),
          numCost,
          numCost,
          numPrice,
          numStock,
          numMin,
          numReorder,
          resolvedLoc,
          preferred_supplier_id ? Number(preferred_supplier_id) : null,
          today
        ]
      );

      if (numStock > 0) {
        await tx.run(
          `INSERT INTO inventory_movements (
            hotel_id, product_id, movement_type, direction, quantity, unit_cost, total_cost,
            previous_stock, new_stock, department, source_location, target_location,
            reference_type, reference_code, notes, user_id, movement_date, created_at
          ) VALUES (?, ?, 'ENTRADA_AJUSTE', 'IN', ?, ?, ?, 0, ?, ?, 'Saldo Inicial', ?, 'MANUAL', 'ALTA-PROD', 'Stock inicial al crear producto', ?, ?, ?)`,
          [
            hotelId,
            ins.id,
            numStock,
            numCost,
            Math.round(numStock * numCost * 100) / 100,
            numStock,
            dept,
            resolvedLoc,
            req.user?.id || 1,
            today,
            nowIso
          ]
        );
      }

      return tx.get('SELECT * FROM inventory_products WHERE id = ?', [ins.id]);
    });

    res.status(201).json({
      message: 'Producto registrado en el inventario.',
      product: enrichProduct(created)
    });
  } catch (error) {
    console.error('Error al crear producto de inventario:', error);
    res.status(500).json({ error: 'Error al crear el producto en inventario.' });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const productId = Number(req.params.productId);
    const existing = await db.get(
      'SELECT * FROM inventory_products WHERE id = ? AND hotel_id = ?',
      [productId, hotelId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Producto de inventario no encontrado.' });
    }

    const {
      sku,
      department,
      category,
      name,
      unit,
      cost,
      price,
      min_stock,
      reorder_point,
      location,
      preferred_supplier_id,
      active
    } = req.body;

    const today = getTodayString();
    const nextCost = cost !== undefined ? Math.max(0, Number(cost)) : Number(existing.cost || 0);

    await db.run(
      `UPDATE inventory_products
       SET sku = ?, department = ?, category = ?, name = ?, unit = ?,
           cost = ?, price = ?, min_stock = ?, reorder_point = ?,
           location = ?, preferred_supplier_id = ?, active = ?, updated_at = ?
       WHERE id = ? AND hotel_id = ?`,
      [
        sku !== undefined ? String(sku).trim() : existing.sku,
        department ? normalizeDept(department) : existing.department || 'GENERAL',
        category !== undefined ? String(category).trim() : existing.category,
        name !== undefined && String(name).trim() ? String(name).trim() : existing.name,
        unit !== undefined ? String(unit).trim() : existing.unit,
        nextCost,
        price !== undefined ? Math.max(0, Number(price)) : Number(existing.price || 0),
        min_stock !== undefined ? Math.max(0, Number(min_stock)) : Number(existing.min_stock || 0),
        reorder_point !== undefined
          ? Math.max(0, Number(reorder_point))
          : Number(existing.reorder_point || 0),
        location !== undefined ? String(location).trim() : existing.location,
        preferred_supplier_id !== undefined
          ? preferred_supplier_id
            ? Number(preferred_supplier_id)
            : null
          : existing.preferred_supplier_id,
        active !== undefined ? (active ? 1 : 0) : existing.active,
        today,
        productId,
        hotelId
      ]
    );

    const updated = await db.get('SELECT * FROM inventory_products WHERE id = ?', [productId]);
    res.json({ message: 'Producto actualizado correctamente.', product: enrichProduct(updated) });
  } catch (error) {
    console.error('Error al actualizar producto de inventario:', error);
    res.status(500).json({ error: 'Error al actualizar el producto.' });
  }
};

exports.toggleProduct = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const productId = Number(req.params.productId);
    const existing = await db.get(
      'SELECT * FROM inventory_products WHERE id = ? AND hotel_id = ?',
      [productId, hotelId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    const nextActive = Number(existing.active) === 1 ? 0 : 1;
    await db.run('UPDATE inventory_products SET active = ? WHERE id = ? AND hotel_id = ?', [
      nextActive,
      productId,
      hotelId
    ]);
    res.json({ message: nextActive ? 'Producto activado.' : 'Producto desactivado.', active: nextActive });
  } catch (error) {
    console.error('Error al cambiar estado de producto:', error);
    res.status(500).json({ error: 'Error al cambiar el estado del producto.' });
  }
};

// 3. Alertas de Stock Mínimo y Punto de Reposición
exports.getAlerts = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const rows = await db.query(
      `SELECT ip.*, s.name as preferred_supplier_name, s.phone as preferred_supplier_phone
       FROM inventory_products ip
       LEFT JOIN suppliers s ON ip.preferred_supplier_id = s.id
       WHERE ip.hotel_id = ? AND ip.active = 1
       ORDER BY ip.stock ASC`,
      [hotelId]
    );
    const alerts = rows
      .map(enrichProduct)
      .filter((p) => p.stock_status !== 'NORMAL');
    res.json(alerts);
  } catch (error) {
    console.error('Error al consultar alertas de stock:', error);
    res.status(500).json({ error: 'Error al consultar alertas de stock mínimo.' });
  }
};

// 4. Kardex Detallado por Producto
exports.getProductKardex = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const productId = Number(req.params.productId);
    const { from_date, to_date, movement_type } = req.query;

    const product = await db.get(
      `SELECT ip.*, s.name as preferred_supplier_name
       FROM inventory_products ip
       LEFT JOIN suppliers s ON ip.preferred_supplier_id = s.id
       WHERE ip.id = ? AND ip.hotel_id = ?`,
      [productId, hotelId]
    );
    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado en este establecimiento.' });
    }

    let sql = `
      SELECT im.*, u.full_name as user_name
      FROM inventory_movements im
      LEFT JOIN users u ON im.user_id = u.id
      WHERE im.hotel_id = ? AND im.product_id = ?
    `;
    const params = [hotelId, productId];

    if (from_date) {
      sql += ' AND im.movement_date >= ?';
      params.push(formatDate(from_date));
    }
    if (to_date) {
      sql += ' AND im.movement_date <= ?';
      params.push(formatDate(to_date));
    }
    if (movement_type && movement_type !== 'ALL') {
      sql += ' AND im.movement_type = ?';
      params.push(movement_type);
    }
    sql += ' ORDER BY im.id DESC';

    const movements = await db.query(sql, params);
    res.json({
      product: enrichProduct(product),
      movements: movements.map((m) => ({
        ...m,
        quantity: Number(m.quantity || 0),
        unit_cost: Number(m.unit_cost || 0),
        total_cost: Number(m.total_cost || 0),
        previous_stock: Number(m.previous_stock || 0),
        new_stock: Number(m.new_stock || 0)
      }))
    });
  } catch (error) {
    console.error('Error al consultar Kardex del producto:', error);
    res.status(500).json({ error: 'Error al consultar el Kardex del producto.' });
  }
};

// 5. Movimientos de Inventario (Entradas, Salidas/Consumos por Departamento, Ajustes Autorizados y Traslados)
exports.registerMovement = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      product_id,
      movement_type,
      quantity,
      unit_cost,
      department,
      source_location,
      target_location,
      notes,
      movement_date
    } = req.body;

    const validTypes = ['ENTRADA_AJUSTE', 'SALIDA_CONSUMO', 'SALIDA_AJUSTE', 'TRASLADO'];
    const mType = String(movement_type || '').trim().toUpperCase();
    if (!validTypes.includes(mType)) {
      return res.status(400).json({
        error: 'Tipo de movimiento inválido. Use ENTRADA_AJUSTE, SALIDA_CONSUMO, SALIDA_AJUSTE o TRASLADO.'
      });
    }

    const qty = Number(quantity);
    if (!product_id || isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Producto y cantidad mayor a cero son obligatorios.' });
    }

    if (mType === 'TRASLADO' && (!target_location || !String(target_location).trim())) {
      return res.status(400).json({ error: 'Para un traslado debe indicar la ubicación destino.' });
    }

    const mDate = movement_date ? formatDate(movement_date) : getTodayString();
    const nowIso = new Date().toISOString();

    const result = await db.withTransaction(async (tx) => {
      const prod = await tx.get(
        'SELECT * FROM inventory_products WHERE id = ? AND hotel_id = ?',
        [Number(product_id), hotelId]
      );
      if (!prod) {
        const err = new Error('Producto de inventario no encontrado en este hotel.');
        err.statusCode = 404;
        throw err;
      }

      const prevStock = Number(prod.stock || 0);
      const effectiveCost =
        unit_cost !== undefined && unit_cost !== '' ? Math.max(0, Number(unit_cost)) : Number(prod.cost || 0);

      let newStock = prevStock;
      let direction = 'IN';
      let nextLocation = prod.location || 'Bodega Principal';
      const resolvedSrcLoc = (source_location || prod.location || 'Bodega Principal').trim();
      let resolvedTargetLoc = (target_location || prod.location || 'Bodega Principal').trim();
      const dept = department ? normalizeDept(department) : prod.department || 'GENERAL';

      if (mType === 'ENTRADA_AJUSTE') {
        direction = 'IN';
        newStock = Math.round((prevStock + qty) * 1000) / 1000;
        const avgCost =
          prevStock >= 0 && prevStock + qty > 0 && unit_cost !== undefined && unit_cost !== ''
            ? Math.round(((prevStock * Number(prod.cost || 0) + qty * effectiveCost) / (prevStock + qty)) * 100) / 100
            : Number(prod.cost || 0);

        await tx.run(
          'UPDATE inventory_products SET stock = ?, cost = ?, last_cost = ?, updated_at = ? WHERE id = ? AND hotel_id = ?',
          [newStock, avgCost, effectiveCost, mDate, prod.id, hotelId]
        );
      } else if (mType === 'SALIDA_CONSUMO' || mType === 'SALIDA_AJUSTE') {
        direction = 'OUT';
        if (prevStock < qty) {
          const err = new Error(
            `Stock insuficiente para "${prod.name}". Disponible: ${prevStock} ${prod.unit}, solicitado: ${qty}.`
          );
          err.statusCode = 400;
          throw err;
        }
        newStock = Math.round((prevStock - qty) * 1000) / 1000;
        if (!target_location) {
          resolvedTargetLoc = mType === 'SALIDA_CONSUMO' ? `Consumo ${dept}` : 'Ajuste / Baja';
        }
        await tx.run(
          'UPDATE inventory_products SET stock = ?, updated_at = ? WHERE id = ? AND hotel_id = ?',
          [newStock, mDate, prod.id, hotelId]
        );
      } else if (mType === 'TRASLADO') {
        direction = 'TRANSFER';
        if (prevStock < qty) {
          const err = new Error(
            `Cantidad a trasladar excede la existencia actual (${prevStock} ${prod.unit}).`
          );
          err.statusCode = 400;
          throw err;
        }
        newStock = prevStock;
        nextLocation = resolvedTargetLoc;
        await tx.run(
          'UPDATE inventory_products SET location = ?, updated_at = ? WHERE id = ? AND hotel_id = ?',
          [nextLocation, mDate, prod.id, hotelId]
        );
      }

      const totalCost = Math.round(qty * effectiveCost * 100) / 100;
      const movIns = await tx.run(
        `INSERT INTO inventory_movements (
          hotel_id, product_id, movement_type, direction, quantity, unit_cost, total_cost,
          previous_stock, new_stock, department, source_location, target_location,
          reference_type, reference_code, notes, user_id, movement_date, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL', ?, ?, ?, ?, ?)`,
        [
          hotelId,
          prod.id,
          mType,
          direction,
          qty,
          effectiveCost,
          totalCost,
          prevStock,
          newStock,
          dept,
          resolvedSrcLoc,
          resolvedTargetLoc,
          `MOV-${Date.now().toString().slice(-6)}`,
          (notes || '').trim() || `${mType} (${dept})`,
          req.user?.id || 1,
          mDate,
          nowIso
        ]
      );

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'MOVIMIENTO_INVENTARIO', 'INVENTARIO', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          prod.id,
          `[${mType}] ${prod.name}: ${qty} ${prod.unit} (${prevStock} -> ${newStock}) · Depto: ${dept}`,
          mDate
        ]
      );

      return tx.get('SELECT * FROM inventory_movements WHERE id = ?', [movIns.id]);
    });

    res.status(201).json({
      message: 'Movimiento de inventario registrado en el Kardex.',
      movement: {
        ...result,
        quantity: Number(result.quantity),
        previous_stock: Number(result.previous_stock),
        new_stock: Number(result.new_stock)
      }
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al registrar movimiento de inventario:', error);
    res.status(500).json({ error: 'Error interno al registrar el movimiento de inventario.' });
  }
};

// 6. CRUD de Proveedores
exports.listSuppliers = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const rows = await db.query(
      'SELECT * FROM suppliers WHERE hotel_id = ? ORDER BY active DESC, name ASC',
      [hotelId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al listar proveedores:', error);
    res.status(500).json({ error: 'Error al listar los proveedores.' });
  }
};

exports.createSupplier = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { name, tax_id, contact_name, phone, email, address, category, payment_terms, notes } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'El nombre o razón social del proveedor es obligatorio.' });
    }

    const today = getTodayString();
    const ins = await db.run(
      `INSERT INTO suppliers (
        hotel_id, name, tax_id, contact_name, phone, email, address, category, payment_terms, notes, active, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        hotelId,
        String(name).trim(),
        (tax_id || '').trim(),
        (contact_name || '').trim(),
        (phone || '').trim(),
        (email || '').trim(),
        (address || '').trim(),
        (category || 'General').trim(),
        (payment_terms || 'Contado').trim(),
        (notes || '').trim(),
        today
      ]
    );

    const created = await db.get('SELECT * FROM suppliers WHERE id = ?', [ins.id]);
    res.status(201).json({ message: 'Proveedor creado correctamente.', supplier: created });
  } catch (error) {
    console.error('Error al crear proveedor:', error);
    res.status(500).json({ error: 'Error al crear el proveedor.' });
  }
};

exports.updateSupplier = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const supplierId = Number(req.params.supplierId);
    const existing = await db.get(
      'SELECT * FROM suppliers WHERE id = ? AND hotel_id = ?',
      [supplierId, hotelId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Proveedor no encontrado.' });
    }

    const { name, tax_id, contact_name, phone, email, address, category, payment_terms, notes, active } =
      req.body;
    await db.run(
      `UPDATE suppliers
       SET name = ?, tax_id = ?, contact_name = ?, phone = ?, email = ?,
           address = ?, category = ?, payment_terms = ?, notes = ?, active = ?
       WHERE id = ? AND hotel_id = ?`,
      [
        name !== undefined && String(name).trim() ? String(name).trim() : existing.name,
        tax_id !== undefined ? String(tax_id).trim() : existing.tax_id,
        contact_name !== undefined ? String(contact_name).trim() : existing.contact_name,
        phone !== undefined ? String(phone).trim() : existing.phone,
        email !== undefined ? String(email).trim() : existing.email,
        address !== undefined ? String(address).trim() : existing.address,
        category !== undefined ? String(category).trim() : existing.category,
        payment_terms !== undefined ? String(payment_terms).trim() : existing.payment_terms,
        notes !== undefined ? String(notes).trim() : existing.notes,
        active !== undefined ? (active ? 1 : 0) : existing.active,
        supplierId,
        hotelId
      ]
    );

    const updated = await db.get('SELECT * FROM suppliers WHERE id = ?', [supplierId]);
    res.json({ message: 'Proveedor actualizado.', supplier: updated });
  } catch (error) {
    console.error('Error al actualizar proveedor:', error);
    res.status(500).json({ error: 'Error al actualizar el proveedor.' });
  }
};

exports.toggleSupplier = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const supplierId = Number(req.params.supplierId);
    const existing = await db.get(
      'SELECT * FROM suppliers WHERE id = ? AND hotel_id = ?',
      [supplierId, hotelId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Proveedor no encontrado.' });
    }
    const nextActive = Number(existing.active) === 1 ? 0 : 1;
    await db.run('UPDATE suppliers SET active = ? WHERE id = ? AND hotel_id = ?', [
      nextActive,
      supplierId,
      hotelId
    ]);
    res.json({ message: nextActive ? 'Proveedor activado.' : 'Proveedor desactivado.', active: nextActive });
  } catch (error) {
    console.error('Error al cambiar estado de proveedor:', error);
    res.status(500).json({ error: 'Error al cambiar el estado del proveedor.' });
  }
};

// 7. Órdenes y Facturas de Compra (Con actualización automática de existencias, costo promedio y Kardex)
const receivePurchaseInTransaction = async ({
  tx,
  hotelId,
  purchase,
  items,
  registerInCash,
  registerId,
  paymentMethod,
  userId,
  today,
  nowIso
}) => {
  for (const item of items) {
    const prod = await tx.get(
      'SELECT * FROM inventory_products WHERE id = ? AND hotel_id = ?',
      [item.product_id, hotelId]
    );
    if (!prod) {
      const err = new Error(`Producto #${item.product_id} no existe en el hotel.`);
      err.statusCode = 404;
      throw err;
    }

    const qty = Number(item.quantity || 0);
    const unitCost = Number(item.unit_cost || 0);
    const prevStock = Number(prod.stock || 0);
    const newStock = Math.round((prevStock + qty) * 1000) / 1000;

    const baseStockForAvg = Math.max(0, prevStock);
    const avgCost =
      baseStockForAvg + qty > 0
        ? Math.round(((baseStockForAvg * Number(prod.cost || 0) + qty * unitCost) / (baseStockForAvg + qty)) * 100) /
          100
        : unitCost;

    await tx.run(
      `UPDATE inventory_products
       SET stock = ?, cost = ?, last_cost = ?, updated_at = ?
       WHERE id = ? AND hotel_id = ?`,
      [newStock, avgCost, unitCost, today, prod.id, hotelId]
    );

    await tx.run(
      `INSERT INTO inventory_movements (
        hotel_id, product_id, movement_type, direction, quantity, unit_cost, total_cost,
        previous_stock, new_stock, department, source_location, target_location,
        reference_type, reference_id, reference_code, notes, user_id, movement_date, created_at
      ) VALUES (?, ?, 'ENTRADA_COMPRA', 'IN', ?, ?, ?, ?, ?, ?, 'Proveedor', ?, 'PURCHASE', ?, ?, ?, ?, ?, ?)`,
      [
        hotelId,
        prod.id,
        qty,
        unitCost,
        Math.round(qty * unitCost * 100) / 100,
        prevStock,
        newStock,
        prod.department || 'GENERAL',
        item.location || prod.location || 'Bodega Principal',
        purchase.id,
        purchase.order_number,
        `Compra ${purchase.order_number}${purchase.invoice_number ? ' · Fact. ' + purchase.invoice_number : ''}`,
        userId || 1,
        purchase.purchase_date || today,
        nowIso
      ]
    );
  }

  let linkedCashMovId = null;
  let usedRegisterId = registerId ? Number(registerId) : null;
  if (registerInCash && Number(purchase.total_amount || 0) > 0) {
    let targetReg = null;
    if (usedRegisterId) {
      targetReg = await tx.get(
        'SELECT * FROM cash_registers WHERE id = ? AND hotel_id = ? AND status = \'ABIERTA\'',
        [usedRegisterId, hotelId]
      );
    }
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
    usedRegisterId = targetReg.id;

    const movIns = await tx.run(
      `INSERT INTO cash_movements (
        hotel_id, register_id, type, movement_subtype, amount,
        category, payment_method, description, reference, date, user_id, voided, created_at
      ) VALUES (?, ?, 'EGRESO', 'EGRESO', ?, 'Compras e Inventario', ?, ?, ?, ?, ?, 0, ?)`,
      [
        hotelId,
        targetReg.id,
        Number(purchase.total_amount),
        paymentMethod || purchase.payment_method || 'Efectivo',
        `Pago Compra ${purchase.order_number}${purchase.invoice_number ? ' (Fact. ' + purchase.invoice_number + ')' : ''}`,
        purchase.invoice_number || purchase.order_number,
        purchase.purchase_date || today,
        userId || 1,
        nowIso
      ]
    );
    linkedCashMovId = movIns.id;
    const rc = buildReceiptNumber(hotelId, false, movIns.id);
    await tx.run('UPDATE cash_movements SET receipt_number = ? WHERE id = ?', [rc, movIns.id]);
  }

  await tx.run(
    `UPDATE purchase_orders
     SET status = 'RECIBIDA', received_by = ?, received_at = ?, register_id = ?, cash_movement_id = ?
     WHERE id = ? AND hotel_id = ?`,
    [userId || 1, nowIso, usedRegisterId, linkedCashMovId, purchase.id, hotelId]
  );

  await tx.run(
    `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
     VALUES (?, ?, 'COMPRA_INVENTARIO', 'INVENTARIO', ?, ?, ?)`,
    [
      hotelId,
      userId || 1,
      purchase.id,
      `Recepción de compra ${purchase.order_number} por $${purchase.total_amount} (${items.length} ítems)`,
      today
    ]
  );

  await postByRuleInTransaction({
    tx,
    hotelId,
    eventCode: linkedCashMovId ? 'COMPRA_INVENTARIO_CONTADO' : 'COMPRA_INVENTARIO_CREDITO',
    amount: Number(purchase.total_amount || 0),
    entryDate: purchase.purchase_date || today,
    description: `Compra Inventario ${purchase.order_number}${purchase.invoice_number ? ' Fact. ' + purchase.invoice_number : ''}`,
    reference: purchase.order_number,
    sourceModule: 'PURCHASE_ORDER',
    sourceId: purchase.id,
    userId: userId || 1
  });
};

exports.listPurchases = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const rows = await db.query(
      `SELECT po.*, s.name as supplier_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.hotel_id = ?
       ORDER BY po.id DESC
       LIMIT 100`,
      [hotelId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error al listar compras:', error);
    res.status(500).json({ error: 'Error al consultar las compras.' });
  }
};

exports.createPurchase = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      supplier_id,
      invoice_number,
      purchase_date,
      status,
      payment_method,
      register_id,
      register_in_cash,
      tax_amount,
      notes,
      items
    } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Debe incluir al menos un producto en la compra.' });
    }

    const pDate = purchase_date ? formatDate(purchase_date) : getTodayString();
    const today = getTodayString();
    const nowIso = new Date().toISOString();
    const targetStatus = String(status || 'RECIBIDA').trim().toUpperCase() === 'BORRADOR' ? 'BORRADOR' : 'RECIBIDA';
    const numTax = Math.max(0, Number(tax_amount || 0));

    const createdPurchase = await db.withTransaction(async (tx) => {
      if (supplier_id) {
        const sup = await tx.get('SELECT id FROM suppliers WHERE id = ? AND hotel_id = ?', [
          Number(supplier_id),
          hotelId
        ]);
        if (!sup) {
          const err = new Error('El proveedor seleccionado no pertenece a este establecimiento.');
          err.statusCode = 404;
          throw err;
        }
      }

      const resolvedItems = [];
      let subtotal = 0;

      for (const raw of items) {
        const prodId = Number(raw.product_id);
        const qty = Number(raw.quantity || 0);
        const uCost = Number(raw.unit_cost ?? 0);
        if (!prodId || isNaN(qty) || qty <= 0 || isNaN(uCost) || uCost < 0) {
          const err = new Error('Cada línea de compra requiere producto, cantidad > 0 y costo válido.');
          err.statusCode = 400;
          throw err;
        }

        const prod = await tx.get(
          'SELECT id, name, location FROM inventory_products WHERE id = ? AND hotel_id = ?',
          [prodId, hotelId]
        );
        if (!prod) {
          const err = new Error(`Producto #${prodId} no encontrado en este hotel.`);
          err.statusCode = 404;
          throw err;
        }

        const lineSub = Math.round(qty * uCost * 100) / 100;
        subtotal += lineSub;
        resolvedItems.push({
          product_id: prod.id,
          item_name: prod.name,
          quantity: qty,
          unit_cost: uCost,
          subtotal: lineSub,
          location: raw.location || prod.location || 'Bodega Principal'
        });
      }

      const totalAmount = Math.round((subtotal + numTax) * 100) / 100;

      const poIns = await tx.run(
        `INSERT INTO purchase_orders (
          hotel_id, supplier_id, invoice_number, purchase_date, status,
          payment_method, subtotal, tax_amount, total_amount, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, 'BORRADOR', ?, ?, ?, ?, ?, ?, ?)`,
        [
          hotelId,
          supplier_id ? Number(supplier_id) : null,
          (invoice_number || '').trim(),
          pDate,
          payment_method || 'Efectivo',
          subtotal,
          numTax,
          totalAmount,
          (notes || '').trim(),
          req.user?.id || 1,
          nowIso
        ]
      );

      const orderNumber = buildPurchaseNumber(hotelId, poIns.id);
      await tx.run('UPDATE purchase_orders SET order_number = ? WHERE id = ?', [orderNumber, poIns.id]);

      for (const ri of resolvedItems) {
        await tx.run(
          `INSERT INTO purchase_order_items (
            hotel_id, purchase_id, product_id, item_name, quantity, unit_cost, subtotal, location
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [hotelId, poIns.id, ri.product_id, ri.item_name, ri.quantity, ri.unit_cost, ri.subtotal, ri.location]
        );
      }

      const purchaseObj = {
        id: poIns.id,
        order_number: orderNumber,
        invoice_number: (invoice_number || '').trim(),
        purchase_date: pDate,
        payment_method: payment_method || 'Efectivo',
        total_amount: totalAmount
      };

      if (targetStatus === 'RECIBIDA') {
        await receivePurchaseInTransaction({
          tx,
          hotelId,
          purchase: purchaseObj,
          items: resolvedItems,
          registerInCash: Boolean(register_in_cash),
          registerId: register_id,
          paymentMethod: payment_method,
          userId: req.user?.id || 1,
          today,
          nowIso
        });
      }

      return tx.get('SELECT * FROM purchase_orders WHERE id = ?', [poIns.id]);
    });

    res.status(201).json({
      message:
        createdPurchase.status === 'RECIBIDA'
          ? `Compra ${createdPurchase.order_number} recibida: existencias y costos actualizados en Kardex.`
          : `Orden de compra ${createdPurchase.order_number} guardada como borrador.`,
      purchase: createdPurchase
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al registrar compra:', error);
    res.status(500).json({ error: 'Error interno al registrar la compra.' });
  }
};

exports.receivePurchase = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const purchaseId = Number(req.params.purchaseId);
    const { register_in_cash, register_id, payment_method } = req.body || {};

    const purchase = await db.get(
      'SELECT * FROM purchase_orders WHERE id = ? AND hotel_id = ?',
      [purchaseId, hotelId]
    );
    if (!purchase) {
      return res.status(404).json({ error: 'Orden de compra no encontrada.' });
    }
    if (purchase.status !== 'BORRADOR') {
      return res.status(400).json({ error: `La orden ya se encuentra en estado ${purchase.status}.` });
    }

    const items = await db.query(
      'SELECT * FROM purchase_order_items WHERE purchase_id = ? AND hotel_id = ?',
      [purchaseId, hotelId]
    );
    const today = getTodayString();
    const nowIso = new Date().toISOString();

    await db.withTransaction(async (tx) => {
      await receivePurchaseInTransaction({
        tx,
        hotelId,
        purchase,
        items,
        registerInCash: Boolean(register_in_cash),
        registerId: register_id,
        paymentMethod: payment_method,
        userId: req.user?.id || 1,
        today,
        nowIso
      });
    });

    res.json({ message: `Orden ${purchase.order_number} recibida en inventario correctamente.` });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al recibir orden de compra:', error);
    res.status(500).json({ error: 'Error al recibir la orden de compra.' });
  }
};

exports.voidPurchase = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const purchaseId = Number(req.params.purchaseId);
    const { void_reason, reason } = req.body || {};
    const effectiveReason = String(void_reason || reason || '').trim();
    if (!effectiveReason) {
      return res.status(400).json({ error: 'Debe especificar el motivo de anulación de la compra.' });
    }

    const purchase = await db.get(
      'SELECT * FROM purchase_orders WHERE id = ? AND hotel_id = ?',
      [purchaseId, hotelId]
    );
    if (!purchase) {
      return res.status(404).json({ error: 'Orden de compra no encontrada.' });
    }
    if (purchase.status === 'ANULADA') {
      return res.status(400).json({ error: 'Esta orden de compra ya fue anulada.' });
    }

    const items = await db.query(
      'SELECT * FROM purchase_order_items WHERE purchase_id = ? AND hotel_id = ?',
      [purchaseId, hotelId]
    );
    const today = getTodayString();
    const nowIso = new Date().toISOString();

    await db.withTransaction(async (tx) => {
      if (purchase.status === 'RECIBIDA') {
        for (const item of items) {
          const prod = await tx.get(
            'SELECT * FROM inventory_products WHERE id = ? AND hotel_id = ?',
            [item.product_id, hotelId]
          );
          if (!prod) continue;
          const prevStock = Number(prod.stock || 0);
          const qty = Number(item.quantity || 0);
          const newStock = Math.round((prevStock - qty) * 1000) / 1000;

          await tx.run(
            'UPDATE inventory_products SET stock = ?, updated_at = ? WHERE id = ? AND hotel_id = ?',
            [newStock, today, prod.id, hotelId]
          );

          await tx.run(
            `INSERT INTO inventory_movements (
              hotel_id, product_id, movement_type, direction, quantity, unit_cost, total_cost,
              previous_stock, new_stock, department, source_location, target_location,
              reference_type, reference_id, reference_code, notes, user_id, movement_date, created_at
            ) VALUES (?, ?, 'ANULACION_COMPRA', 'OUT', ?, ?, ?, ?, ?, ?, ?, 'Anulación Compra', 'PURCHASE', ?, ?, ?, ?, ?, ?)`,
            [
              hotelId,
              prod.id,
              qty,
              Number(item.unit_cost || 0),
              Number(item.subtotal || 0),
              prevStock,
              newStock,
              prod.department || 'GENERAL',
              prod.location || 'Bodega Principal',
              purchase.id,
              purchase.order_number,
              `Anulación de compra ${purchase.order_number}: ${effectiveReason}`,
              req.user?.id || 1,
              today,
              nowIso
            ]
          );
        }

        if (purchase.cash_movement_id) {
          const origMov = await tx.get(
            'SELECT * FROM cash_movements WHERE id = ? AND hotel_id = ?',
            [purchase.cash_movement_id, hotelId]
          );
          if (origMov && Number(origMov.voided) !== 1) {
            const compIns = await tx.run(
              `INSERT INTO cash_movements (
                hotel_id, register_id, type, movement_subtype, amount,
                category, payment_method, description, reference, date,
                original_movement_id, user_id, voided, void_reason, voided_at, voided_by, created_at
              ) VALUES (?, ?, 'INGRESO', 'ANULACION_COMPENSATORIA', ?, 'Anulación Compra Inventario', ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
              [
                hotelId,
                origMov.register_id,
                Number(origMov.amount || 0),
                origMov.payment_method || 'Efectivo',
                `[ANULACIÓN COMPRA] ${purchase.order_number} — ${effectiveReason}`,
                purchase.order_number,
                today,
                origMov.id,
                req.user?.id || 1,
                effectiveReason,
                nowIso,
                req.user?.id || 1,
                nowIso
              ]
            );
            const compRc = `ANUL-H${hotelId}-${String(compIns.id).padStart(5, '0')}`;
            await tx.run('UPDATE cash_movements SET receipt_number = ? WHERE id = ?', [compRc, compIns.id]);
            await tx.run(
              `UPDATE cash_movements
               SET voided = 1, void_reason = ?, voided_at = ?, voided_by = ?, compensating_movement_id = ?
               WHERE id = ? AND hotel_id = ?`,
              [effectiveReason, nowIso, req.user?.id || 1, compIns.id, origMov.id, hotelId]
            );
          }
        }
      }

      await tx.run(
        `UPDATE purchase_orders
         SET status = 'ANULADA', void_reason = ?, voided_by = ?, voided_at = ?
         WHERE id = ? AND hotel_id = ?`,
        [effectiveReason, req.user?.id || 1, nowIso, purchase.id, hotelId]
      );

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'ANULAR_COMPRA_INVENTARIO', 'INVENTARIO', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          purchase.id,
          `Anulación de compra ${purchase.order_number}. Motivo: ${effectiveReason}`,
          today
        ]
      );
    });

    res.json({ message: `Compra ${purchase.order_number} anulada correctamente.` });
  } catch (error) {
    console.error('Error al anular compra:', error);
    res.status(500).json({ error: 'Error al anular la orden de compra.' });
  }
};

// 8. Recetas / Fichas Técnicas de Consumo Automático
exports.listRecipes = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const catalog = await db.query(
      `SELECT id, department, category, code, name, price, unit, inventory_product_id
       FROM service_catalog
       WHERE hotel_id = ? AND active = 1
       ORDER BY department ASC, name ASC`,
      [hotelId]
    );
    const recipes = await db.query(
      `SELECT sr.*, ip.name as product_name, ip.sku, ip.cost as product_cost, ip.unit as product_unit, ip.stock as product_stock
       FROM service_recipes sr
       JOIN inventory_products ip ON sr.inventory_product_id = ip.id
       WHERE sr.hotel_id = ?
       ORDER BY sr.id ASC`,
      [hotelId]
    );

    res.json(
      catalog.map((c) => ({
        ...c,
        price: Number(c.price || 0),
        recipes: recipes
          .filter((r) => r.catalog_id === c.id)
          .map((r) => ({
            ...r,
            quantity: Number(r.quantity || 0),
            product_cost: Number(r.product_cost || 0)
          }))
      }))
    );
  } catch (error) {
    console.error('Error al listar recetas:', error);
    res.status(500).json({ error: 'Error al consultar las recetas y fichas técnicas.' });
  }
};

exports.saveCatalogRecipe = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const catalogId = Number(req.params.catalogId);
    const { ingredients } = req.body;

    const catItem = await db.get(
      'SELECT * FROM service_catalog WHERE id = ? AND hotel_id = ?',
      [catalogId, hotelId]
    );
    if (!catItem) {
      return res.status(404).json({ error: 'Producto/Servicio del catálogo no encontrado.' });
    }
    if (!Array.isArray(ingredients)) {
      return res.status(400).json({ error: 'Debe enviar el arreglo de ingredientes (ingredients).' });
    }

    const today = getTodayString();

    await db.withTransaction(async (tx) => {
      await tx.run('DELETE FROM service_recipes WHERE hotel_id = ? AND catalog_id = ?', [
        hotelId,
        catalogId
      ]);

      for (const ing of ingredients) {
        const invId = Number(ing.inventory_product_id);
        const qty = Number(ing.quantity || 0);
        if (!invId || isNaN(qty) || qty <= 0) continue;

        const invProd = await tx.get(
          'SELECT id, unit FROM inventory_products WHERE id = ? AND hotel_id = ?',
          [invId, hotelId]
        );
        if (!invProd) {
          const err = new Error(`Insumo #${invId} no pertenece a este establecimiento.`);
          err.statusCode = 404;
          throw err;
        }

        await tx.run(
          `INSERT INTO service_recipes (hotel_id, catalog_id, inventory_product_id, quantity, unit, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            hotelId,
            catalogId,
            invId,
            qty,
            (ing.unit || invProd.unit || 'UND').trim(),
            (ing.notes || '').trim(),
            today
          ]
        );
      }

      const singleLinkedId =
        ingredients.length === 1 && Number(ingredients[0].quantity) === 1
          ? Number(ingredients[0].inventory_product_id)
          : null;
      await tx.run(
        'UPDATE service_catalog SET inventory_product_id = ? WHERE id = ? AND hotel_id = ?',
        [singleLinkedId, catalogId, hotelId]
      );

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'CONFIGURAR_RECETA', 'INVENTARIO', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          catalogId,
          `Ficha técnica actualizada para "${catItem.name}" (${ingredients.length} insumos)`,
          today
        ]
      );
    });

    res.json({ message: `Ficha técnica de "${catItem.name}" guardada correctamente.` });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al guardar ficha técnica:', error);
    res.status(500).json({ error: 'Error al guardar la ficha técnica.' });
  }
};

exports.applyServiceConsumptionInTransaction = applyServiceConsumptionInTransaction;
exports.reverseServiceConsumptionInTransaction = reverseServiceConsumptionInTransaction;

