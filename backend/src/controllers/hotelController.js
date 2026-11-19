const db = require('../config/db');
const { getTodayString, formatDate, addDaysToDateStr, getDaysDifference } = require('../utils/date');

const getPaymentIntervalDays = (paymentType) => {
  if (paymentType === 'Pago cada 3 días') return 3;
  if (paymentType === 'Pago semanal') return 7;
  return 1;
};

const calculateStayPendingInfo = (stay, roomPrice) => {
  if (!stay) {
    return { pendingBalance: 0, accruedPeriods: 0, accruedAmount: 0, totalPending: 0 };
  }

  const today = getTodayString();
  const pendingBalance = Number(stay.pending_balance || 0);
  const nextPayment = stay.next_payment_date;
  const interval = getPaymentIntervalDays(stay.payment_type);

  if (nextPayment && nextPayment <= today) {
    const diffDays = Math.max(0, getDaysDifference(nextPayment, today));
    const accruedPeriods = Math.floor(diffDays / interval) + 1;
    const accruedAmount = accruedPeriods * Number(roomPrice || 0);
    const totalPending = pendingBalance + accruedAmount;

    return {
      pendingBalance,
      accruedPeriods,
      accruedAmount,
      totalPending
    };
  }

  return {
    pendingBalance,
    accruedPeriods: 0,
    accruedAmount: 0,
    totalPending: pendingBalance
  };
};

// Obtener o crear la caja abierta del hotel actual
const ensureOpenCashRegister = async (txOrDb, hotelId, userId = 1) => {
  let reg = await txOrDb.get(
    "SELECT id FROM cash_registers WHERE hotel_id = ? AND status = 'ABIERTA' ORDER BY id DESC LIMIT 1",
    [hotelId]
  );
  if (!reg) {
    const res = await txOrDb.run(
      `INSERT INTO cash_registers (hotel_id, user_id, name, opening_time, opening_balance, status)
       VALUES (?, ?, 'Caja Principal Recepción', ?, 0, 'ABIERTA')`,
      [hotelId, userId || 1, getTodayString()]
    );
    return res.id;
  }
  return reg.id;
};

