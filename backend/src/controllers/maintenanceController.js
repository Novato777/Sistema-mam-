const db = require('../config/db');
const { getTodayString, formatDate } = require('../utils/date');

const safeParseJsonArray = (raw) => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const buildTicketNumber = (hotelId, id) =>
  `MNT-H${hotelId}-${String(id).padStart(5, '0')}`;

const enrichTicket = (t) => ({
  ...t,
  ticket_number: t.ticket_number || buildTicketNumber(t.hotel_id, t.id),
  estimated_cost: Number(t.estimated_cost || 0),
  materials_cost: Number(t.materials_cost || 0),
  labor_cost: Number(t.labor_cost || 0),
  actual_cost: Number(t.actual_cost || 0),
  block_room: Number(t.block_room || 0),
  evidence: safeParseJsonArray(t.evidence_json)
});

// 1. Overview de Mantenimiento Preventivo y Correctivo
exports.getOverview = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const today = getTodayString();
    const currentMonth = today.substring(0, 7);
    const { status, issue_type, room_id } = req.query;

    let sql = `
      SELECT mt.*,
             r.number as room_number,
             r.floor as room_floor,
             r.status as room_status,
             rt.name as room_type_name,
             u_rep.full_name as reported_by_name,
             u_ass.full_name as assigned_to_name,
             u_ass.role as assigned_to_role
      FROM maintenance_tickets mt
      JOIN rooms r ON mt.room_id = r.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      LEFT JOIN users u_rep ON mt.reported_by = u_rep.id
      LEFT JOIN users u_ass ON mt.assigned_to = u_ass.id
      WHERE mt.hotel_id = ?
    `;
    const params = [hotelId];

    if (status && status !== 'ALL') {
      sql += ' AND mt.status = ?';
      params.push(status);
    }
    if (issue_type && issue_type !== 'ALL') {
      sql += ' AND mt.issue_type = ?';
      params.push(issue_type);
    }
    if (room_id) {
      sql += ' AND mt.room_id = ?';
      params.push(Number(room_id));
    }
    sql += " ORDER BY CASE mt.status WHEN 'PENDIENTE' THEN 0 WHEN 'EN_PROCESO' THEN 1 ELSE 2 END, mt.id DESC";

    const rawTickets = await db.query(sql, params);
    const tickets = rawTickets.map(enrichTicket);

    const rooms = await db.query(
      `SELECT r.id, r.number, r.floor, r.status, rt.name as room_type_name
       FROM rooms r
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       WHERE r.hotel_id = ? AND COALESCE(r.active, 1) = 1
       ORDER BY r.number ASC`,
      [hotelId]
    );

    const staff = await db.query(
      `SELECT DISTINCT u.id, u.username, u.full_name, COALESCE(uh.role, u.role) as role
       FROM users u
       LEFT JOIN user_hotels uh ON uh.user_id = u.id AND uh.hotel_id = ?
       WHERE u.active = 1 AND (u.role IN ('PROPIETARIO', 'ADMIN') OR uh.active = 1)
       ORDER BY u.full_name ASC`,
      [hotelId]
    );

    const pendingCount = tickets.filter((t) => t.status === 'PENDIENTE').length;
    const inProgressCount = tickets.filter((t) => t.status === 'EN_PROCESO').length;
    const resolvedMonthCount = tickets.filter(
      (t) => t.status === 'RESUELTO' && String(t.resolved_at || '').startsWith(currentMonth)
    ).length;
    const preventiveScheduled = tickets.filter(
      (t) => t.issue_type === 'PREVENTIVO' && t.status !== 'RESUELTO' && t.status !== 'CANCELADO'
    ).length;
    const blockedRoomsCount = rooms.filter((r) =>
      ['MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(r.status)
    ).length;
    const totalCostMonth = tickets
      .filter((t) => t.status === 'RESUELTO' && String(t.resolved_at || t.created_at || '').startsWith(currentMonth))
      .reduce((acc, t) => acc + Number(t.actual_cost || 0), 0);

    res.json({
      tickets,
      rooms,
      staff,
      kpis: {
        pending_count: pendingCount,
        in_progress_count: inProgressCount,
        resolved_month_count: resolvedMonthCount,
        preventive_scheduled_count: preventiveScheduled,
        blocked_rooms_count: blockedRoomsCount,
        total_cost_month: Math.round(totalCostMonth * 100) / 100
      }
    });
  } catch (error) {
    console.error('Error al cargar módulo de mantenimiento:', error);
    res.status(500).json({ error: 'Error al cargar el módulo de mantenimiento.' });
  }
};

