const db = require('../config/db');
const { getTodayString, formatDate } = require('../utils/date');

// 1. Overview de Personal (Fichas de Empleados, Turnos y Métricas de Rendimiento Operativo)
exports.getStaffOverview = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const today = getTodayString();
    const fromDate = req.query.from_date ? formatDate(req.query.from_date) : `${today.substring(0, 7)}-01`;
    const toDate = req.query.to_date ? formatDate(req.query.to_date) : today;

    const users = await db.query(
      `SELECT DISTINCT u.id, u.username, u.full_name, u.document, u.position,
              u.email, u.phone, u.role as global_role,
              COALESCE(uh.role, u.role) as hotel_role,
              u.active, u.last_login_at, u.created_at,
              ep.id as profile_id, ep.employee_code, ep.department, ep.contract_type,
              ep.hire_date, ep.base_salary, ep.eps, ep.arl,
              ep.emergency_contact, ep.emergency_phone, ep.shift_preference, ep.notes as profile_notes
       FROM users u
       LEFT JOIN user_hotels uh ON uh.user_id = u.id AND uh.hotel_id = ?
       LEFT JOIN employee_profiles ep ON ep.user_id = u.id AND ep.hotel_id = ?
       WHERE uh.active = 1
          OR (u.role IN ('PROPIETARIO', 'ADMIN') AND u.default_hotel_id = ?)
       ORDER BY u.active DESC, u.full_name ASC`,
      [hotelId, hotelId, hotelId]
    );

    const shifts = await db.query(
      `SELECT ss.*, u.full_name as employee_name, u.username, COALESCE(uh.role, u.role) as role
       FROM staff_shifts ss
       JOIN users u ON ss.user_id = u.id
       LEFT JOIN user_hotels uh ON uh.user_id = u.id AND uh.hotel_id = ss.hotel_id
       WHERE ss.hotel_id = ? AND ss.shift_date >= ? AND ss.shift_date <= ?
       ORDER BY ss.shift_date DESC, ss.id DESC`,
      [hotelId, fromDate, toDate]
    );

    // Métricas reales de rendimiento operativo por empleado
    const housekeepingMetrics = await db.query(
      `SELECT assigned_to as user_id,
              COUNT(*) as cleanings_completed,
              AVG(CASE WHEN duration_minutes > 0 THEN duration_minutes ELSE NULL END) as avg_minutes
       FROM housekeeping_tasks
       WHERE hotel_id = ? AND status IN ('COMPLETADA', 'APROBADA')
         AND assigned_to IS NOT NULL
         AND COALESCE(scheduled_date, created_at) >= ? AND COALESCE(scheduled_date, created_at) <= ?
       GROUP BY assigned_to`,
      [hotelId, fromDate, toDate]
    );

    const maintenanceMetrics = await db.query(
      `SELECT assigned_to as user_id,
              COUNT(*) as maintenance_resolved
       FROM maintenance_tickets
       WHERE hotel_id = ? AND status = 'RESUELTO' AND assigned_to IS NOT NULL
       GROUP BY assigned_to`,
      [hotelId]
    );

    const posMetrics = await db.query(
      `SELECT created_by as user_id,
              COUNT(*) as pos_orders_count,
              COALESCE(SUM(total_amount), 0) as pos_sales_total
       FROM service_orders
       WHERE hotel_id = ? AND status != 'ANULADA'
         AND order_date >= ? AND order_date <= ?
       GROUP BY created_by`,
      [hotelId, fromDate, toDate]
    );

    const cashMetrics = await db.query(
      `SELECT user_id, COUNT(*) as cash_shifts_count
       FROM cash_registers
       WHERE hotel_id = ?
       GROUP BY user_id`,
      [hotelId]
    );

    const auditMetrics = await db.query(
      `SELECT user_id, COUNT(*) as actions_count
       FROM audit_logs
       WHERE hotel_id = ? AND date >= ? AND date <= ?
       GROUP BY user_id`,
      [hotelId, fromDate, toDate]
    );

    const hkMap = new Map(housekeepingMetrics.map((r) => [r.user_id, r]));
    const mtMap = new Map(maintenanceMetrics.map((r) => [r.user_id, r]));
    const posMap = new Map(posMetrics.map((r) => [r.user_id, r]));
    const cashMap = new Map(cashMetrics.map((r) => [r.user_id, r]));
    const audMap = new Map(auditMetrics.map((r) => [r.user_id, r]));

    const staff = users.map((u) => {
      const hk = hkMap.get(u.id);
      const mt = mtMap.get(u.id);
      const pos = posMap.get(u.id);
      const csh = cashMap.get(u.id);
      const aud = audMap.get(u.id);
      const userShifts = shifts.filter((s) => s.user_id === u.id);

      return {
        ...u,
        role: u.hotel_role === 'ADMIN' ? 'PROPIETARIO' : u.hotel_role || u.global_role,
        base_salary: Number(u.base_salary || 0),
        metrics: {
          cleanings_completed: Number(hk?.cleanings_completed || 0),
          avg_cleaning_minutes: hk?.avg_minutes ? Math.round(Number(hk.avg_minutes)) : 0,
          maintenance_resolved: Number(mt?.maintenance_resolved || 0),
          pos_orders_count: Number(pos?.pos_orders_count || 0),
          pos_sales_total: Number(pos?.pos_sales_total || 0),
          cash_shifts_count: Number(csh?.cash_shifts_count || 0),
          audit_actions_count: Number(aud?.actions_count || 0),
          shifts_scheduled: userShifts.length,
          shifts_completed: userShifts.filter((s) => s.status === 'COMPLETADO').length
        }
      };
    });

    res.json({
      period: { from_date: fromDate, to_date: toDate },
      staff,
      shifts,
      kpis: {
        active_staff_count: staff.filter((s) => Number(s.active) === 1).length,
        shifts_today_count: shifts.filter((s) => s.shift_date === today).length,
        total_cleanings_period: staff.reduce((a, s) => a + s.metrics.cleanings_completed, 0),
        total_maintenance_resolved: staff.reduce((a, s) => a + s.metrics.maintenance_resolved, 0)
      }
    });
  } catch (error) {
    console.error('Error al cargar módulo de personal:', error);
    res.status(500).json({ error: 'Error al consultar las fichas y métricas del personal.' });
  }
};