exports.getDashboard = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const today = getTodayString();
    const currentMonth = today.substring(0, 7);

    // 1. Consulta detallada de todas las habitaciones activas + estancias activas + folios
    const rawRooms = await db.query(
      `SELECT
        r.id,
        r.number,
        r.floor,
        r.room_type_id,
        rt.name as room_type_name,
        COALESCE(r.price_override, rt.base_price, 0) as price,
        r.status,
        r.observations,
        s.id as stay_id,
        s.check_in_time as check_in_date,
        s.payment_type,
        s.next_payment_date,
        g.id as guest_id,
        g.first_name,
        g.last_name,
        g.document as guest_document,
        g.phone as guest_phone,
        ga.balance as pending_balance
      FROM rooms r
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      LEFT JOIN stays s ON s.room_id = r.id AND s.status = 'ACTIVA'
      LEFT JOIN guests g ON s.guest_id = g.id
      LEFT JOIN guest_accounts ga ON ga.stay_id = s.id
      WHERE r.hotel_id = ? AND r.active = 1
      ORDER BY r.number ASC`,
      [hotelId]
    );

    let occupiedRooms = 0;
    let reservedRooms = 0;
    let cleaningRooms = 0;
    let outOfServiceRooms = 0;
    let availableRooms = 0;

    const currentStays = [];
    const cleaningList = [];
    const maintenanceList = [];
    const overdueStays = [];

    const rack = rawRooms.map((r) => {
      const roomPrice = Number(r.price || 0);
      const rawStatus = (r.status || 'DISPONIBLE').toUpperCase();
      const guestName = r.first_name
        ? `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}`.trim()
        : null;

      const pendingInfo = r.stay_id
        ? calculateStayPendingInfo(
            {
              pending_balance: r.pending_balance,
              next_payment_date: r.next_payment_date,
              payment_type: r.payment_type
            },
            roomPrice
          )
        : { pendingBalance: 0, accruedPeriods: 0, accruedAmount: 0, totalPending: 0 };

      let normalizedCategory = 'AVAILABLE';
      if (
        rawStatus === 'OCUPADA' ||
        rawStatus === 'PENDIENTE DE PAGO' ||
        Boolean(r.stay_id)
      ) {
        occupiedRooms++;
        normalizedCategory = 'OCCUPIED';
      } else if (rawStatus === 'RESERVADA') {
        reservedRooms++;
        normalizedCategory = 'RESERVED';
      } else if (
        rawStatus === 'LIMPIEZA' ||
        rawStatus === 'PENDIENTE_LIMPIEZA' ||
        rawStatus === 'EN_LIMPIEZA' ||
        rawStatus === 'INSPECCION_PENDIENTE'
      ) {
        cleaningRooms++;
        normalizedCategory = 'CLEANING';
        cleaningList.push({ id: r.id, number: r.number, status: r.status, observations: r.observations });
      } else if (
        rawStatus === 'MANTENIMIENTO' ||
        rawStatus === 'FUERA_DE_SERVICIO'
      ) {
        outOfServiceRooms++;
        normalizedCategory = 'OUT_OF_SERVICE';
        maintenanceList.push({ id: r.id, number: r.number, status: r.status, observations: r.observations });
      } else {
        availableRooms++;
      }

      if (r.stay_id) {
        const stayItem = {
          stay_id: r.stay_id,
          room_id: r.id,
          room_number: r.number,
          room_type_name: r.room_type_name || 'Estándar',
          guest_id: r.guest_id,
          guest_name: guestName || 'Huésped Registrado',
          guest_document: r.guest_document || '',
          guest_phone: r.guest_phone || '',
          check_in_date: r.check_in_date,
          payment_type: r.payment_type || 'Pago diario',
          next_payment_date: r.next_payment_date,
          rate: roomPrice,
          total_pending: pendingInfo.totalPending,
          accrued_periods: pendingInfo.accruedPeriods,
          is_overdue: Boolean(r.next_payment_date && r.next_payment_date <= today && pendingInfo.totalPending > 0)
        };
        currentStays.push(stayItem);
        if (stayItem.is_overdue || rawStatus === 'PENDIENTE DE PAGO') {
          overdueStays.push(stayItem);
        }
      }

      return {
        id: r.id,
        number: r.number,
        floor: r.floor || '1',
        room_type_name: r.room_type_name || 'Estándar',
        price: roomPrice,
        status: r.status === 'Libre' ? 'DISPONIBLE' : r.status,
        category: normalizedCategory,
        guest_name: guestName,
        next_payment_date: r.next_payment_date || null,
        total_pending: pendingInfo.totalPending
      };
    });

    const totalRooms = rawRooms.length;
    const operationalRooms = Math.max(1, totalRooms - outOfServiceRooms);
    const occupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
    const effectiveOccupancyRate = totalRooms > 0 ? Math.round((occupiedRooms / operationalRooms) * 100) : 0;

    // 2. Indicadores de Recepción y Reservas
    const reservationsRows = await db.query(
      `SELECT
        rv.id,
        rv.code,
        rv.check_in_expected,
        rv.check_out_expected,
        rv.adults,
        rv.children,
        rv.status,
        rv.total_price,
        rv.advance_paid,
        g.first_name,
        g.last_name,
        g.phone as guest_phone
      FROM reservations rv
      LEFT JOIN guests g ON rv.guest_id = g.id
      WHERE rv.hotel_id = ? AND rv.status IN ('PENDIENTE', 'CONFIRMADA')
      ORDER BY rv.check_in_expected ASC`,
      [hotelId]
    );

    const expectedArrivalsToday = reservationsRows.filter(
      (rv) => rv.check_in_expected && rv.check_in_expected.startsWith(today)
    );

    const departuresFromReservations = await db.get(
      `SELECT COUNT(*) as c FROM reservations
       WHERE hotel_id = ? AND check_out_expected LIKE ? AND status IN ('CONFIRMADA', 'ACTIVA', 'CHECKED_IN')`,
      [hotelId, `${today}%`]
    );

    const staysDueTodayCount = currentStays.filter(
      (s) => s.next_payment_date && s.next_payment_date.startsWith(today)
    ).length;

    const expectedDeparturesToday =
      Number(departuresFromReservations?.c || 0) + staysDueTodayCount;

    // 3. Indicadores Financieros (Día, Mes, Servicios Vendidos, Categorías y Medios de Pago)
    const todayFinance = await db.get(
      `SELECT
        SUM(CASE WHEN type = 'INGRESO' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'EGRESO' THEN amount ELSE 0 END) as expense,
        SUM(CASE WHEN type = 'INGRESO' AND UPPER(category) IN ('ALOJAMIENTO', 'HOSPEDAJE', 'HABITACION', 'HABITACIÓN') THEN amount ELSE 0 END) as lodging_income,
        SUM(CASE WHEN type = 'INGRESO' AND UPPER(category) NOT IN ('ALOJAMIENTO', 'HOSPEDAJE', 'HABITACION', 'HABITACIÓN') THEN amount ELSE 0 END) as services_income,
        SUM(CASE WHEN type = 'INGRESO' AND UPPER(category) NOT IN ('ALOJAMIENTO', 'HOSPEDAJE', 'HABITACION', 'HABITACIÓN') THEN 1 ELSE 0 END) as services_count,
        COUNT(*) as movements_count
       FROM cash_movements
       WHERE hotel_id = ? AND date LIKE ? AND COALESCE(voided, 0) = 0`,
      [hotelId, `${today}%`]
    );

    const monthFinance = await db.get(
      `SELECT
        SUM(CASE WHEN type = 'INGRESO' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'EGRESO' THEN amount ELSE 0 END) as expense,
        SUM(CASE WHEN type = 'INGRESO' AND UPPER(category) IN ('ALOJAMIENTO', 'HOSPEDAJE', 'HABITACION', 'HABITACIÓN') THEN amount ELSE 0 END) as lodging_income,
        SUM(CASE WHEN type = 'INGRESO' AND UPPER(category) NOT IN ('ALOJAMIENTO', 'HOSPEDAJE', 'HABITACION', 'HABITACIÓN') THEN amount ELSE 0 END) as services_income,
        SUM(CASE WHEN type = 'INGRESO' AND UPPER(category) NOT IN ('ALOJAMIENTO', 'HOSPEDAJE', 'HABITACION', 'HABITACIÓN') THEN 1 ELSE 0 END) as services_count,
        COUNT(*) as movements_count
       FROM cash_movements
       WHERE hotel_id = ? AND date LIKE ? AND COALESCE(voided, 0) = 0`,
      [hotelId, `${currentMonth}%`]
    );

    // Cargos adicionales al folio de huéspedes (servicios a habitación)
    const folioServicesToday = await db.get(
      `SELECT SUM(amount) as sum, COUNT(*) as count
       FROM account_charges
       WHERE hotel_id = ? AND date LIKE ? AND UPPER(type) NOT IN ('ALOJAMIENTO', 'HOSPEDAJE')`,
      [hotelId, `${today}%`]
    );

    const folioServicesMonth = await db.get(
      `SELECT SUM(amount) as sum, COUNT(*) as count
       FROM account_charges
       WHERE hotel_id = ? AND date LIKE ? AND UPPER(type) NOT IN ('ALOJAMIENTO', 'HOSPEDAJE')`,
      [hotelId, `${currentMonth}%`]
    );

    const totalIncomeToday = Number(todayFinance?.income || 0);
    const totalExpenseToday = Number(todayFinance?.expense || 0);
    const totalIncomeMonth = Number(monthFinance?.income || 0);
    const totalExpenseMonth = Number(monthFinance?.expense || 0);

    const servicesSoldTodayAmount =
      Number(todayFinance?.services_income || 0) + Number(folioServicesToday?.sum || 0);
    const servicesSoldTodayCount =
      Number(todayFinance?.services_count || 0) + Number(folioServicesToday?.count || 0);
    const servicesSoldMonthAmount =
      Number(monthFinance?.services_income || 0) + Number(folioServicesMonth?.sum || 0);
    const servicesSoldMonthCount =
      Number(monthFinance?.services_count || 0) + Number(folioServicesMonth?.count || 0);

    // 4. Estado de las Cajas del Hotel
    const rawRegisters = await db.query(
      `SELECT
        cr.id,
        cr.name,
        cr.user_id,
        u.full_name as user_name,
        u.username,
        cr.opening_time,
        cr.closing_time,
        cr.opening_balance,
        cr.closing_balance,
        cr.status,
        cr.observations,
        COALESCE(SUM(CASE WHEN cm.type = 'INGRESO' AND COALESCE(cm.voided, 0) = 0 THEN cm.amount ELSE 0 END), 0) as shift_income,
        COALESCE(SUM(CASE WHEN cm.type = 'EGRESO' AND COALESCE(cm.voided, 0) = 0 THEN cm.amount ELSE 0 END), 0) as shift_expense,
        COUNT(cm.id) as movements_count
       FROM cash_registers cr
       LEFT JOIN users u ON cr.user_id = u.id
       LEFT JOIN cash_movements cm ON cm.register_id = cr.id
       WHERE cr.hotel_id = ?
       GROUP BY cr.id, cr.name, cr.user_id, u.full_name, u.username, cr.opening_time, cr.closing_time, cr.opening_balance, cr.closing_balance, cr.status, cr.observations
       ORDER BY CASE WHEN cr.status = 'ABIERTA' THEN 0 ELSE 1 END, cr.id DESC
       LIMIT 6`,
      [hotelId]
    );

    const cashRegisters = rawRegisters.map((reg) => {
      const opening = Number(reg.opening_balance || 0);
      const inc = Number(reg.shift_income || 0);
      const exp = Number(reg.shift_expense || 0);
      return {
        id: reg.id,
        name: reg.name || 'Caja Recepción',
        user_name: reg.user_name || reg.username || 'Administrador',
        opening_time: reg.opening_time,
        closing_time: reg.closing_time,
        opening_balance: opening,
        shift_income: inc,
        shift_expense: exp,
        expected_balance: opening + inc - exp,
        closing_balance: reg.closing_balance !== null ? Number(reg.closing_balance) : null,
        status: reg.status,
        movements_count: Number(reg.movements_count || 0)
      };
    });

    const openRegistersCount = cashRegisters.filter((r) => r.status === 'ABIERTA').length;

    // 5. Serie histórica de últimos 7 días + Distribución por Categoría y Medio de Pago
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const dStr = addDaysToDateStr(today, -i);
      const dayRow = await db.get(
        `SELECT
          SUM(CASE WHEN type = 'INGRESO' THEN amount ELSE 0 END) as income,
          SUM(CASE WHEN type = 'EGRESO' THEN amount ELSE 0 END) as expense
         FROM cash_movements
         WHERE hotel_id = ? AND date LIKE ? AND COALESCE(voided, 0) = 0`,
        [hotelId, `${dStr}%`]
      );
      const inc = Number(dayRow?.income || 0);
      const exp = Number(dayRow?.expense || 0);
      const [, mm, dd] = dStr.split('-');
      last7Days.push({
        date: dStr,
        label: `${dd}/${mm}`,
        income: inc,
        expense: exp,
        balance: inc - exp
      });
    }

    const incomeByCategory = await db.query(
      `SELECT
        UPPER(COALESCE(category, 'OTROS')) as category,
        SUM(amount) as amount,
        COUNT(*) as count
       FROM cash_movements
       WHERE hotel_id = ? AND type = 'INGRESO' AND date LIKE ? AND COALESCE(voided, 0) = 0
       GROUP BY UPPER(COALESCE(category, 'OTROS'))
       ORDER BY amount DESC`,
      [hotelId, `${currentMonth}%`]
    );

    const paymentMethodsBreakdown = await db.query(
      `SELECT
        COALESCE(payment_method, 'Efectivo') as method,
        SUM(amount) as amount,
        COUNT(*) as count
       FROM cash_movements
       WHERE hotel_id = ? AND type = 'INGRESO' AND date LIKE ? AND COALESCE(voided, 0) = 0
       GROUP BY COALESCE(payment_method, 'Efectivo')
       ORDER BY amount DESC`,
      [hotelId, `${currentMonth}%`]
    );

    const recentMovements = await db.query(
      `SELECT
        cm.id,
        cm.type,
        cm.amount,
        cm.category,
        cm.payment_method,
        cm.description,
        cm.date,
        u.full_name as user_name
       FROM cash_movements cm
       LEFT JOIN users u ON cm.user_id = u.id
       WHERE cm.hotel_id = ? AND COALESCE(cm.voided, 0) = 0
       ORDER BY cm.date DESC, cm.id DESC
       LIMIT 8`,
      [hotelId]
    );

    // 6. Verificación de Inventario con Stock Bajo / Punto de Reposición
    const lowStockItems = await db.query(
      `SELECT id, name, category, stock, min_stock, reorder_point, unit
       FROM inventory_products
       WHERE hotel_id = ? AND active = 1
         AND (
           stock <= 0
           OR (min_stock > 0 AND stock <= min_stock)
           OR (COALESCE(reorder_point, 0) > 0 AND stock <= reorder_point)
         )
       ORDER BY stock ASC
       LIMIT 10`,
      [hotelId]
    );

    // 7. Generación Dinámica de Alertas Operativas en Tiempo Real
    const alerts = [];
    const hotelRoute =
      Number(hotelId) === 1
        ? '/hotel-1'
        : Number(hotelId) === 2
        ? '/hotel-2'
        : `/hotels/${hotelId}`;

    for (const overdue of overdueStays) {
      alerts.push({
        id: `overdue-stay-${overdue.stay_id}`,
        severity: 'critical',
        type: 'OVERDUE_PAYMENT',
        title: `Cobro vencido — Habitación ${overdue.room_number}`,
        description: `Huésped ${overdue.guest_name} presenta saldo pendiente de $${Number(overdue.total_pending).toLocaleString('de-DE')} (fecha cobro: ${overdue.next_payment_date || today}).`,
        action_url: hotelRoute,
        action_label: 'Registrar cobro'
      });
    }

    if (cleaningList.length > 0) {
      alerts.push({
        id: 'cleaning-pending',
        severity: 'warning',
        type: 'CLEANING_REQUIRED',
        title: `${cleaningList.length} habitación(es) en limpieza / pendientes de aseo`,
        description: `Habitaciones: ${cleaningList.map((c) => `#${c.number}`).join(', ')} requieren atención de housekeeping antes de habilitarse.`,
        action_url: hotelRoute,
        action_label: 'Gestionar habitaciones'
      });
    }

    if (maintenanceList.length > 0) {
      alerts.push({
        id: 'maintenance-active',
        severity: 'warning',
        type: 'OUT_OF_SERVICE',
        title: `${maintenanceList.length} habitación(es) fuera de servicio o en mantenimiento`,
        description: `Habitaciones bloqueadas: ${maintenanceList.map((m) => `#${m.number} (${m.status})`).join(', ')}.`,
        action_url: hotelRoute,
        action_label: 'Revisar estado'
      });
    }

    if (expectedArrivalsToday.length > 0) {
      alerts.push({
        id: 'arrivals-today',
        severity: 'info',
        type: 'EXPECTED_ARRIVALS',
        title: `${expectedArrivalsToday.length} llegada(s) prevista(s) para hoy`,
        description: `Reservas programadas para check-in hoy (${today}).`,
        action_url: hotelRoute,
        action_label: 'Ver recepción'
      });
    }

    if (reservationsRows.length > 0) {
      const unconfirmed = reservationsRows.filter((r) => r.status === 'PENDIENTE').length;
      if (unconfirmed > 0) {
        alerts.push({
          id: 'pending-reservations',
          severity: 'info',
          type: 'PENDING_RESERVATIONS',
          title: `${unconfirmed} reserva(s) pendiente(s) de confirmación`,
          description: 'Existen solicitudes de reserva pendientes de confirmar o registrar anticipo.',
          action_url: hotelRoute,
          action_label: 'Ver reservas'
        });
      }
    }

    if (lowStockItems.length > 0) {
      alerts.push({
        id: 'low-inventory',
        severity: 'warning',
        type: 'LOW_STOCK',
        title: `${lowStockItems.length} producto(s) con stock crítico en inventario`,
        description: `Insumos por reabastecer: ${lowStockItems.slice(0, 4).map((i) => `${i.name} (${i.stock} ${i.unit || 'UND'})`).join(', ')}.`,
        action_url: '/inventario',
        action_label: 'Ver inventario'
      });
    }

    if (openRegistersCount === 0) {
      alerts.push({
        id: 'no-open-cash-register',
        severity: 'info',
        type: 'CASH_REGISTER_CLOSED',
        title: 'No hay turno de caja abierto manualmente',
        description: 'El sistema abrirá automáticamente la Caja Principal al registrar el primer cobro, o puedes verificar los movimientos del día.',
        action_url: hotelRoute,
        action_label: 'Ir a caja'
      });
    }

    res.json({
      hotel: req.hotel,
      generated_at: new Date().toISOString(),
      rooms: {
        total: totalRooms,
        occupied: occupiedRooms,
        free: availableRooms,
        available: availableRooms,
        reserved: reservedRooms,
        cleaning: cleaningRooms,
        maintenance: outOfServiceRooms,
        out_of_service: outOfServiceRooms,
        occupancy_rate: occupancyRate,
        effective_occupancy_rate: effectiveOccupancyRate,
        rack
      },
      reception: {
        active_guests: currentStays.length,
        expected_arrivals_today: expectedArrivalsToday.length,
        expected_departures_today: expectedDeparturesToday,
        pending_reservations: reservationsRows.length,
        overdue_stays_count: overdueStays.length,
        current_stays: currentStays,
        upcoming_reservations: reservationsRows.slice(0, 6)
      },
      today: {
        income: totalIncomeToday,
        expense: totalExpenseToday,
        balance: totalIncomeToday - totalExpenseToday,
        lodging_income: Number(todayFinance?.lodging_income || 0),
        services_income: servicesSoldTodayAmount,
        movements_count: Number(todayFinance?.movements_count || 0)
      },
      month: {
        income: totalIncomeMonth,
        expense: totalExpenseMonth,
        balance: totalIncomeMonth - totalExpenseMonth,
        lodging_income: Number(monthFinance?.lodging_income || 0),
        services_income: servicesSoldMonthAmount,
        movements_count: Number(monthFinance?.movements_count || 0)
      },
      services_sold: {
        today_amount: servicesSoldTodayAmount,
        today_count: servicesSoldTodayCount,
        month_amount: servicesSoldMonthAmount,
        month_count: servicesSoldMonthCount
      },
      cash_registers: cashRegisters,
      open_registers_count: openRegistersCount,
      charts: {
        last_7_days: last7Days,
        income_by_category: incomeByCategory.map((c) => ({
          category: c.category,
          amount: Number(c.amount || 0),
          count: Number(c.count || 0)
        })),
        payment_methods: paymentMethodsBreakdown.map((m) => ({
          method: m.method,
          amount: Number(m.amount || 0),
          count: Number(m.count || 0)
        }))
      },
      recent_movements: recentMovements.map((m) => ({
        ...m,
        amount: Number(m.amount || 0)
      })),
      alerts
    });
  } catch (error) {
    console.error('Error al obtener dashboard del hotel:', error);
    res.status(500).json({ error: 'Error del servidor al obtener datos del dashboard' });
  }
};