// 2. Crear Solicitud / Orden de Mantenimiento (Preventivo o Correctivo + Bloqueo Automático de Habitación)
exports.createTicket = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      room_id,
      issue_type = 'CORRECTIVO',
      category = 'General',
      priority = 'ALTA',
      title,
      description,
      scheduled_date,
      assigned_to,
      block_room = false,
      room_blocked_status = 'MANTENIMIENTO',
      estimated_cost = 0,
      materials_cost = 0,
      labor_cost = 0,
      evidence = []
    } = req.body;

    if (!room_id || !title || !String(title).trim()) {
      return res.status(400).json({ error: 'Habitación y título de la solicitud son obligatorios.' });
    }

    const iType = String(issue_type).toUpperCase() === 'PREVENTIVO' ? 'PREVENTIVO' : 'CORRECTIVO';
    const blockStatus =
      String(room_blocked_status).toUpperCase() === 'FUERA_DE_SERVICIO'
        ? 'FUERA_DE_SERVICIO'
        : 'MANTENIMIENTO';
    const today = getTodayString();
    const nowIso = new Date().toISOString();
    const schDate = scheduled_date ? formatDate(scheduled_date) : today;

    const created = await db.withTransaction(async (tx) => {
      const room = await tx.get(
        'SELECT * FROM rooms WHERE id = ? AND hotel_id = ? AND COALESCE(active, 1) = 1',
        [Number(room_id), hotelId]
      );
      if (!room) {
        const err = new Error('Habitación no encontrada en este establecimiento.');
        err.statusCode = 404;
        throw err;
      }

      if (block_room && room.status === 'OCUPADA') {
        const err = new Error(
          `No se puede bloquear la Hab. #${room.number} porque actualmente está OCUPADA. Realice primero el Check-out o cambio de habitación.`
        );
        err.statusCode = 400;
        throw err;
      }

      const evJson = JSON.stringify(safeParseJsonArray(evidence));
      const estCost = Math.max(0, Number(estimated_cost || 0));
      const matCost = Math.max(0, Number(materials_cost || 0));
      const labCost = Math.max(0, Number(labor_cost || 0));

      const ins = await tx.run(
        `INSERT INTO maintenance_tickets (
          hotel_id, room_id, reported_by, assigned_to, issue_type, category,
          priority, title, description, status, block_room, room_blocked_status,
          previous_room_status, scheduled_date, estimated_cost, materials_cost,
          labor_cost, actual_cost, evidence_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          hotelId,
          room.id,
          req.user?.id || 1,
          assigned_to ? Number(assigned_to) : null,
          iType,
          category,
          priority,
          String(title).trim(),
          (description || '').trim(),
          block_room ? 1 : 0,
          block_room ? blockStatus : null,
          room.status,
          schDate,
          estCost,
          matCost,
          labCost,
          matCost + labCost,
          evJson,
          nowIso
        ]
      );

      const tNum = buildTicketNumber(hotelId, ins.id);
      await tx.run('UPDATE maintenance_tickets SET ticket_number = ? WHERE id = ?', [tNum, ins.id]);

      if (block_room) {
        await tx.run(
          'UPDATE rooms SET status = ?, observations = ? WHERE id = ? AND hotel_id = ?',
          [blockStatus, `Bloqueada por ${tNum}: ${String(title).trim()}`, room.id, hotelId]
        );
        await tx.run(
          `INSERT INTO room_history (
            hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at
          ) VALUES (?, ?, 'MANTENIMIENTO', ?, ?, ?, 0, ?, ?)`,
          [
            hotelId,
            room.id,
            room.status,
            blockStatus,
            `[${tNum}] Bloqueo operativo (${iType}): ${String(title).trim()}`,
            req.user?.id || 1,
            nowIso
          ]
        );
      } else {
        await tx.run(
          `INSERT INTO room_history (
            hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at
          ) VALUES (?, ?, 'MANTENIMIENTO', ?, ?, ?, 0, ?, ?)`,
          [
            hotelId,
            room.id,
            room.status,
            room.status,
            `[${tNum}] Solicitud registrada (${iType}): ${String(title).trim()}`,
            req.user?.id || 1,
            nowIso
          ]
        );
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'CREAR_MANTENIMIENTO', 'MANTENIMIENTO', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          ins.id,
          `${tNum} (${iType}/${priority}) Hab. #${room.number}: ${String(title).trim()}${
            block_room ? ' [HABITACIÓN BLOQUEADA: ' + blockStatus + ']' : ''
          }`,
          today
        ]
      );

      return tx.get('SELECT * FROM maintenance_tickets WHERE id = ?', [ins.id]);
    });

    res.status(201).json({
      message: `Orden ${created.ticket_number} creada correctamente.`,
      ticket: enrichTicket(created)
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al crear orden de mantenimiento:', error);
    res.status(500).json({ error: 'Error al registrar la orden de mantenimiento.' });
  }
};

// 3. Iniciar / Asignar Tarea de Mantenimiento
exports.startTicket = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const ticketId = Number(req.params.ticketId);
    const { assigned_to, block_room, room_blocked_status } = req.body || {};

    const ticket = await db.get(
      'SELECT * FROM maintenance_tickets WHERE id = ? AND hotel_id = ?',
      [ticketId, hotelId]
    );
    if (!ticket) {
      return res.status(404).json({ error: 'Orden de mantenimiento no encontrada.' });
    }
    if (ticket.status === 'RESUELTO') {
      return res.status(400).json({ error: 'Esta orden ya fue resuelta.' });
    }

    const nowIso = new Date().toISOString();
    await db.withTransaction(async (tx) => {
      const room = await tx.get('SELECT * FROM rooms WHERE id = ? AND hotel_id = ?', [
        ticket.room_id,
        hotelId
      ]);
      const shouldBlock = block_room !== undefined ? Boolean(block_room) : Boolean(ticket.block_room);
      const blockStatus =
        String(room_blocked_status || ticket.room_blocked_status || 'MANTENIMIENTO').toUpperCase() ===
        'FUERA_DE_SERVICIO'
          ? 'FUERA_DE_SERVICIO'
          : 'MANTENIMIENTO';

      if (shouldBlock && room && room.status !== 'OCUPADA' && room.status !== blockStatus) {
        await tx.run('UPDATE rooms SET status = ? WHERE id = ? AND hotel_id = ?', [
          blockStatus,
          room.id,
          hotelId
        ]);
        await tx.run(
          `INSERT INTO room_history (
            hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at
          ) VALUES (?, ?, 'MANTENIMIENTO', ?, ?, ?, 0, ?, ?)`,
          [
            hotelId,
            room.id,
            room.status,
            blockStatus,
            `[${ticket.ticket_number || 'MNT-' + ticket.id}] Bloqueo al iniciar mantenimiento`,
            req.user?.id || 1,
            nowIso
          ]
        );
      }

      await tx.run(
        `UPDATE maintenance_tickets
         SET status = 'EN_PROCESO',
             assigned_to = COALESCE(?, assigned_to, ?),
             block_room = ?,
             room_blocked_status = COALESCE(?, room_blocked_status),
             started_at = COALESCE(started_at, ?)
         WHERE id = ? AND hotel_id = ?`,
        [
          assigned_to ? Number(assigned_to) : null,
          req.user?.id || 1,
          shouldBlock ? 1 : 0,
          shouldBlock ? blockStatus : null,
          nowIso,
          ticketId,
          hotelId
        ]
      );
    });

    res.json({ message: 'Orden de mantenimiento iniciada.' });
  } catch (error) {
    console.error('Error al iniciar mantenimiento:', error);
    res.status(500).json({ error: 'Error al iniciar la orden de mantenimiento.' });
  }
};

// 4. Actualizar programación, responsables, costos y evidencias
exports.updateTicket = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const ticketId = Number(req.params.ticketId);
    const existing = await db.get(
      'SELECT * FROM maintenance_tickets WHERE id = ? AND hotel_id = ?',
      [ticketId, hotelId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Orden de mantenimiento no encontrada.' });
    }

    const {
      assigned_to,
      priority,
      scheduled_date,
      materials_cost,
      labor_cost,
      description,
      evidence
    } = req.body;

    const matCost =
      materials_cost !== undefined ? Math.max(0, Number(materials_cost)) : Number(existing.materials_cost || 0);
    const labCost =
      labor_cost !== undefined ? Math.max(0, Number(labor_cost)) : Number(existing.labor_cost || 0);

    await db.run(
      `UPDATE maintenance_tickets
       SET assigned_to = ?,
           priority = ?,
           scheduled_date = ?,
           materials_cost = ?,
           labor_cost = ?,
           actual_cost = ?,
           description = ?,
           evidence_json = ?
       WHERE id = ? AND hotel_id = ?`,
      [
        assigned_to !== undefined ? (assigned_to ? Number(assigned_to) : null) : existing.assigned_to,
        priority || existing.priority,
        scheduled_date ? formatDate(scheduled_date) : existing.scheduled_date,
        matCost,
        labCost,
        matCost + labCost,
        description !== undefined ? String(description).trim() : existing.description,
        evidence !== undefined ? JSON.stringify(safeParseJsonArray(evidence)) : existing.evidence_json,
        ticketId,
        hotelId
      ]
    );

    const updated = await db.get('SELECT * FROM maintenance_tickets WHERE id = ?', [ticketId]);
    res.json({ message: 'Orden de mantenimiento actualizada.', ticket: enrichTicket(updated) });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la orden de mantenimiento.' });
  }
};

// 5. Resolver Orden de Mantenimiento (Con registro de costos, evidencias y desbloqueo automático sincronizado)
exports.resolveTicket = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const ticketId = Number(req.params.ticketId);
    const {
      materials_cost,
      labor_cost,
      actual_cost,
      resolution_notes,
      evidence,
      unlock_room = true,
      next_room_status = 'DISPONIBLE'
    } = req.body || {};

    const ticket = await db.get(
      'SELECT * FROM maintenance_tickets WHERE id = ? AND hotel_id = ?',
      [ticketId, hotelId]
    );
    if (!ticket) {
      return res.status(404).json({ error: 'Orden de mantenimiento no encontrada.' });
    }
    if (ticket.status === 'RESUELTO') {
      return res.status(400).json({ error: 'Esta orden ya fue resuelta.' });
    }

    const today = getTodayString();
    const nowIso = new Date().toISOString();

    const matCost =
      materials_cost !== undefined ? Math.max(0, Number(materials_cost)) : Number(ticket.materials_cost || 0);
    const labCost =
      labor_cost !== undefined ? Math.max(0, Number(labor_cost)) : Number(ticket.labor_cost || 0);
    const totalActual =
      actual_cost !== undefined && materials_cost === undefined && labor_cost === undefined
        ? Math.max(0, Number(actual_cost))
        : Math.round((matCost + labCost) * 100) / 100;

    const resolvedNextStatus =
      next_room_status === 'PENDIENTE_LIMPIEZA' ? 'PENDIENTE_LIMPIEZA' : 'DISPONIBLE';

    let roomUnlockedTo = null;

    await db.withTransaction(async (tx) => {
      await tx.run(
        `UPDATE maintenance_tickets
         SET status = 'RESUELTO',
             materials_cost = ?,
             labor_cost = ?,
             actual_cost = ?,
             resolution_notes = ?,
             evidence_json = ?,
             resolved_at = ?,
             unlocked_room_status = ?
         WHERE id = ? AND hotel_id = ?`,
        [
          matCost,
          labCost,
          totalActual,
          (resolution_notes || 'Mantenimiento completado satisfactoriamente.').trim(),
          evidence !== undefined ? JSON.stringify(safeParseJsonArray(evidence)) : ticket.evidence_json,
          nowIso,
          unlock_room ? resolvedNextStatus : null,
          ticketId,
          hotelId
        ]
      );

      const room = await tx.get('SELECT * FROM rooms WHERE id = ? AND hotel_id = ?', [
        ticket.room_id,
        hotelId
      ]);

      // Verificar si hay otras órdenes activas bloqueando la misma habitación
      const otherBlocking = await tx.get(
        `SELECT COUNT(*) as c FROM maintenance_tickets
         WHERE hotel_id = ? AND room_id = ? AND id != ?
           AND status IN ('PENDIENTE', 'EN_PROCESO') AND block_room = 1`,
        [hotelId, ticket.room_id, ticketId]
      );

      const isCurrentlyBlocked =
        room && ['MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(room.status);

      if (
        unlock_room &&
        isCurrentlyBlocked &&
        (!otherBlocking || Number(otherBlocking.c) === 0)
      ) {
        await tx.run(
          'UPDATE rooms SET status = ?, observations = ? WHERE id = ? AND hotel_id = ?',
          [resolvedNextStatus, '', room.id, hotelId]
        );
        roomUnlockedTo = resolvedNextStatus;

        if (resolvedNextStatus === 'PENDIENTE_LIMPIEZA') {
          await tx.run(
            `INSERT INTO housekeeping_tasks (
              hotel_id, room_id, task_type, priority, status, created_by, scheduled_date, notes, created_at
            ) VALUES (?, ?, 'ASEO_PROFUNDO', 'ALTA', 'PENDIENTE', ?, ?, ?, ?)`,
            [
              hotelId,
              room.id,
              req.user?.id || 1,
              today,
              `Limpieza posterior a mantenimiento ${ticket.ticket_number || '#' + ticket.id}`,
              today
            ]
          );
        }

        await tx.run(
          `INSERT INTO room_history (
            hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at
          ) VALUES (?, ?, 'MANTENIMIENTO', ?, ?, ?, ?, ?, ?)`,
          [
            hotelId,
            room.id,
            room.status,
            resolvedNextStatus,
            `[${ticket.ticket_number || 'MNT-' + ticket.id}] Resuelto y habitación desbloqueada -> ${resolvedNextStatus}. ${
              resolution_notes || ''
            }`,
            totalActual,
            req.user?.id || 1,
            nowIso
          ]
        );
      } else if (room) {
        await tx.run(
          `INSERT INTO room_history (
            hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at
          ) VALUES (?, ?, 'MANTENIMIENTO', ?, ?, ?, ?, ?, ?)`,
          [
            hotelId,
            room.id,
            room.status,
            room.status,
            `[${ticket.ticket_number || 'MNT-' + ticket.id}] Mantenimiento resuelto. ${resolution_notes || ''}`,
            totalActual,
            req.user?.id || 1,
            nowIso
          ]
        );
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'RESOLVER_MANTENIMIENTO', 'MANTENIMIENTO', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          ticketId,
          `Orden ${ticket.ticket_number || '#' + ticketId} resuelta (Costo: $${totalActual})${
            roomUnlockedTo ? ` · Hab. desbloqueada a ${roomUnlockedTo}` : ''
          }`,
          today
        ]
      );
    });

    res.json({
      message: roomUnlockedTo
        ? `Orden resuelta y habitación habilitada automáticamente como ${roomUnlockedTo}.`
        : 'Orden de mantenimiento resuelta correctamente.',
      unlocked_to: roomUnlockedTo
    });
  } catch (error) {
    console.error('Error al resolver mantenimiento:', error);
    res.status(500).json({ error: 'Error al resolver la orden de mantenimiento.' });
  }
};

// 6. Historial Técnico Completo por Habitación
exports.getRoomTechnicalHistory = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const roomId = Number(req.params.roomId);

    const room = await db.get(
      `SELECT r.*, rt.name as room_type_name
       FROM rooms r
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       WHERE r.id = ? AND r.hotel_id = ?`,
      [roomId, hotelId]
    );
    if (!room) {
      return res.status(404).json({ error: 'Habitación no encontrada.' });
    }

    const rawTickets = await db.query(
      `SELECT mt.*, u_rep.full_name as reported_by_name, u_ass.full_name as assigned_to_name
       FROM maintenance_tickets mt
       LEFT JOIN users u_rep ON mt.reported_by = u_rep.id
       LEFT JOIN users u_ass ON mt.assigned_to = u_ass.id
       WHERE mt.hotel_id = ? AND mt.room_id = ?
       ORDER BY mt.id DESC`,
      [hotelId, roomId]
    );
    const tickets = rawTickets.map(enrichTicket);

    const historyEvents = await db.query(
      `SELECT rh.*, u.full_name as user_name
       FROM room_history rh
       LEFT JOIN users u ON rh.user_id = u.id
       WHERE rh.hotel_id = ? AND rh.room_id = ?
       ORDER BY rh.id DESC
       LIMIT 100`,
      [hotelId, roomId]
    );

    const totalMaintenanceCost = tickets
      .filter((t) => t.status === 'RESUELTO')
      .reduce((acc, t) => acc + Number(t.actual_cost || 0), 0);

    res.json({
      room,
      summary: {
        total_tickets: tickets.length,
        open_tickets: tickets.filter((t) => ['PENDIENTE', 'EN_PROCESO'].includes(t.status)).length,
        preventive_count: tickets.filter((t) => t.issue_type === 'PREVENTIVO').length,
        corrective_count: tickets.filter((t) => t.issue_type === 'CORRECTIVO').length,
        total_maintenance_cost: Math.round(totalMaintenanceCost * 100) / 100
      },
      tickets,
      events: historyEvents
    });
  } catch (error) {
    console.error('Error al consultar historial técnico:', error);
    res.status(500).json({ error: 'Error al consultar el historial técnico de la habitación.' });
  }
};