// 2. Guardar o Actualizar Ficha de Empleado (HR) por Hotel
exports.saveEmployeeProfile = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const userId = Number(req.params.userId);
    const {
      employee_code,
      department,
      contract_type,
      hire_date,
      base_salary,
      eps,
      arl,
      emergency_contact,
      emergency_phone,
      shift_preference,
      notes,
      position,
      phone
    } = req.body;

    const user = await db.get('SELECT id, full_name FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'Empleado no encontrado.' });
    }

    const today = getTodayString();

    await db.withTransaction(async (tx) => {
      if (position !== undefined || phone !== undefined) {
        await tx.run(
          `UPDATE users
           SET position = COALESCE(?, position), phone = COALESCE(?, phone)
           WHERE id = ?`,
          [position !== undefined ? String(position).trim() : null, phone !== undefined ? String(phone).trim() : null, userId]
        );
      }

      const existing = await tx.get(
        'SELECT id FROM employee_profiles WHERE hotel_id = ? AND user_id = ?',
        [hotelId, userId]
      );

      if (existing) {
        await tx.run(
          `UPDATE employee_profiles
           SET employee_code = ?, department = ?, contract_type = ?, hire_date = ?,
               base_salary = ?, eps = ?, arl = ?, emergency_contact = ?, emergency_phone = ?,
               shift_preference = ?, notes = ?, updated_at = ?
           WHERE id = ? AND hotel_id = ?`,
          [
            (employee_code || '').trim(),
            (department || 'RECEPCION').trim(),
            (contract_type || 'Término Indefinido').trim(),
            hire_date ? formatDate(hire_date) : today,
            Math.max(0, Number(base_salary || 0)),
            (eps || '').trim(),
            (arl || '').trim(),
            (emergency_contact || '').trim(),
            (emergency_phone || '').trim(),
            (shift_preference || 'MAÑANA').trim(),
            (notes || '').trim(),
            today,
            existing.id,
            hotelId
          ]
        );
      } else {
        await tx.run(
          `INSERT INTO employee_profiles (
            hotel_id, user_id, employee_code, department, contract_type, hire_date,
            base_salary, eps, arl, emergency_contact, emergency_phone, shift_preference, notes, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            hotelId,
            userId,
            (employee_code || `EMP-${userId}`).trim(),
            (department || 'RECEPCION').trim(),
            (contract_type || 'Término Indefinido').trim(),
            hire_date ? formatDate(hire_date) : today,
            Math.max(0, Number(base_salary || 0)),
            (eps || '').trim(),
            (arl || '').trim(),
            (emergency_contact || '').trim(),
            (emergency_phone || '').trim(),
            (shift_preference || 'MAÑANA').trim(),
            (notes || '').trim(),
            today
          ]
        );
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'ACTUALIZAR_FICHA_EMPLEADO', 'PERSONAL', ?, ?, ?)`,
        [hotelId, req.user?.id || 1, userId, `Actualizada ficha laboral de ${user.full_name}`, today]
      );
    });

    res.json({ message: `Ficha laboral de ${user.full_name} guardada correctamente.` });
  } catch (error) {
    console.error('Error al guardar ficha de empleado:', error);
    res.status(500).json({ error: 'Error al guardar la ficha del empleado.' });
  }
};