const VALID_ROOM_STATUSES = [
  'DISPONIBLE',
  'RESERVADA',
  'OCUPADA',
  'PENDIENTE_LIMPIEZA',
  'EN_LIMPIEZA',
  'LIMPIA',
  'INSPECCION_PENDIENTE',
  'FUERA_DE_SERVICIO',
  'MANTENIMIENTO'
];

const normalizeRoomStatus = (raw) => {
  if (!raw) return 'DISPONIBLE';
  const upper = String(raw).trim().toUpperCase();
  if (upper === 'LIBRE') return 'DISPONIBLE';
  if (upper === 'LIMPIEZA') return 'EN_LIMPIEZA';
  if (upper === 'PENDIENTE DE PAGO') return 'OCUPADA';
  if (VALID_ROOM_STATUSES.includes(upper)) return upper;
  return 'DISPONIBLE';
};

const inferHistoryCategory = (status) => {
  if (['PENDIENTE_LIMPIEZA', 'EN_LIMPIEZA', 'LIMPIA', 'INSPECCION_PENDIENTE'].includes(status)) {
    return 'CLEANING';
  }
  if (['FUERA_DE_SERVICIO', 'MANTENIMIENTO'].includes(status)) {
    return 'MAINTENANCE';
  }
  if (['OCUPADA', 'RESERVADA'].includes(status)) {
    return 'OCCUPANCY';
  }
  return 'STATUS_CHANGE';
};

