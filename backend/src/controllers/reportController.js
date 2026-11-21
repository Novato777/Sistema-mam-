const db = require('../config/db');
const { getTodayString, formatDate, addDaysToDateStr, getDaysDifference } = require('../utils/date');

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

const getSeasonForDate = (dateStr) => {
  const month = parseInt(String(dateStr || '').substring(5, 7), 10);
  if ([1, 6, 7, 12].includes(month)) return 'Temporada Alta';
  if ([3, 4, 8, 10].includes(month)) return 'Temporada Media';
  return 'Temporada Baja';
};

const clipStayOverlapNights = (checkInStr, checkOutStr, rangeStart, rangeEnd, todayStr) => {
  const s = formatDate(checkInStr);
  const rawEnd = checkOutStr ? formatDate(checkOutStr) : todayStr;
  const effectiveEnd = rawEnd <= s ? addDaysToDateStr(s, 1) : rawEnd;

  const overlapStart = s > rangeStart ? s : rangeStart;
  const overlapEndLimit = addDaysToDateStr(rangeEnd, 1);
  const overlapEnd = effectiveEnd < overlapEndLimit ? effectiveEnd : overlapEndLimit;

  if (overlapEnd <= overlapStart) return 0;
  return Math.max(0, getDaysDifference(overlapStart, overlapEnd));
};