// 3. Programar y Gestionar Turnos de Personal
exports.createShift = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { user_id, shift_date, shift_name, start_time, end_time, department, notes } = req.body;
    if (!user_id || !shift_date) {
      return res.status(400).json({ error: 'Empleado y fecha del turno son obligatorios.' });
    }

    const user = await db.get('SELECT id, full_name FROM users WHERE id = ?', [Number(user_id)]);
    if (!user) {
      return res.status(404).json({ error: 'Empleado no encontrado.' });
    }

    const nowIso = new Date().toISOString();
    const sDate = formatDate(shift_date);
    const ins = await db.run(
      `INSERT INTO staff_shifts (
        hotel_id, user_id, shift_date, shift_name, start_time, end_time, department, status, notes, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PROGRAMADO', ?, ?, ?)`,
      [
        hotelId,
        Number(user_id),
        sDate,
        (shift_name || 'MAÑANA').toUpperCase(),
        start_time || '06:00',
        end_time || '14:00',
        (department || 'RECEPCION').toUpperCase(),
        (notes || '').trim(),
        req.user?.id || 1,
        nowIso
      ]
    );

    const created = await db.get('SELECT * FROM staff_shifts WHERE id = ?', [ins.id]);
    res.status(201).json({ message: 'Turno programado correctamente.', shift: created });
  } catch (error) {
    console.error('Error al programar turno:', error);
    res.status(500).json({ error: 'Error al programar el turno.' });
  }
};

exports.updateShiftStatus = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const shiftId = Number(req.params.shiftId);
    const { status } = req.body;
    const valid = ['PROGRAMADO', 'EN_TURNO', 'COMPLETADO', 'AUSENTE'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: 'Estado de turno inválido.' });
    }

    await db.run('UPDATE staff_shifts SET status = ? WHERE id = ? AND hotel_id = ?', [
      status,
      shiftId,
      hotelId
    ]);
    res.json({ message: `Turno actualizado a ${status}.` });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar estado del turno.' });
  }
};

exports.deleteShift = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const shiftId = Number(req.params.shiftId);
    await db.run('DELETE FROM staff_shifts WHERE id = ? AND hotel_id = ?', [shiftId, hotelId]);
    res.json({ message: 'Turno eliminado.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar turno.' });
  }
};

// 4. Historial Completo de Actividades Asignadas por Empleado
exports.getEmployeeActivityHistory = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const userId = Number(req.params.userId);

    const user = await db.get(
      'SELECT id, username, full_name, role, position FROM users WHERE id = ?',
      [userId]
    );
    if (!user) {
      return res.status(404).json({ error: 'Empleado no encontrado.' });
    }

    const housekeeping = await db.query(
      `SELECT ht.id, ht.task_type, ht.status, ht.duration_minutes, ht.scheduled_date, ht.created_at,
              r.number as room_number
       FROM housekeeping_tasks ht
       JOIN rooms r ON ht.room_id = r.id
       WHERE ht.hotel_id = ? AND ht.assigned_to = ?
       ORDER BY ht.id DESC LIMIT 30`,
      [hotelId, userId]
    );

    const maintenance = await db.query(
      `SELECT mt.id, mt.ticket_number, mt.title, mt.issue_type, mt.status, mt.actual_cost, mt.created_at,
              r.number as room_number
       FROM maintenance_tickets mt
       JOIN rooms r ON mt.room_id = r.id
       WHERE mt.hotel_id = ? AND mt.assigned_to = ?
       ORDER BY mt.id DESC LIMIT 30`,
      [hotelId, userId]
    );

    const audits = await db.query(
      `SELECT id, action, module, details, date
       FROM audit_logs
       WHERE hotel_id = ? AND user_id = ?
       ORDER BY id DESC LIMIT 40`,
      [hotelId, userId]
    );

    const shifts = await db.query(
      `SELECT * FROM staff_shifts
       WHERE hotel_id = ? AND user_id = ?
       ORDER BY shift_date DESC, id DESC LIMIT 30`,
      [hotelId, userId]
    );

    res.json({
      employee: user,
      housekeeping_tasks: housekeeping,
      maintenance_tickets: maintenance,
      shifts,
      audit_logs: audits
    });
  } catch (error) {
    console.error('Error al consultar historial de actividades del empleado:', error);
    res.status(500).json({ error: 'Error al consultar historial del empleado.' });
  }
};