const parsePhotosJson = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch (_) {
    // Fallback comma-separated
  }
  return String(val)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
};

exports.getRooms = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const includeInactive = req.query.includeInactive === '1' || req.query.includeInactive === 'true';

    const rooms = await db.query(
      `SELECT
        r.id,
        r.number,
        r.floor,
        r.active,
        r.room_type_id,
        rt.name as room_type_name,
        rt.code as room_type_code,
        COALESCE(r.price_override, rt.base_price, 0) as price,
        COALESCE(r.rate_3_days, rt.rate_3_days) as rate_3_days,
        COALESCE(r.rate_weekly, rt.rate_weekly) as rate_weekly,
        COALESCE(r.capacity, rt.capacity, 2) as capacity,
        COALESCE(NULLIF(r.bed_config, ''), rt.bed_config, '1 Cama Doble') as bed_config,
        COALESCE(NULLIF(r.amenities, ''), rt.amenities, 'Baño privado, TV, Wi-Fi') as amenities,
        r.photos as room_photos,
        rt.photos as type_photos,
        r.status,
        r.observations,
        s.id as stay_id,
        s.check_in_time as check_in_date,
        s.payment_type,
        s.next_payment_date,
        g.first_name,
        g.last_name,
        g.document as guest_document,
        g.phone as guest_phone,
        ga.balance as pending_balance,
        (SELECT COUNT(*) FROM stays st WHERE st.room_id = r.id) as stays_count
      FROM rooms r
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      LEFT JOIN stays s ON s.room_id = r.id AND s.status = 'ACTIVA'
      LEFT JOIN guests g ON s.guest_id = g.id
      LEFT JOIN guest_accounts ga ON ga.stay_id = s.id
      WHERE r.hotel_id = ? ${includeInactive ? '' : 'AND r.active = 1'}
      ORDER BY r.active DESC, r.floor ASC, r.number ASC`,
      [hotelId]
    );

    const formattedRooms = rooms.map((r) => {
      const roomPrice = Number(r.price || 0);
      const guestName = r.first_name
        ? `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}`.trim()
        : undefined;

      const pendingInfo = r.stay_id
        ? calculateStayPendingInfo(
            {
              pending_balance: r.pending_balance,
              next_payment_date: r.next_payment_date,
              payment_type: r.payment_type
            },
            roomPrice
          )
        : { pendingBalance: 0, accruedPeriods: 0, accruedAmount: 0, totalPending: 0 };

      const roomPhotos = parsePhotosJson(r.room_photos);
      const typePhotos = parsePhotosJson(r.type_photos);
      const effectivePhotos = roomPhotos.length > 0 ? roomPhotos : typePhotos;

      return {
        id: r.id,
        number: r.number,
        floor: r.floor || '1',
        active: Number(r.active ?? 1),
        room_type_id: r.room_type_id,
        room_type_name: r.room_type_name || 'Estándar',
        room_type_code: r.room_type_code || 'STD',
        price: roomPrice,
        rate_3_days: r.rate_3_days !== null && r.rate_3_days !== undefined ? Number(r.rate_3_days) : null,
        rate_weekly: r.rate_weekly !== null && r.rate_weekly !== undefined ? Number(r.rate_weekly) : null,
        capacity: Number(r.capacity || 2),
        bed_config: r.bed_config || '1 Cama Doble',
        amenities: r.amenities || 'Baño privado, TV, Wi-Fi',
        photos: effectivePhotos,
        status: normalizeRoomStatus(r.status),
        observations: r.observations || '',
        stays_count: Number(r.stays_count || 0),
        guest_name: guestName,
        guest_phone: r.guest_phone || '',
        guest_document: r.guest_document || '',
        check_in_date: r.check_in_date || undefined,
        payment_type: r.payment_type || undefined,
        next_payment_date: r.next_payment_date || undefined,
        pending_balance: pendingInfo.pendingBalance,
        accrued_periods: pendingInfo.accruedPeriods,
        accrued_amount: pendingInfo.accruedAmount,
        total_pending: pendingInfo.totalPending
      };
    });

    res.json(formattedRooms);
  } catch (error) {
    console.error('Error al obtener habitaciones:', error);
    res.status(500).json({ error: 'Error del servidor al obtener habitaciones' });
  }
};

exports.createRoom = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      number,
      price,
      rate_3_days,
      rate_weekly,
      capacity,
      bed_config,
      amenities,
      photos,
      status,
      observations,
      room_type_id,
      floor
    } = req.body;

    if (!number) return res.status(400).json({ error: 'El número de habitación es requerido.' });

    let typeId = room_type_id ? Number(room_type_id) : null;
    if (!typeId) {
      const defaultType = await db.get(
        'SELECT id FROM room_types WHERE hotel_id = ? AND active = 1 LIMIT 1',
        [hotelId]
      );
      if (defaultType) typeId = defaultType.id;
    }

    const cleanNumber = String(number).trim();
    const check = await db.get(
      'SELECT id, active FROM rooms WHERE hotel_id = ? AND number = ?',
      [hotelId, cleanNumber]
    );
    if (check) {
      if (Number(check.active) === 0) {
        return res.status(400).json({
          error: `La habitación ${cleanNumber} ya existe como desactivada en este hotel. Puedes reactivarla desde el filtro de inactivas.`
        });
      }
      return res.status(400).json({ error: 'La habitación ya existe en este establecimiento.' });
    }

    const numericPrice = price !== undefined && price !== '' ? Number(price) : null;
    const numericRate3 = rate_3_days !== undefined && rate_3_days !== '' && rate_3_days !== null ? Number(rate_3_days) : null;
    const numericRateWeekly = rate_weekly !== undefined && rate_weekly !== '' && rate_weekly !== null ? Number(rate_weekly) : null;
    const numericCapacity = capacity !== undefined && capacity !== '' && capacity !== null ? Number(capacity) : null;
    const initialStatus = normalizeRoomStatus(status || 'DISPONIBLE');
    const photosStr = JSON.stringify(parsePhotosJson(photos));
    const nowIso = new Date().toISOString();

    const createdRoomId = await db.withTransaction(async (tx) => {
      const ins = await tx.run(
        `INSERT INTO rooms (
          hotel_id, room_type_id, number, floor, price_override, rate_3_days, rate_weekly,
          capacity, bed_config, amenities, photos, status, observations, active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          hotelId,
          typeId,
          cleanNumber,
          floor || '1',
          numericPrice,
          numericRate3,
          numericRateWeekly,
          numericCapacity,
          bed_config || null,
          amenities || null,
          photosStr,
          initialStatus,
          observations || ''
        ]
      );

      await tx.run(
        `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
         VALUES (?, ?, ?, NULL, ?, ?, 0, ?, ?)`,
        [
          hotelId,
          ins.id,
          inferHistoryCategory(initialStatus),
          initialStatus,
          observations ? `Habitación creada. ${observations}` : 'Habitación creada en el inventario del hotel.',
          req.user?.id || 1,
          nowIso
        ]
      );

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'CREAR_HABITACION', 'HABITACIONES', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          ins.id,
          `Habitación #${cleanNumber} (Piso ${floor || '1'}) creada con tarifa $${numericPrice || 0}`,
          getTodayString()
        ]
      );

      return ins.id;
    });

    res.status(201).json({ id: createdRoomId, message: 'Habitación creada exitosamente.' });
  } catch (error) {
    console.error('Error al crear habitación:', error);
    res.status(500).json({ error: 'Error del servidor al crear habitación' });
  }
};