// Consolidado Completo de Reportes y Estadísticas del Hotel (Módulo 12 - Bloque 13)
exports.getReportsOverview = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const today = getTodayString();
    const fromDate = req.query.from_date ? formatDate(req.query.from_date) : `${today.substring(0, 7)}-01`;
    const toDate = req.query.to_date ? formatDate(req.query.to_date) : today;
    const department =
      req.query.department && req.query.department !== 'ALL'
        ? String(req.query.department).trim().toUpperCase()
        : null;
    const roomId = req.query.room_id ? Number(req.query.room_id) : null;
    const paymentMethod =
      req.query.payment_method && req.query.payment_method !== 'ALL'
        ? String(req.query.payment_method).trim()
        : null;
    const userId = req.query.user_id ? Number(req.query.user_id) : null;

    const daysInPeriod = Math.max(1, getDaysDifference(fromDate, toDate) + 1);

    const hotel = await db.get('SELECT * FROM hotels WHERE id = ?', [hotelId]);
    const rooms = await db.query(
      `SELECT r.*, rt.name as room_type_name, rt.code as room_type_code,
              COALESCE(r.price_override, rt.base_price, 0) as effective_price
       FROM rooms r
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       WHERE r.hotel_id = ? AND COALESCE(r.active, 1) = 1
       ORDER BY r.number ASC`,
      [hotelId]
    );
    const filteredRooms = roomId ? rooms.filter((r) => r.id === roomId) : rooms;
    const totalRoomsCount = filteredRooms.length;
    const totalAvailableRoomNights = totalRoomsCount * daysInPeriod;

    const users = await db.query(
      `SELECT u.id, u.username, u.full_name, COALESCE(uh.role, u.role) as role
       FROM users u
       JOIN user_hotels uh ON uh.user_id = u.id AND uh.hotel_id = ? AND uh.active = 1
       ORDER BY u.full_name ASC`,
      [hotelId]
    );

    const paymentMethods = await db.query(
      'SELECT id, name FROM hotel_payment_methods WHERE hotel_id = ? AND active = 1 ORDER BY id ASC',
      [hotelId]
    );

    // 1. ESTADÍAS Y OCUPACIÓN
    let staysSql = `
      SELECT s.*, r.number as room_number, r.room_type_id, rt.name as room_type_name,
             g.first_name, g.last_name, g.doc_type, g.document, g.nationality,
             g.origin_city as guest_origin, g.destination_city as guest_destination,
             g.phone as guest_phone, g.email as guest_email
      FROM stays s
      JOIN rooms r ON s.room_id = r.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      JOIN guests g ON s.guest_id = g.id
      WHERE s.hotel_id = ?
    `;
    const staysParams = [hotelId];
    if (roomId) {
      staysSql += ' AND s.room_id = ?';
      staysParams.push(roomId);
    }
    staysSql += ' ORDER BY s.check_in_time DESC, s.id DESC';
    const allStays = await db.query(staysSql, staysParams);

    const staysInPeriod = allStays.filter((st) => {
      const ci = formatDate(st.check_in_time);
      const co = st.check_out_time ? formatDate(st.check_out_time) : today;
      return ci <= toDate && co >= fromDate;
    });

    // Ocupación diaria (hasta últimos 45 días del rango para evitar payloads enormes en rangos anuales)
    const dailyOccupancy = [];
    const dailyStart = daysInPeriod > 45 ? addDaysToDateStr(toDate, -44) : fromDate;
    const dailySteps = Math.max(1, getDaysDifference(dailyStart, toDate) + 1);

    for (let i = 0; i < dailySteps; i++) {
      const dStr = addDaysToDateStr(dailyStart, i);
      const occRoomsSet = new Set();
      for (const st of staysInPeriod) {
        const ci = formatDate(st.check_in_time);
        const co = st.check_out_time ? formatDate(st.check_out_time) : today;
        if (ci <= dStr && (st.status === 'ACTIVA' ? dStr <= today : co > dStr || ci === dStr)) {
          occRoomsSet.add(st.room_id);
        }
      }
      const occCount = occRoomsSet.size;
      const pct = totalRoomsCount > 0 ? round2((occCount / totalRoomsCount) * 100) : 0;
      dailyOccupancy.push({
        date: dStr,
        occupied_rooms: occCount,
        total_rooms: totalRoomsCount,
        occupancy_rate: pct
      });
    }

    // Ocupación por Tipo de Habitación, Mes y Temporada
    const byRoomTypeMap = new Map();
    for (const rm of filteredRooms) {
      const rtName = rm.room_type_name || 'Estándar';
      if (!byRoomTypeMap.has(rtName)) {
        byRoomTypeMap.set(rtName, {
          room_type_name: rtName,
          rooms_count: 0,
          stays_count: 0,
          occupied_nights: 0,
          available_nights: 0,
          occupancy_rate: 0,
          lodging_revenue: 0
        });
      }
      const entry = byRoomTypeMap.get(rtName);
      entry.rooms_count += 1;
      entry.available_nights += daysInPeriod;
    }

    const monthlyMap = new Map();
    const seasonMap = new Map([
      ['Temporada Alta', { season: 'Temporada Alta', stays_count: 0, occupied_nights: 0, lodging_revenue: 0 }],
      ['Temporada Media', { season: 'Temporada Media', stays_count: 0, occupied_nights: 0, lodging_revenue: 0 }],
      ['Temporada Baja', { season: 'Temporada Baja', stays_count: 0, occupied_nights: 0, lodging_revenue: 0 }]
    ]);

    let totalOccupiedRoomNights = 0;
    for (const st of staysInPeriod) {
      const nights = clipStayOverlapNights(st.check_in_time, st.check_out_time, fromDate, toDate, today);
      const effectiveNights = Math.max(1, nights);
      totalOccupiedRoomNights += effectiveNights;

      const rtName = st.room_type_name || 'Estándar';
      const rtEntry = byRoomTypeMap.get(rtName);
      if (rtEntry) {
        rtEntry.stays_count += 1;
        rtEntry.occupied_nights += effectiveNights;
      }

      const monthKey = formatDate(st.check_in_time).substring(0, 7);
      const mEntry = monthlyMap.get(monthKey) || {
        month: monthKey,
        stays_count: 0,
        occupied_nights: 0,
        lodging_revenue: 0
      };
      mEntry.stays_count += 1;
      mEntry.occupied_nights += effectiveNights;
      monthlyMap.set(monthKey, mEntry);

      const sName = getSeasonForDate(st.check_in_time);
      const sEntry = seasonMap.get(sName);
      sEntry.stays_count += 1;
      sEntry.occupied_nights += effectiveNights;
    }

    const overallOccupancyRate =
      totalAvailableRoomNights > 0
        ? Math.min(100, round2((totalOccupiedRoomNights / totalAvailableRoomNights) * 100))
        : 0;

    // 2. INGRESOS POR ALOJAMIENTO, SERVICIO, DEPARTAMENTO, ADR Y RevPAR
    let chargesSql = `
      SELECT ac.*, ga.stay_id, s.room_id, r.number as room_number,
             rt.name as room_type_name, s.check_in_time
      FROM account_charges ac
      JOIN guest_accounts ga ON ac.account_id = ga.id
      JOIN stays s ON ga.stay_id = s.id
      JOIN rooms r ON s.room_id = r.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      WHERE ac.hotel_id = ? AND ac.date >= ? AND ac.date <= ?
    `;
    const chargesParams = [hotelId, fromDate, toDate];
    if (roomId) {
      chargesSql += ' AND s.room_id = ?';
      chargesParams.push(roomId);
    }
    if (userId) {
      chargesSql += ' AND ac.user_id = ?';
      chargesParams.push(userId);
    }
    const chargesRows = await db.query(chargesSql, chargesParams);

    let cashSql = `
      SELECT cm.*, u.full_name as user_name, cr.name as register_name, cr.shift as register_shift
      FROM cash_movements cm
      LEFT JOIN users u ON cm.user_id = u.id
      LEFT JOIN cash_registers cr ON cm.register_id = cr.id
      WHERE cm.hotel_id = ?
        AND cm.date >= ? AND cm.date <= ?
        AND COALESCE(cm.voided, 0) = 0
        AND COALESCE(cm.movement_subtype, 'OPERATIVO') != 'ANULACION_COMPENSATORIA'
    `;
    const cashParams = [hotelId, fromDate, toDate];
    if (paymentMethod) {
      cashSql += ' AND LOWER(cm.payment_method) = LOWER(?)';
      cashParams.push(paymentMethod);
    }
    if (userId) {
      cashSql += ' AND cm.user_id = ?';
      cashParams.push(userId);
    }
    cashSql += ' ORDER BY cm.date DESC, cm.id DESC';
    const cashMovements = await db.query(cashSql, cashParams);

    let posSql = `
      SELECT so.*, r.number as room_number, u.full_name as user_name
      FROM service_orders so
      LEFT JOIN rooms r ON so.room_id = r.id
      LEFT JOIN users u ON COALESCE(so.settled_by, so.created_by) = u.id
      WHERE so.hotel_id = ?
        AND so.order_date >= ? AND so.order_date <= ?
        AND so.status IN ('PAGADA', 'CARGADA_HABITACION')
    `;
    const posParams = [hotelId, fromDate, toDate];
    if (roomId) {
      posSql += ' AND so.room_id = ?';
      posParams.push(roomId);
    }
    if (department && department !== 'ALOJAMIENTO') {
      posSql += ' AND so.department = ?';
      posParams.push(department);
    }
    if (paymentMethod) {
      posSql += ' AND LOWER(COALESCE(so.payment_method, \'\')) = LOWER(?)';
      posParams.push(paymentMethod);
    }
    if (userId) {
      posSql += ' AND COALESCE(so.settled_by, so.created_by) = ?';
      posParams.push(userId);
    }
    const posOrders = await db.query(posSql, posParams);

    // Calcular ingresos por habitación, departamento y KPIs ADR / RevPAR
    const revenueByRoomMap = new Map();
    for (const rm of filteredRooms) {
      revenueByRoomMap.set(rm.id, {
        room_id: rm.id,
        room_number: rm.number,
        room_type_name: rm.room_type_name || 'Estándar',
        lodging_revenue: 0,
        services_revenue: 0,
        total_revenue: 0
      });
    }

    const deptRevMap = new Map();
    const addDeptRev = (dept, amt) => {
      const k = dept || 'OTROS';
      deptRevMap.set(k, round2((deptRevMap.get(k) || 0) + amt));
    };

    let lodgingRevenue = 0;
    let folioServicesRevenue = 0;

    for (const ch of chargesRows) {
      const amt = Number(ch.amount || 0);
      const isLodging = ['ALOJAMIENTO', 'HOSPEDAJE'].includes(String(ch.type || '').toUpperCase());
      const rmEntry = revenueByRoomMap.get(ch.room_id);

      if (isLodging) {
        if (!department || department === 'ALOJAMIENTO') {
          lodgingRevenue = round2(lodgingRevenue + amt);
          if (rmEntry) {
            rmEntry.lodging_revenue = round2(rmEntry.lodging_revenue + amt);
            rmEntry.total_revenue = round2(rmEntry.total_revenue + amt);
          }
          addDeptRev('ALOJAMIENTO', amt);

          const rtEntry = byRoomTypeMap.get(ch.room_type_name || 'Estándar');
          if (rtEntry) rtEntry.lodging_revenue = round2(rtEntry.lodging_revenue + amt);

          const mKey = formatDate(ch.date).substring(0, 7);
          if (monthlyMap.has(mKey)) {
            monthlyMap.get(mKey).lodging_revenue = round2(monthlyMap.get(mKey).lodging_revenue + amt);
          }
          const sEntry = seasonMap.get(getSeasonForDate(ch.date));
          if (sEntry) sEntry.lodging_revenue = round2(sEntry.lodging_revenue + amt);
        }
      } else {
        if (!department || department === String(ch.type || '').toUpperCase()) {
          folioServicesRevenue = round2(folioServicesRevenue + amt);
          if (rmEntry) {
            rmEntry.services_revenue = round2(rmEntry.services_revenue + amt);
            rmEntry.total_revenue = round2(rmEntry.total_revenue + amt);
          }
        }
      }
    }

    // Sumar pagos directos de caja de hospedaje si el hotel tiene folios sin cargo previo o ingresos directos de alojamiento
    let directServicesRevenue = 0;
    for (const po of posOrders) {
      const amt = Number(po.total_amount || 0);
      addDeptRev(po.department, amt);
      if (po.payment_mode === 'CAJA_DIRECTA') {
        directServicesRevenue = round2(directServicesRevenue + amt);
        if (po.room_id && revenueByRoomMap.has(po.room_id)) {
          const rmEntry = revenueByRoomMap.get(po.room_id);
          rmEntry.services_revenue = round2(rmEntry.services_revenue + amt);
          rmEntry.total_revenue = round2(rmEntry.total_revenue + amt);
        }
      }
    }

    // Fallback para ventas directas de alojamiento en caja cuando no hay account_charges de hospedaje
    if (lodgingRevenue === 0 && (!department || department === 'ALOJAMIENTO')) {
      const cashLodging = cashMovements
        .filter(
          (cm) =>
            cm.type === 'INGRESO' &&
            ['COBRO DE HABITACIÓN', 'ALOJAMIENTO', 'HOSPEDAJE'].includes(String(cm.category || '').toUpperCase())
        )
        .reduce((acc, cm) => acc + Number(cm.amount || 0), 0);
      lodgingRevenue = round2(cashLodging);
      if (cashLodging > 0) addDeptRev('ALOJAMIENTO', cashLodging);
    }

    const totalServicesRevenue = round2(folioServicesRevenue + directServicesRevenue);
    const totalRevenue = round2(lodgingRevenue + totalServicesRevenue);
    const adr = totalOccupiedRoomNights > 0 ? round2(lodgingRevenue / totalOccupiedRoomNights) : 0;
    const revpar = totalAvailableRoomNights > 0 ? round2(lodgingRevenue / totalAvailableRoomNights) : 0;

    for (const rt of byRoomTypeMap.values()) {
      rt.occupancy_rate =
        rt.available_nights > 0 ? Math.min(100, round2((rt.occupied_nights / rt.available_nights) * 100)) : 0;
    }

    // 3. RESERVAS, CANCELACIONES, NO-SHOWS Y LISTADO LEGAL DE HUÉSPEDES
    let resSql = `
      SELECT rv.*, g.first_name, g.last_name, g.document, g.phone, u.full_name as user_name
      FROM reservations rv
      LEFT JOIN guests g ON rv.guest_id = g.id
      LEFT JOIN users u ON rv.user_id = u.id
      WHERE rv.hotel_id = ?
        AND rv.check_in_expected >= ? AND rv.check_in_expected <= ?
    `;
    const resParams = [hotelId, fromDate, toDate];
    if (userId) {
      resSql += ' AND rv.user_id = ?';
      resParams.push(userId);
    }
    resSql += ' ORDER BY rv.check_in_expected DESC, rv.id DESC';
    const reservations = await db.query(resSql, resParams);

    const resSummary = {
      total: reservations.length,
      pendientes: reservations.filter((r) => r.status === 'PENDIENTE').length,
      confirmadas: reservations.filter((r) => r.status === 'CONFIRMADA').length,
      checked_in: reservations.filter((r) => ['CHECKED_IN', 'FINALIZADA'].includes(r.status)).length,
      canceladas: reservations.filter((r) => r.status === 'CANCELADA').length,
      no_shows: reservations.filter((r) => r.status === 'NO_SHOW').length,
      total_quoted_amount: round2(reservations.reduce((a, r) => a + Number(r.total_price || 0), 0))
    };

    const companions = await db.query(
      `SELECT * FROM stay_companions WHERE hotel_id = ? ORDER BY id ASC`,
      [hotelId]
    );
    const compByStay = new Map();
    for (const c of companions) {
      if (!compByStay.has(c.stay_id)) compByStay.set(c.stay_id, []);
      compByStay.get(c.stay_id).push(c);
    }

    const legalGuestList = staysInPeriod.map((st) => ({
      stay_id: st.id,
      room_number: st.room_number,
      guest_name: `${st.first_name || ''} ${st.last_name || ''}`.trim(),
      doc_type: st.doc_type || 'CC',
      document: st.document || '',
      nationality: st.nationality || 'Colombiana',
      origin_city: st.origin_city || st.guest_origin || '',
      destination_city: st.destination_city || st.guest_destination || '',
      travel_purpose: st.travel_purpose || 'Turismo',
      vehicle_plate: st.vehicle_plate || '',
      check_in_time: st.check_in_time,
      check_out_time: st.check_out_time || 'ACTIVO',
      status: st.status,
      phone: st.guest_phone || '',
      sire_code: hotel?.sire_code || '',
      tra_code: hotel?.tra_code || '',
      companions_count: (compByStay.get(st.id) || []).length,
      companions: compByStay.get(st.id) || []
    }));

    // 4. CAJA, GASTOS, COMPRAS, VALORIZACIÓN DE INVENTARIO Y RENTABILIDAD
    let totalCashIncome = 0;
    let totalCashExpense = 0;
    const cashByMethodMap = new Map();
    const cashByUserMap = new Map();
    const expensesByCategoryMap = new Map();

    for (const cm of cashMovements) {
      const amt = Number(cm.amount || 0);
      const isIncome = cm.type === 'INGRESO' || cm.type === 'Ingreso';
      if (isIncome) {
        totalCashIncome = round2(totalCashIncome + amt);
        const mKey = cm.payment_method || 'Efectivo';
        cashByMethodMap.set(mKey, round2((cashByMethodMap.get(mKey) || 0) + amt));
        const uKey = cm.user_name || 'Sistema';
        cashByUserMap.set(uKey, round2((cashByUserMap.get(uKey) || 0) + amt));
      } else {
        totalCashExpense = round2(totalCashExpense + amt);
        const cKey = cm.category || 'Gastos Generales';
        expensesByCategoryMap.set(cKey, round2((expensesByCategoryMap.get(cKey) || 0) + amt));
      }
    }

    const purchases = await db.query(
      `SELECT po.*, s.name as supplier_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON po.supplier_id = s.id
       WHERE po.hotel_id = ? AND po.purchase_date >= ? AND po.purchase_date <= ? AND po.status = 'RECIBIDA'
       ORDER BY po.purchase_date DESC, po.id DESC`,
      [hotelId, fromDate, toDate]
    );
    const totalPurchases = round2(purchases.reduce((a, p) => a + Number(p.total_amount || 0), 0));

    const inventoryProducts = await db.query(
      `SELECT id, sku, department, name, unit, stock, cost, min_stock
       FROM inventory_products
       WHERE hotel_id = ? AND active = 1`,
      [hotelId]
    );
    const invByDeptMap = new Map();
    let totalInventoryValuation = 0;
    for (const ip of inventoryProducts) {
      const val = round2(Number(ip.stock || 0) * Number(ip.cost || 0));
      totalInventoryValuation = round2(totalInventoryValuation + val);
      const d = ip.department || 'GENERAL';
      const entry = invByDeptMap.get(d) || { department: d, items_count: 0, valuation: 0 };
      entry.items_count += 1;
      entry.valuation = round2(entry.valuation + val);
      invByDeptMap.set(d, entry);
    }

    const maintRows = await db.query(
      `SELECT COALESCE(SUM(actual_cost), 0) as total_cost, COUNT(*) as count
       FROM maintenance_tickets
       WHERE hotel_id = ? AND status = 'RESUELTO'
         AND SUBSTR(COALESCE(resolved_at, created_at), 1, 10) >= ?
         AND SUBSTR(COALESCE(resolved_at, created_at), 1, 10) <= ?`,
      [hotelId, fromDate, toDate]
    );
    const maintenanceCost = round2(maintRows[0]?.total_cost || 0);

    // Rentabilidad operativa consolidada (evitando doble conteo de compras pagadas en caja)
    const nonCashPurchases = round2(
      purchases.filter((p) => !p.cash_movement_id).reduce((a, p) => a + Number(p.total_amount || 0), 0)
    );
    const effectiveRevenueForProfit = Math.max(totalRevenue, totalCashIncome);
    const totalCostsAndExpenses = round2(totalCashExpense + nonCashPurchases + maintenanceCost);
    const netProfit = round2(effectiveRevenueForProfit - totalCostsAndExpenses);
    const profitabilityMarginPct =
      effectiveRevenueForProfit > 0 ? round2((netProfit / effectiveRevenueForProfit) * 100) : 0;

    res.json({
      hotel: {
        id: hotel?.id,
        name: hotel?.name,
        legal_name: hotel?.legal_name,
        tax_id: hotel?.tax_id,
        address: hotel?.address,
        city: hotel?.city,
        phone: hotel?.phone,
        logo_url: hotel?.logo_url,
        sire_code: hotel?.sire_code,
        tra_code: hotel?.tra_code
      },
      filters: {
        from_date: fromDate,
        to_date: toDate,
        days_in_period: daysInPeriod,
        department: department || 'ALL',
        room_id: roomId,
        payment_method: paymentMethod || 'ALL',
        user_id: userId
      },
      filter_options: {
        rooms: rooms.map((r) => ({ id: r.id, number: r.number })),
        users,
        payment_methods: paymentMethods
      },
      occupancy: {
        total_rooms: totalRoomsCount,
        total_available_room_nights: totalAvailableRoomNights,
        total_occupied_room_nights: totalOccupiedRoomNights,
        occupancy_rate: overallOccupancyRate,
        daily: dailyOccupancy,
        monthly: Array.from(monthlyMap.values()).sort((a, b) => a.month.localeCompare(b.month)),
        by_room_type: Array.from(byRoomTypeMap.values()),
        by_season: Array.from(seasonMap.values())
      },
      revenue: {
        lodging_revenue: lodgingRevenue,
        services_revenue: totalServicesRevenue,
        total_revenue: totalRevenue,
        adr,
        revpar,
        by_room: Array.from(revenueByRoomMap.values()),
        by_department: Array.from(deptRevMap.entries()).map(([dept, amount]) => ({
          department: dept,
          amount
        }))
      },
      reservations: {
        summary: resSummary,
        list: reservations.map((r) => ({
          ...r,
          guest_name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
          total_price: Number(r.total_price || 0),
          advance_paid: Number(r.advance_paid || 0)
        })),
        cancellations_and_noshows: reservations
          .filter((r) => ['CANCELADA', 'NO_SHOW'].includes(r.status))
          .map((r) => ({
            ...r,
            guest_name: `${r.first_name || ''} ${r.last_name || ''}`.trim(),
            total_price: Number(r.total_price || 0)
          }))
      },
      legal_guests: legalGuestList,
      finance: {
        total_cash_income: totalCashIncome,
        total_cash_expense: totalCashExpense,
        net_cash_flow: round2(totalCashIncome - totalCashExpense),
        by_payment_method: Array.from(cashByMethodMap.entries()).map(([method, amount]) => ({
          method,
          amount
        })),
        by_user: Array.from(cashByUserMap.entries()).map(([user_name, amount]) => ({
          user_name,
          amount
        })),
        expenses_by_category: Array.from(expensesByCategoryMap.entries()).map(([category, amount]) => ({
          category,
          amount
        })),
        cash_movements: cashMovements.slice(0, 150).map((m) => ({ ...m, amount: Number(m.amount || 0) })),
        purchases_count: purchases.length,
        purchases_total: totalPurchases,
        purchases,
        inventory_valuation: totalInventoryValuation,
        inventory_by_department: Array.from(invByDeptMap.values()),
        maintenance_cost: maintenanceCost,
        profitability: {
          effective_revenue: effectiveRevenueForProfit,
          total_costs_expenses: totalCostsAndExpenses,
          net_profit: netProfit,
          margin_pct: profitabilityMarginPct
        }
      }
    });
  } catch (error) {
    console.error('Error al generar reportes y estadísticas:', error);
    res.status(500).json({ error: 'Error al generar el consolidado de reportes y estadísticas.' });
  }
};