exports.updateRoom = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const roomId = req.params.id;
    const {
      number,
      price,
      rate_3_days,
      rate_weekly,
      capacity,
      bed_config,
      amenities,
      photos,
      status,
      observations,
      room_type_id,
      floor,
      guest_name,
      guest_document,
      guest_phone,
      payment_type,
      next_payment_date,
      pending_balance
    } = req.body;

    if (!number) return res.status(400).json({ error: 'El número de habitación es requerido.' });

    const existingRoom = await db.get(
      'SELECT * FROM rooms WHERE id = ? AND hotel_id = ?',
      [roomId, hotelId]
    );
    if (!existingRoom) {
      return res.status(404).json({ error: 'Habitación no encontrada en este establecimiento.' });
    }

    const check = await db.get(
      'SELECT id FROM rooms WHERE hotel_id = ? AND number = ? AND id != ?',
      [hotelId, String(number).trim(), roomId]
    );
    if (check) return res.status(400).json({ error: 'El número de habitación ya está en uso en este hotel.' });

    const targetStatus = status ? normalizeRoomStatus(status) : normalizeRoomStatus(existingRoom.status);
    const prevStatus = normalizeRoomStatus(existingRoom.status);

    await db.withTransaction(async (tx) => {
      const numericPrice = price !== undefined && price !== '' ? Number(price) : null;
      const numericRate3 =
        rate_3_days !== undefined ? (rate_3_days !== '' && rate_3_days !== null ? Number(rate_3_days) : null) : existingRoom.rate_3_days;
      const numericRateWeekly =
        rate_weekly !== undefined ? (rate_weekly !== '' && rate_weekly !== null ? Number(rate_weekly) : null) : existingRoom.rate_weekly;
      const numericCapacity =
        capacity !== undefined ? (capacity !== '' && capacity !== null ? Number(capacity) : null) : existingRoom.capacity;
      const photosStr = photos !== undefined ? JSON.stringify(parsePhotosJson(photos)) : existingRoom.photos;

      await tx.run(
        `UPDATE rooms
         SET number = ?,
             floor = COALESCE(?, floor),
             price_override = COALESCE(?, price_override),
             rate_3_days = ?,
             rate_weekly = ?,
             capacity = ?,
             bed_config = COALESCE(?, bed_config),
             amenities = COALESCE(?, amenities),
             photos = COALESCE(?, photos),
             status = ?,
             observations = ?,
             room_type_id = COALESCE(?, room_type_id)
         WHERE id = ? AND hotel_id = ?`,
        [
          String(number).trim(),
          floor || null,
          numericPrice,
          numericRate3,
          numericRateWeekly,
          numericCapacity,
          bed_config !== undefined ? bed_config : null,
          amenities !== undefined ? amenities : null,
          photosStr,
          targetStatus,
          observations !== undefined ? observations : existingRoom.observations || '',
          room_type_id ? Number(room_type_id) : null,
          roomId,
          hotelId
        ]
      );

      if (targetStatus !== prevStatus) {
        await tx.run(
          `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [
            hotelId,
            roomId,
            inferHistoryCategory(targetStatus),
            prevStatus,
            targetStatus,
            observations || `Cambio de estado operativo: ${prevStatus} → ${targetStatus}`,
            req.user?.id || 1,
            new Date().toISOString()
          ]
        );
      }

      // Si hay estadía activa para esta habitación, actualizar también datos del huésped y su folio
      const activeStay = await tx.get(
        "SELECT * FROM stays WHERE room_id = ? AND hotel_id = ? AND status = 'ACTIVA' LIMIT 1",
        [roomId, hotelId]
      );

      if (activeStay && guest_name) {
        await tx.run(
          `UPDATE guests
           SET first_name = ?, last_name = '', document = ?, phone = ?
           WHERE id = ? AND hotel_id = ?`,
          [guest_name.trim(), guest_document || '', guest_phone || '', activeStay.guest_id, hotelId]
        );

        await tx.run(
          `UPDATE stays
           SET payment_type = COALESCE(?, payment_type),
               next_payment_date = COALESCE(?, next_payment_date),
               rate_per_period = COALESCE(?, rate_per_period)
           WHERE id = ? AND hotel_id = ?`,
          [payment_type || null, next_payment_date || null, numericPrice, activeStay.id, hotelId]
        );

        if (pending_balance !== undefined) {
          await tx.run(
            'UPDATE guest_accounts SET balance = ? WHERE stay_id = ? AND hotel_id = ?',
            [Number(pending_balance || 0), activeStay.id, hotelId]
          );
        }
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'ACTUALIZAR_HABITACION', 'HABITACIONES', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          roomId,
          `Habitación #${String(number).trim()} actualizada (Estado: ${targetStatus})`,
          getTodayString()
        ]
      );
    });

    res.json({ message: 'Habitación actualizada exitosamente.' });
  } catch (error) {
    console.error('Error al actualizar habitación:', error);
    res.status(500).json({ error: 'Error del servidor al actualizar habitación' });
  }
};

exports.changeRoomStatus = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const roomId = req.params.id;
    const { status, notes, category, cost } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'El nuevo estado operativo de la habitación es obligatorio.' });
    }

    const normalizedNew = normalizeRoomStatus(status);
    if (!VALID_ROOM_STATUSES.includes(normalizedNew)) {
      return res.status(400).json({ error: 'Estado operativo de habitación no válido.' });
    }

    const room = await db.get('SELECT * FROM rooms WHERE id = ? AND hotel_id = ?', [roomId, hotelId]);
    if (!room) {
      return res.status(404).json({ error: 'Habitación no encontrada en este establecimiento.' });
    }

    const activeStay = await db.get(
      "SELECT id FROM stays WHERE room_id = ? AND hotel_id = ? AND status = 'ACTIVA' LIMIT 1",
      [roomId, hotelId]
    );

    if (
      activeStay &&
      ['DISPONIBLE', 'LIMPIA', 'FUERA_DE_SERVICIO', 'MANTENIMIENTO'].includes(normalizedNew)
    ) {
      return res.status(400).json({
        error:
          'Esta habitación tiene un huésped alojado actualmente. Realiza primero el Check-out antes de liberarla o bloquearla.'
      });
    }

    const prevStatus = normalizeRoomStatus(room.status);
    const resolvedCategory = category || inferHistoryCategory(normalizedNew);
    const numericCost = cost ? Number(cost) : 0;

    await db.withTransaction(async (tx) => {
      await tx.run(
        `UPDATE rooms
         SET status = ?,
             observations = COALESCE(?, observations)
         WHERE id = ? AND hotel_id = ?`,
        [normalizedNew, notes !== undefined ? notes : null, roomId, hotelId]
      );

      await tx.run(
        `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          hotelId,
          roomId,
          resolvedCategory,
          prevStatus,
          normalizedNew,
          notes || `Transición de estado: ${prevStatus} → ${normalizedNew}`,
          numericCost,
          req.user?.id || 1,
          new Date().toISOString()
        ]
      );

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'CAMBIO_ESTADO_HABITACION', 'HABITACIONES', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          roomId,
          `Hab. #${room.number}: ${prevStatus} → ${normalizedNew}${notes ? ' (' + notes + ')' : ''}`,
          getTodayString()
        ]
      );
    });

    res.json({
      message: `Estado de habitación #${room.number} actualizado a ${normalizedNew.replace(/_/g, ' ')}.`,
      status: normalizedNew
    });
  } catch (error) {
    console.error('Error al cambiar estado de habitación:', error);
    res.status(500).json({ error: 'Error al cambiar el estado operativo de la habitación.' });
  }
};

exports.deleteRoom = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const roomId = req.params.id;
    const forceDeactivate = req.query.mode === 'deactivate';

    const room = await db.get('SELECT * FROM rooms WHERE id = ? AND hotel_id = ?', [roomId, hotelId]);
    if (!room) return res.status(404).json({ error: 'Habitación no encontrada.' });

    const activeStay = await db.get(
      "SELECT id FROM stays WHERE room_id = ? AND hotel_id = ? AND status = 'ACTIVA' LIMIT 1",
      [roomId, hotelId]
    );

    if (room.status === 'OCUPADA' || room.status === 'RESERVADA' || activeStay) {
      return res.status(400).json({
        error: 'No se puede eliminar ni desactivar una habitación ocupada o reservada.'
      });
    }

    const staysHistory = await db.get('SELECT COUNT(*) as c FROM stays WHERE room_id = ?', [roomId]);
    const resHistory = await db.get('SELECT COUNT(*) as c FROM reservation_rooms WHERE room_id = ?', [roomId]);
    const hasHistory = Number(staysHistory?.c || 0) > 0 || Number(resHistory?.c || 0) > 0;

    if (hasHistory || forceDeactivate) {
      await db.withTransaction(async (tx) => {
        await tx.run('UPDATE rooms SET active = 0 WHERE id = ? AND hotel_id = ?', [roomId, hotelId]);
        await tx.run(
          `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
           VALUES (?, ?, 'STATUS_CHANGE', ?, 'DESACTIVADA', 'Habitación desactivada con protección de historial.', 0, ?, ?)`,
          [hotelId, roomId, room.status, req.user?.id || 1, new Date().toISOString()]
        );
        await tx.run(
          `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
           VALUES (?, ?, 'DESACTIVAR_HABITACION', 'HABITACIONES', ?, ?, ?)`,
          [
            hotelId,
            req.user?.id || 1,
            roomId,
            `Habitación #${room.number} desactivada protegiendo historial (${staysHistory?.c || 0} estadías)`,
            getTodayString()
          ]
        );
      });
      return res.json({
        deactivated: true,
        message: 'Habitación desactivada conservando intacto su historial de estadías y movimientos.'
      });
    }

    await db.withTransaction(async (tx) => {
      await tx.run('DELETE FROM room_history WHERE room_id = ? AND hotel_id = ?', [roomId, hotelId]);
      await tx.run('DELETE FROM rooms WHERE id = ? AND hotel_id = ?', [roomId, hotelId]);
      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'ELIMINAR_HABITACION', 'HABITACIONES', ?, ?, ?)`,
        [hotelId, req.user?.id || 1, roomId, `Habitación #${room.number} eliminada (sin historial previo)`, getTodayString()]
      );
    });

    res.json({ deactivated: false, message: 'Habitación eliminada exitosamente.' });
  } catch (error) {
    console.error('Error al eliminar habitación:', error);
    res.status(500).json({ error: 'Error del servidor al eliminar habitación' });
  }
};

exports.activateRoom = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const roomId = req.params.id;

    const room = await db.get('SELECT * FROM rooms WHERE id = ? AND hotel_id = ?', [roomId, hotelId]);
    if (!room) return res.status(404).json({ error: 'Habitación no encontrada.' });

    await db.withTransaction(async (tx) => {
      await tx.run(
        "UPDATE rooms SET active = 1, status = 'DISPONIBLE' WHERE id = ? AND hotel_id = ?",
        [roomId, hotelId]
      );
      await tx.run(
        `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
         VALUES (?, ?, 'STATUS_CHANGE', 'DESACTIVADA', 'DISPONIBLE', 'Habitación reactivada para operación.', 0, ?, ?)`,
        [hotelId, roomId, req.user?.id || 1, new Date().toISOString()]
      );
    });

    res.json({ message: `Habitación #${room.number} reactivada y disponible.` });
  } catch (error) {
    console.error('Error al reactivar habitación:', error);
    res.status(500).json({ error: 'Error al reactivar habitación.' });
  }
};

exports.getRoomHistory = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const roomId = req.params.id;

    const room = await db.get(
      `SELECT r.*, rt.name as room_type_name
       FROM rooms r
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       WHERE r.id = ? AND r.hotel_id = ?`,
      [roomId, hotelId]
    );
    if (!room) return res.status(404).json({ error: 'Habitación no encontrada.' });

    const occupancyHistory = await db.query(
      `SELECT
        s.id as stay_id,
        s.check_in_time,
        s.check_out_time,
        s.payment_type,
        s.next_payment_date,
        s.rate_per_period,
        s.status,
        s.observations,
        g.first_name,
        g.last_name,
        g.document as guest_document,
        g.phone as guest_phone,
        ga.total_charges,
        ga.total_paid,
        ga.balance
       FROM stays s
       LEFT JOIN guests g ON s.guest_id = g.id
       LEFT JOIN guest_accounts ga ON ga.stay_id = s.id
       WHERE s.room_id = ? AND s.hotel_id = ?
       ORDER BY s.id DESC
       LIMIT 60`,
      [roomId, hotelId]
    );

    const events = await db.query(
      `SELECT
        rh.id,
        rh.category,
        rh.previous_status,
        rh.new_status,
        rh.notes,
        rh.cost,
        rh.created_at,
        u.full_name as user_name,
        u.role as user_role
       FROM room_history rh
       LEFT JOIN users u ON rh.user_id = u.id
       WHERE rh.room_id = ? AND rh.hotel_id = ?
       ORDER BY rh.id DESC
       LIMIT 100`,
      [roomId, hotelId]
    );

    const cleaningHistory = events.filter(
      (e) =>
        e.category === 'CLEANING' ||
        ['PENDIENTE_LIMPIEZA', 'EN_LIMPIEZA', 'LIMPIA', 'INSPECCION_PENDIENTE'].includes(e.new_status)
    );

    const maintenanceHistory = events.filter(
      (e) =>
        e.category === 'MAINTENANCE' ||
        ['MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(e.new_status)
    );

    res.json({
      room: {
        id: room.id,
        number: room.number,
        floor: room.floor || '1',
        room_type_name: room.room_type_name || 'Estándar',
        status: normalizeRoomStatus(room.status),
        active: Number(room.active ?? 1)
      },
      occupancy_history: occupancyHistory.map((st) => ({
        ...st,
        guest_name: `${st.first_name || ''}${st.last_name ? ' ' + st.last_name : ''}`.trim() || 'Huésped',
        rate_per_period: Number(st.rate_per_period || 0),
        total_charges: Number(st.total_charges || 0),
        total_paid: Number(st.total_paid || 0),
        balance: Number(st.balance || 0)
      })),
      cleaning_history: cleaningHistory,
      maintenance_history: maintenanceHistory.map((m) => ({
        ...m,
        cost: Number(m.cost || 0)
      })),
      all_events: events
    });
  } catch (error) {
    console.error('Error al consultar historial de habitación:', error);
    res.status(500).json({ error: 'Error al obtener el historial de la habitación.' });
  }
};

exports.addRoomHistoryEvent = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const roomId = req.params.id;
    const { category, new_status, notes, cost } = req.body;

    const room = await db.get('SELECT * FROM rooms WHERE id = ? AND hotel_id = ?', [roomId, hotelId]);
    if (!room) return res.status(404).json({ error: 'Habitación no encontrada.' });

    const prevStatus = normalizeRoomStatus(room.status);
    const targetStatus = new_status ? normalizeRoomStatus(new_status) : prevStatus;
    const resolvedCategory = category || inferHistoryCategory(targetStatus);
    const numericCost = cost ? Number(cost) : 0;

    await db.withTransaction(async (tx) => {
      if (targetStatus !== prevStatus) {
        await tx.run('UPDATE rooms SET status = ? WHERE id = ? AND hotel_id = ?', [
          targetStatus,
          roomId,
          hotelId
        ]);
      }

      await tx.run(
        `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          hotelId,
          roomId,
          resolvedCategory,
          prevStatus,
          targetStatus,
          notes || 'Registro manual en bitácora de habitación',
          numericCost,
          req.user?.id || 1,
          new Date().toISOString()
        ]
      );
    });

    res.status(201).json({ message: 'Evento registrado en el historial de la habitación.' });
  } catch (error) {
    console.error('Error al registrar evento de habitación:', error);
    res.status(500).json({ error: 'Error al registrar evento en el historial.' });
  }
};

// Check-in / Asignar Huésped a Habitación
exports.assignGuest = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const roomId = req.params.id;
    const { name, document, phone, checkInDate, paymentType, initialPayment } = req.body;

    if (!name || !checkInDate || !paymentType) {
      return res.status(400).json({ error: 'Nombre, fecha de ingreso y frecuencia de pago son obligatorios.' });
    }

    const room = await db.get(
      `SELECT r.*, COALESCE(r.price_override, rt.base_price, 0) as price
       FROM rooms r
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       WHERE r.id = ? AND r.hotel_id = ? AND r.active = 1`,
      [roomId, hotelId]
    );

    if (!room) return res.status(404).json({ error: 'Habitación no encontrada.' });
    if (room.status === 'OCUPADA') {
      return res.status(400).json({ error: 'La habitación ya se encuentra ocupada.' });
    }

    const roomPrice = Number(room.price || 0);
    const interval = getPaymentIntervalDays(paymentType);
    const formattedCheckIn = formatDate(checkInDate);
    const nextPaymentDate = addDaysToDateStr(formattedCheckIn, interval);

    const paidAmount =
      initialPayment !== undefined && initialPayment !== null && initialPayment !== ''
        ? Math.max(0, Number(initialPayment))
        : roomPrice;

    const initialPendingBalance = Math.max(0, roomPrice - paidAmount);
    const prevStatus = normalizeRoomStatus(room.status);

    await db.withTransaction(async (tx) => {
      const gRes = await tx.run(
        `INSERT INTO guests (hotel_id, first_name, last_name, doc_type, document, phone, nationality, created_at)
         VALUES (?, ?, '', 'CC', ?, ?, 'Colombiana', ?)`,
        [hotelId, name.trim(), document || '', phone || '', formattedCheckIn]
      );

      const stayRes = await tx.run(
        `INSERT INTO stays (hotel_id, room_id, guest_id, check_in_time, payment_type, next_payment_date, rate_per_period, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVA')`,
        [hotelId, roomId, gRes.id, formattedCheckIn, paymentType, nextPaymentDate, roomPrice]
      );

      const accRes = await tx.run(
        `INSERT INTO guest_accounts (hotel_id, stay_id, total_charges, total_paid, balance, status)
         VALUES (?, ?, ?, ?, ?, 'ABIERTA')`,
        [hotelId, stayRes.id, roomPrice, paidAmount, initialPendingBalance]
      );

      await tx.run(
        `INSERT INTO account_charges (hotel_id, account_id, type, description, amount, date, user_id)
         VALUES (?, ?, 'HOSPEDAJE', ?, ?, ?, ?)`,
        [hotelId, accRes.id, `Cargo inicial de alojamiento (${paymentType})`, roomPrice, formattedCheckIn, req.user?.id || 1]
      );

      await tx.run('UPDATE rooms SET status = ? WHERE id = ? AND hotel_id = ?', ['OCUPADA', roomId, hotelId]);

      await tx.run(
        `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
         VALUES (?, ?, 'OCCUPANCY', ?, 'OCUPADA', ?, 0, ?, ?)`,
        [
          hotelId,
          roomId,
          prevStatus,
          `Check-in huésped: ${name.trim()} (${paymentType})`,
          req.user?.id || 1,
          new Date().toISOString()
        ]
      );

      if (paidAmount > 0) {
        const payRes = await tx.run(
          `INSERT INTO payments (hotel_id, account_id, method, amount, date, reference, user_id)
           VALUES (?, ?, 'Efectivo', ?, ?, 'Pago inicial Check-in', ?)`,
          [hotelId, accRes.id, paidAmount, formattedCheckIn, req.user?.id || 1]
        );

        const registerId = await ensureOpenCashRegister(tx, hotelId, req.user?.id || 1);
        const txDesc =
          initialPendingBalance > 0
            ? `Abono inicial Check-in: ${name.trim()} (Hab. ${room.number}) - Saldo pendiente: $${initialPendingBalance.toLocaleString('de-DE')}`
            : `Check-in Huésped: ${name.trim()} (Hab. ${room.number}) - Pago completo`;

        await tx.run(
          `INSERT INTO cash_movements (hotel_id, register_id, type, amount, category, payment_method, description, date, payment_id, user_id)
           VALUES (?, ?, 'INGRESO', ?, 'Hospedaje', 'Efectivo', ?, ?, ?, ?)`,
          [hotelId, registerId, paidAmount, txDesc, formattedCheckIn, payRes.id, req.user?.id || 1]
        );
      }
    });

    res.status(201).json({ message: 'Huésped registrado (Check-in) con éxito.' });
  } catch (error) {
    console.error('Error en Check-in:', error);
    res.status(500).json({ error: 'Error al realizar el Check-in del huésped.' });
  }
};

// Registrar Pago o Abono de Hospedaje
exports.registerPayment = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const roomId = req.params.id;
    const { amount, date, method } = req.body;

    const payAmount = Number(amount);
    if (!payAmount || payAmount <= 0) {
      return res.status(400).json({ error: 'El monto del pago debe ser mayor a cero.' });
    }

    const activeStay = await db.get(
      `SELECT
        s.*,
        r.number as room_number,
        COALESCE(r.price_override, rt.base_price, 0) as room_price,
        g.first_name,
        g.last_name,
        ga.id as account_id,
        ga.balance as pending_balance,
        ga.total_charges,
        ga.total_paid
       FROM stays s
       JOIN rooms r ON s.room_id = r.id
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       JOIN guests g ON s.guest_id = g.id
       JOIN guest_accounts ga ON ga.stay_id = s.id
       WHERE s.room_id = ? AND s.hotel_id = ? AND s.status = 'ACTIVA'
       LIMIT 1`,
      [roomId, hotelId]
    );

    if (!activeStay) {
      return res.status(404).json({ error: 'No hay una estadía activa en esta habitación.' });
    }

    const roomPrice = Number(activeStay.room_price || 0);
    const interval = getPaymentIntervalDays(activeStay.payment_type);
    const pendingInfo = calculateStayPendingInfo(activeStay, roomPrice);
    const paymentDate = formatDate(date || getTodayString());

    let newNextPayment = activeStay.next_payment_date;
    let newPendingBalance = 0;

    if (pendingInfo.accruedPeriods > 0) {
      newNextPayment = addDaysToDateStr(activeStay.next_payment_date, pendingInfo.accruedPeriods * interval);
      newPendingBalance = Math.max(0, pendingInfo.totalPending - payAmount);
    } else if (pendingInfo.pendingBalance > 0) {
      if (payAmount >= pendingInfo.pendingBalance) {
        const leftover = payAmount - pendingInfo.pendingBalance;
        if (leftover > 0) {
          newNextPayment = addDaysToDateStr(activeStay.next_payment_date, interval);
          newPendingBalance = Math.max(0, roomPrice - leftover);
        } else {
          newPendingBalance = 0;
        }
      } else {
        newPendingBalance = pendingInfo.pendingBalance - payAmount;
      }
    } else {
      newNextPayment = addDaysToDateStr(activeStay.next_payment_date, interval);
      newPendingBalance = Math.max(0, roomPrice - payAmount);
    }

    const guestFullName = `${activeStay.first_name}${activeStay.last_name ? ' ' + activeStay.last_name : ''}`.trim();

    await db.withTransaction(async (tx) => {
      await tx.run(
        'UPDATE stays SET next_payment_date = ? WHERE id = ? AND hotel_id = ?',
        [newNextPayment, activeStay.id, hotelId]
      );

      await tx.run(
        `UPDATE guest_accounts
         SET total_paid = COALESCE(total_paid, 0) + ?,
             balance = ?
         WHERE id = ? AND hotel_id = ?`,
        [payAmount, newPendingBalance, activeStay.account_id, hotelId]
      );

      await tx.run('UPDATE rooms SET status = ? WHERE id = ? AND hotel_id = ?', ['OCUPADA', roomId, hotelId]);

      const payRes = await tx.run(
        `INSERT INTO payments (hotel_id, account_id, method, amount, date, reference, user_id)
         VALUES (?, ?, ?, ?, ?, 'Abono/Pago de estancia', ?)`,
        [hotelId, activeStay.account_id, method || 'Efectivo', payAmount, paymentDate, req.user?.id || 1]
      );

      const registerId = await ensureOpenCashRegister(tx, hotelId, req.user?.id || 1);
      const description =
        newPendingBalance > 0
          ? `Abono a hospedaje: ${guestFullName} (Hab. ${activeStay.room_number}) - Pendiente: $${newPendingBalance.toLocaleString('de-DE')}`
          : `Pago total de hospedaje: ${guestFullName} (Hab. ${activeStay.room_number})`;

      await tx.run(
        `INSERT INTO cash_movements (hotel_id, register_id, type, amount, category, payment_method, description, date, payment_id, user_id)
         VALUES (?, ?, 'INGRESO', ?, 'Hospedaje', ?, ?, ?, ?, ?)`,
        [hotelId, registerId, payAmount, method || 'Efectivo', description, paymentDate, payRes.id, req.user?.id || 1]
      );
    });

    res.json({
      message: 'Pago registrado con éxito.',
      pending_balance: newPendingBalance,
      next_payment_date: newNextPayment
    });
  } catch (error) {
    console.error('Error al registrar pago:', error);
    res.status(500).json({ error: 'Error al registrar el pago.' });
  }
};

// Check-out / Liberar Habitación
exports.checkoutRoom = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const roomId = req.params.id;
    const today = getTodayString();
    const nextStatus =
      req.body && req.body.nextStatus
        ? normalizeRoomStatus(req.body.nextStatus)
        : 'DISPONIBLE';

    await db.withTransaction(async (tx) => {
      const activeStay = await tx.get(
        "SELECT * FROM stays WHERE room_id = ? AND hotel_id = ? AND status = 'ACTIVA' LIMIT 1",
        [roomId, hotelId]
      );

      if (activeStay) {
        await tx.run(
          "UPDATE stays SET status = 'FINALIZADA', check_out_time = ? WHERE id = ? AND hotel_id = ?",
          [today, activeStay.id, hotelId]
        );
        await tx.run(
          "UPDATE guest_accounts SET status = 'CERRADA' WHERE stay_id = ? AND hotel_id = ?",
          [activeStay.id, hotelId]
        );
      }

      await tx.run(
        'UPDATE rooms SET status = ? WHERE id = ? AND hotel_id = ?',
        [nextStatus, roomId, hotelId]
      );

      await tx.run(
        `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
         VALUES (?, ?, 'OCCUPANCY', 'OCUPADA', ?, ?, 0, ?, ?)`,
        [
          hotelId,
          roomId,
          nextStatus,
          `Check-out de habitación completado. Estado asignado: ${nextStatus.replace(/_/g, ' ')}`,
          req.user?.id || 1,
          new Date().toISOString()
        ]
      );
    });

    res.json({
      message: 'Check-out realizado y habitación liberada con éxito.',
      status: nextStatus
    });
  } catch (error) {
    console.error('Error en Check-out:', error);
    res.status(500).json({ error: 'Error al realizar el Check-out de la habitación.' });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const movements = await db.query(
      `SELECT id, type, category, payment_method, amount, date, description
       FROM cash_movements
       WHERE hotel_id = ? AND COALESCE(voided, 0) = 0
       ORDER BY date DESC, id DESC
       LIMIT 100`,
      [hotelId]
    );

    const formatted = movements.map((m) => ({
      ...m,
      type: m.type === 'INGRESO' || m.type === 'Ingreso' ? 'Ingreso' : 'Gasto'
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error al obtener transacciones:', error);
    res.status(500).json({ error: 'Error del servidor al obtener transacciones' });
  }
};

exports.createTransaction = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { type, category, amount, date, description, payment_method } = req.body;

    if (!type || !category || !amount) {
      return res.status(400).json({ error: 'Tipo, categoría y monto son obligatorios.' });
    }

    const cleanType = type === 'Ingreso' || type === 'INGRESO' ? 'INGRESO' : 'EGRESO';
    const txDate = formatDate(date || getTodayString());

    await db.withTransaction(async (tx) => {
      const registerId = await ensureOpenCashRegister(tx, hotelId, req.user?.id || 1);
      await tx.run(
        `INSERT INTO cash_movements (hotel_id, register_id, type, amount, category, payment_method, description, date, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          hotelId,
          registerId,
          cleanType,
          Number(amount),
          category,
          payment_method || 'Efectivo',
          description || '',
          txDate,
          req.user?.id || 1
        ]
      );
    });

    res.status(201).json({ message: 'Movimiento financiero registrado con éxito.' });
  } catch (error) {
    console.error('Error al crear transacción:', error);
    res.status(500).json({ error: 'Error al registrar transacción.' });
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const txId = req.params.id;

    const existing = await db.get(
      'SELECT * FROM cash_movements WHERE id = ? AND hotel_id = ?',
      [txId, hotelId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Transacción no encontrada en este establecimiento.' });
    }

    await db.withTransaction(async (tx) => {
      await tx.run('UPDATE cash_movements SET voided = 1 WHERE id = ? AND hotel_id = ?', [txId, hotelId]);
      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'ANULAR_MOVIMIENTO_CAJA', 'CAJA', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          txId,
          `Movimiento anulado (${existing.type} - ${existing.category}: $${existing.amount})`,
          getTodayString()
        ]
      );
    });

    res.json({ message: 'Transacción anulada y registrada en auditoría.' });
  } catch (error) {
    console.error('Error al anular transacción:', error);
    res.status(500).json({ error: 'Error al eliminar transacción.' });
  }
};
