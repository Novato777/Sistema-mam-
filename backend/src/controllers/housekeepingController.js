const db = require('../config/db');
const { getTodayString } = require('../utils/date');

const VALID_TASK_TYPES = [
  'ASEO_SALIDA',
  'ASEO_DIARIO',
  'ASEO_PROFUNDO',
  'RETOQUE_TURNDOWN',
  'INSPECCION_RUTINA'
];

const VALID_PRIORITIES = ['URGENTE', 'ALTA', 'NORMAL', 'BAJA'];

const DEFAULT_CHECKLIST = {
  camas_tendidas: false,
  bano_desinfectado: false,
  toallas_repuestas: false,
  amenidades_repuestas: false,
  pisos_limpios: false,
  minibar_revisado: false,
  papelera_vaciada: false,
  ventilacion_olores: false
};

const safeJsonParse = (str, fallback) => {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch (_) {
    return fallback;
  }
};

// 1. Panel General de Limpieza y Housekeeping (Overview + KPIs + Habitaciones + Tareas + Personal + Novedades)
exports.getHousekeepingOverview = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const today = getTodayString();
    const { status, assigned_to, room_id, task_type } = req.query;

    // 1. Obtener todas las habitaciones activas del hotel con su tipo y si tienen estancia activa
    const rooms = await db.query(
      `SELECT r.*,
              rt.name as room_type_name,
              rt.code as room_type_code,
              rt.bed_config as default_bed_config,
              s.id as active_stay_id,
              s.check_in_time as stay_check_in,
              s.expected_check_out as stay_expected_check_out,
              g.first_name as guest_first_name,
              g.last_name as guest_last_name
       FROM rooms r
       LEFT JOIN room_types rt ON r.room_type_id = rt.id
       LEFT JOIN stays s ON s.room_id = r.id AND s.hotel_id = r.hotel_id AND s.status = 'ACTIVA'
       LEFT JOIN guests g ON s.guest_id = g.id
       WHERE r.hotel_id = ? AND COALESCE(r.active, 1) = 1
       ORDER BY CAST(r.floor AS INTEGER) ASC, r.number ASC`,
      [hotelId]
    );

    // 2. Próximas llegadas previstas hoy para priorizar habitaciones urgentes
    const arrivalsToday = await db.query(
      `SELECT rr.room_id, rv.id as reservation_id, rv.code as reservation_code,
              rv.check_in_expected, rv.check_in_time,
              g.first_name, g.last_name
       FROM reservation_rooms rr
       JOIN reservations rv ON rr.reservation_id = rv.id
       LEFT JOIN guests g ON rv.guest_id = g.id
       WHERE rv.hotel_id = ?
         AND rv.status IN ('PENDIENTE', 'CONFIRMADA')
         AND rv.check_in_expected = ?`,
      [hotelId, today]
    );
    const arrivalByRoomMap = {};
    for (const arr of arrivalsToday) {
      arrivalByRoomMap[arr.room_id] = arr;
    }

    // 3. Consultar tareas de limpieza del hotel
    let taskSql = `
      SELECT ht.*,
             r.number as room_number,
             r.floor as room_floor,
             r.status as room_status,
             rt.name as room_type_name,
             u_ass.full_name as assigned_to_name,
             u_ass.username as assigned_to_username,
             u_ass.role as assigned_to_role,
             u_cre.full_name as created_by_name,
             u_ins.full_name as inspected_by_name
      FROM housekeeping_tasks ht
      JOIN rooms r ON ht.room_id = r.id
      LEFT JOIN room_types rt ON r.room_type_id = rt.id
      LEFT JOIN users u_ass ON ht.assigned_to = u_ass.id
      LEFT JOIN users u_cre ON ht.created_by = u_cre.id
      LEFT JOIN users u_ins ON ht.inspected_by = u_ins.id
      WHERE ht.hotel_id = ?
    `;
    const taskParams = [hotelId];

    if (status && status !== 'TODOS') {
      taskSql += ' AND ht.status = ?';
      taskParams.push(status);
    }
    if (assigned_to && assigned_to !== 'TODOS') {
      if (assigned_to === 'SIN_ASIGNAR') {
        taskSql += ' AND ht.assigned_to IS NULL';
      } else {
        taskSql += ' AND ht.assigned_to = ?';
        taskParams.push(Number(assigned_to));
      }
    }
    if (room_id) {
      taskSql += ' AND ht.room_id = ?';
      taskParams.push(Number(room_id));
    }
    if (task_type && task_type !== 'TODOS') {
      taskSql += ' AND ht.task_type = ?';
      taskParams.push(task_type);
    }

    taskSql += `
      ORDER BY
        CASE ht.status
          WHEN 'EN_PROCESO' THEN 1
          WHEN 'PENDIENTE' THEN 2
          WHEN 'INSPECCION_PENDIENTE' THEN 3
          WHEN 'COMPLETADA' THEN 4
          WHEN 'APROBADA' THEN 5
          ELSE 6
        END ASC,
        CASE ht.priority
          WHEN 'URGENTE' THEN 1
          WHEN 'ALTA' THEN 2
          WHEN 'NORMAL' THEN 3
          ELSE 4
        END ASC,
        ht.id DESC
      LIMIT 250
    `;

    const rawTasks = await db.query(taskSql, taskParams);
    const tasks = rawTasks.map((t) => ({
      ...t,
      duration_minutes: Number(t.duration_minutes || 0),
      checklist: {
        ...DEFAULT_CHECKLIST,
        ...safeJsonParse(t.checklist_json, {})
      },
      evidence: safeJsonParse(t.evidence_json, []),
      urgent_arrival: arrivalByRoomMap[t.room_id] || null
    }));

    // Mapear la tarea activa de cada habitación
    const activeTaskByRoom = {};
    for (const t of tasks) {
      if (
        ['PENDIENTE', 'EN_PROCESO', 'INSPECCION_PENDIENTE'].includes(t.status) &&
        !activeTaskByRoom[t.room_id]
      ) {
        activeTaskByRoom[t.room_id] = t;
      }
    }

    const enrichedRooms = rooms.map((r) => ({
      ...r,
      guest_full_name: r.guest_first_name
        ? `${r.guest_first_name} ${r.guest_last_name || ''}`.trim()
        : null,
      urgent_arrival: arrivalByRoomMap[r.id] || null,
      active_task: activeTaskByRoom[r.id] || null
    }));

    // 4. Personal operativo del hotel para asignación de tareas y balance de carga
    const staffRows = await db.query(
      `SELECT DISTINCT u.id, u.username, u.full_name,
              COALESCE(uh.role, u.role) as effective_role
       FROM users u
       LEFT JOIN user_hotels uh ON uh.user_id = u.id AND uh.hotel_id = ?
       WHERE COALESCE(u.active, 1) = 1
         AND (uh.hotel_id = ? OR u.role IN ('PROPIETARIO', 'ADMIN', 'ADMINISTRADOR', 'LIMPIEZA'))
       ORDER BY
         CASE COALESCE(uh.role, u.role)
           WHEN 'LIMPIEZA' THEN 1
           WHEN 'MANTENIMIENTO' THEN 2
           WHEN 'RECEPCIONISTA' THEN 3
           ELSE 4
         END ASC,
         u.full_name ASC`,
      [hotelId, hotelId]
    );

    const allHotelTasksToday = await db.query(
      `SELECT id, status, assigned_to, duration_minutes, completed_at, inspected_at, created_at
       FROM housekeeping_tasks
       WHERE hotel_id = ?`,
      [hotelId]
    );

    const staff = staffRows.map((member) => {
      const activeAssigned = allHotelTasksToday.filter(
        (t) =>
          Number(t.assigned_to) === Number(member.id) &&
          ['PENDIENTE', 'EN_PROCESO', 'INSPECCION_PENDIENTE'].includes(t.status)
      ).length;

      const completedToday = allHotelTasksToday.filter(
        (t) =>
          Number(t.assigned_to) === Number(member.id) &&
          ['COMPLETADA', 'APROBADA'].includes(t.status) &&
          (String(t.completed_at || '').startsWith(today) ||
            String(t.created_at || '').startsWith(today))
      );

      const totalMinutes = completedToday.reduce(
        (acc, item) => acc + Number(item.duration_minutes || 0),
        0
      );

      return {
        ...member,
        full_name: member.full_name || member.username,
        active_tasks_count: activeAssigned,
        completed_today_count: completedToday.length,
        avg_minutes:
          completedToday.length > 0 ? Math.round(totalMinutes / completedToday.length) : 0
      };
    });

    // 5. Reportes de daños y faltantes registrados hacia Mantenimiento
    const damageReports = await db.query(
      `SELECT mt.*,
              r.number as room_number,
              r.floor as room_floor,
              r.status as room_status,
              u_rep.full_name as reported_by_name,
              u_ass.full_name as assigned_to_name
       FROM maintenance_tickets mt
       JOIN rooms r ON mt.room_id = r.id
       LEFT JOIN users u_rep ON mt.reported_by = u_rep.id
       LEFT JOIN users u_ass ON mt.assigned_to = u_ass.id
       WHERE mt.hotel_id = ?
       ORDER BY
         CASE mt.status
           WHEN 'PENDIENTE' THEN 1
           WHEN 'EN_PROCESO' THEN 2
           ELSE 3
         END ASC,
         mt.id DESC
       LIMIT 60`,
      [hotelId]
    );

    // 6. Calcular KPIs en tiempo real
    const completedWithDuration = allHotelTasksToday.filter(
      (t) => ['COMPLETADA', 'APROBADA'].includes(t.status) && Number(t.duration_minutes || 0) > 0
    );
    const avgCleaningMinutes =
      completedWithDuration.length > 0
        ? Math.round(
            completedWithDuration.reduce((sum, t) => sum + Number(t.duration_minutes || 0), 0) /
              completedWithDuration.length
          )
        : 0;

    const kpis = {
      rooms_pending_cleaning: enrichedRooms.filter((r) => r.status === 'PENDIENTE_LIMPIEZA').length,
      rooms_in_cleaning: enrichedRooms.filter((r) => r.status === 'EN_LIMPIEZA').length,
      rooms_pending_inspection: enrichedRooms.filter((r) => r.status === 'INSPECCION_PENDIENTE')
        .length,
      rooms_clean_ready: enrichedRooms.filter((r) =>
        ['LIMPIA', 'DISPONIBLE'].includes(r.status)
      ).length,
      rooms_occupied: enrichedRooms.filter((r) => r.status === 'OCUPADA').length,
      rooms_blocked_maintenance: enrichedRooms.filter((r) =>
        ['MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(r.status)
      ).length,
      tasks_pending: allHotelTasksToday.filter((t) => t.status === 'PENDIENTE').length,
      tasks_in_progress: allHotelTasksToday.filter((t) => t.status === 'EN_PROCESO').length,
      tasks_pending_inspection: allHotelTasksToday.filter(
        (t) => t.status === 'INSPECCION_PENDIENTE'
      ).length,
      tasks_completed_today: allHotelTasksToday.filter(
        (t) =>
          ['COMPLETADA', 'APROBADA'].includes(t.status) &&
          (String(t.completed_at || '').startsWith(today) ||
            String(t.inspected_at || '').startsWith(today) ||
            String(t.created_at || '').startsWith(today))
      ).length,
      avg_cleaning_minutes: avgCleaningMinutes,
      open_damage_reports: damageReports.filter((d) =>
        ['PENDIENTE', 'EN_PROCESO'].includes(d.status)
      ).length
    };

    res.json({
      kpis,
      rooms: enrichedRooms,
      tasks,
      staff,
      damage_reports: damageReports.map((d) => ({
        ...d,
        estimated_cost: Number(d.estimated_cost || 0),
        actual_cost: Number(d.actual_cost || 0),
        evidence: safeJsonParse(d.evidence_json, [])
      }))
    });
  } catch (error) {
    console.error('Error al obtener resumen de limpieza y housekeeping:', error);
    res.status(500).json({ error: 'Error interno al consultar el módulo de limpieza.' });
  }
};

// 2. Crear nueva Tarea de Limpieza manual o programada
exports.createHousekeepingTask = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      room_id,
      stay_id,
      task_type = 'ASEO_SALIDA',
      priority = 'ALTA',
      assigned_to,
      notes,
      scheduled_date,
      mark_room_pending = true
    } = req.body || {};

    if (!room_id) {
      return res.status(400).json({ error: 'Debe seleccionar una habitación para la tarea.' });
    }

    const room = await db.get(
      'SELECT * FROM rooms WHERE id = ? AND hotel_id = ? AND COALESCE(active, 1) = 1',
      [Number(room_id), hotelId]
    );
    if (!room) {
      return res.status(404).json({ error: 'Habitación no encontrada en este hotel.' });
    }

    const normalizedType = VALID_TASK_TYPES.includes(String(task_type).toUpperCase())
      ? String(task_type).toUpperCase()
      : 'ASEO_SALIDA';
    const normalizedPriority = VALID_PRIORITIES.includes(String(priority).toUpperCase())
      ? String(priority).toUpperCase()
      : 'ALTA';

    const today = getTodayString();
    const nowIso = new Date().toISOString();

    const createdTask = await db.withTransaction(async (tx) => {
      const ins = await tx.run(
        `INSERT INTO housekeeping_tasks (
          hotel_id, room_id, stay_id, task_type, priority, status,
          assigned_to, created_by, checklist_json, evidence_json,
          scheduled_date, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?, '[]', ?, ?, ?)`,
        [
          hotelId,
          room.id,
          stay_id ? Number(stay_id) : null,
          normalizedType,
          normalizedPriority,
          assigned_to ? Number(assigned_to) : null,
          req.user?.id || 1,
          JSON.stringify(DEFAULT_CHECKLIST),
          scheduled_date || today,
          notes ? String(notes).trim() : '',
          nowIso
        ]
      );

      // Si la habitación no está ocupada ni fuera de servicio y se solicita marcarla pendiente de limpieza
      if (
        mark_room_pending &&
        room.status !== 'OCUPADA' &&
        !['PENDIENTE_LIMPIEZA', 'EN_LIMPIEZA', 'MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(
          room.status
        )
      ) {
        await tx.run('UPDATE rooms SET status = ? WHERE id = ? AND hotel_id = ?', [
          'PENDIENTE_LIMPIEZA',
          room.id,
          hotelId
        ]);
        await tx.run(
          `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
           VALUES (?, ?, 'CLEANING', ?, 'PENDIENTE_LIMPIEZA', ?, 0, ?, ?)`,
          [
            hotelId,
            room.id,
            room.status,
            `Tarea de limpieza creada (${normalizedType} - Prioridad ${normalizedPriority})`,
            req.user?.id || 1,
            nowIso
          ]
        );
      } else {
        await tx.run(
          `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
           VALUES (?, ?, 'CLEANING', ?, ?, ?, 0, ?, ?)`,
          [
            hotelId,
            room.id,
            room.status,
            room.status,
            `Programación de limpieza (${normalizedType}) — ${notes || 'Sin observaciones'}`,
            req.user?.id || 1,
            nowIso
          ]
        );
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'CREAR_TAREA_LIMPIEZA', 'LIMPIEZA', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          ins.id,
          `Tarea ${normalizedType} (${normalizedPriority}) creada para Habitación ${room.number}`,
          today
        ]
      );

      return tx.get('SELECT * FROM housekeeping_tasks WHERE id = ?', [ins.id]);
    });

    res.status(201).json({
      message: `Tarea de limpieza registrada para la habitación ${room.number}.`,
      task: createdTask
    });
  } catch (error) {
    console.error('Error al crear tarea de limpieza:', error);
    res.status(500).json({ error: 'Error interno al crear la tarea de limpieza.' });
  }
};

// 3. Generación Automática del Plan Diario de Limpieza (Habitaciones Ocupadas y Pendientes de Aseo)
exports.generateDailyCleaningTasks = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { auto_assign = true } = req.body || {};
    const today = getTodayString();
    const nowIso = new Date().toISOString();

    const rooms = await db.query(
      `SELECT r.*, s.id as active_stay_id
       FROM rooms r
       LEFT JOIN stays s ON s.room_id = r.id AND s.hotel_id = r.hotel_id AND s.status = 'ACTIVA'
       WHERE r.hotel_id = ? AND COALESCE(r.active, 1) = 1
         AND r.status IN ('PENDIENTE_LIMPIEZA', 'OCUPADA')
       ORDER BY CAST(r.floor AS INTEGER) ASC, r.number ASC`,
      [hotelId]
    );

    const activeTasks = await db.query(
      `SELECT room_id, status, scheduled_date, created_at
       FROM housekeeping_tasks
       WHERE hotel_id = ?
         AND (status IN ('PENDIENTE', 'EN_PROCESO', 'INSPECCION_PENDIENTE')
              OR scheduled_date = ?
              OR created_at LIKE ?)`,
      [hotelId, today, `${today}%`]
    );
    const roomsWithTask = new Set(activeTasks.map((t) => Number(t.room_id)));

    const cleaningStaff = await db.query(
      `SELECT DISTINCT u.id
       FROM users u
       LEFT JOIN user_hotels uh ON uh.user_id = u.id AND uh.hotel_id = ?
       WHERE COALESCE(u.active, 1) = 1
         AND COALESCE(uh.role, u.role) = 'LIMPIEZA'
       ORDER BY u.id ASC`,
      [hotelId]
    );

    const generated = [];
    let staffIdx = 0;

    await db.withTransaction(async (tx) => {
      for (const room of rooms) {
        if (roomsWithTask.has(Number(room.id))) continue;

        const isCheckoutCleaning = room.status === 'PENDIENTE_LIMPIEZA';
        const taskType = isCheckoutCleaning ? 'ASEO_SALIDA' : 'ASEO_DIARIO';
        const priority = isCheckoutCleaning ? 'ALTA' : 'NORMAL';
        const assignedUserId =
          auto_assign && cleaningStaff.length > 0
            ? cleaningStaff[staffIdx % cleaningStaff.length].id
            : null;
        if (assignedUserId) staffIdx++;

        const ins = await tx.run(
          `INSERT INTO housekeeping_tasks (
            hotel_id, room_id, stay_id, task_type, priority, status,
            assigned_to, created_by, checklist_json, evidence_json,
            scheduled_date, notes, created_at
          ) VALUES (?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?, '[]', ?, ?, ?)`,
          [
            hotelId,
            room.id,
            room.active_stay_id || null,
            taskType,
            priority,
            assignedUserId,
            req.user?.id || 1,
            JSON.stringify(DEFAULT_CHECKLIST),
            today,
            isCheckoutCleaning
              ? `Aseo de salida pendiente — Habitación ${room.number}`
              : `Aseo diario de estancia activa — Habitación ${room.number}`,
            nowIso
          ]
        );

        generated.push({
          id: ins.id,
          room_id: room.id,
          room_number: room.number,
          task_type: taskType,
          assigned_to: assignedUserId
        });
      }

      if (generated.length > 0) {
        await tx.run(
          `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
           VALUES (?, ?, 'GENERAR_PLAN_LIMPIEZA', 'LIMPIEZA', 0, ?, ?)`,
          [
            hotelId,
            req.user?.id || 1,
            `Generadas automáticamente ${generated.length} tareas de aseo para el día ${today}`,
            today
          ]
        );
      }
    });

    res.status(201).json({
      message:
        generated.length > 0
          ? `Se generaron ${generated.length} tareas de limpieza automáticamente.`
          : 'Todas las habitaciones ocupadas o pendientes ya cuentan con tarea de limpieza hoy.',
      generated_count: generated.length,
      tasks: generated
    });
  } catch (error) {
    console.error('Error al generar plan diario de limpieza:', error);
    res.status(500).json({ error: 'Error interno al generar el plan diario de limpieza.' });
  }
};

// 4. Asignar / Reasignar Personal y Prioridad a una Tarea
exports.assignHousekeepingTask = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const taskId = Number(req.params.taskId || req.params.id);
    const { assigned_to, priority, notes, task_type } = req.body || {};

    const task = await db.get(
      `SELECT ht.*, r.number as room_number
       FROM housekeeping_tasks ht
       JOIN rooms r ON ht.room_id = r.id
       WHERE ht.id = ? AND ht.hotel_id = ?`,
      [taskId, hotelId]
    );
    if (!task) {
      return res.status(404).json({ error: 'Tarea de limpieza no encontrada.' });
    }

    const nextAssigned =
      assigned_to === null || assigned_to === ''
        ? null
        : assigned_to !== undefined
        ? Number(assigned_to)
        : task.assigned_to;
    const nextPriority =
      priority && VALID_PRIORITIES.includes(String(priority).toUpperCase())
        ? String(priority).toUpperCase()
        : task.priority;
    const nextType =
      task_type && VALID_TASK_TYPES.includes(String(task_type).toUpperCase())
        ? String(task_type).toUpperCase()
        : task.task_type;
    const nextNotes = notes !== undefined ? String(notes).trim() : task.notes;

    const today = getTodayString();

    await db.withTransaction(async (tx) => {
      await tx.run(
        `UPDATE housekeeping_tasks
         SET assigned_to = ?, priority = ?, task_type = ?, notes = ?
         WHERE id = ? AND hotel_id = ?`,
        [nextAssigned, nextPriority, nextType, nextNotes, taskId, hotelId]
      );

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'ASIGNAR_LIMPIEZA', 'LIMPIEZA', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          taskId,
          `Habitación ${task.room_number}: Asignada a usuario ID ${
            nextAssigned || 'Sin asignar'
          } (Prioridad ${nextPriority})`,
          today
        ]
      );
    });

    const updated = await db.get('SELECT * FROM housekeeping_tasks WHERE id = ?', [taskId]);
    res.json({
      message: `Asignación actualizada para la habitación ${task.room_number}.`,
      task: updated
    });
  } catch (error) {
    console.error('Error al asignar tarea de limpieza:', error);
    res.status(500).json({ error: 'Error interno al asignar la tarea de limpieza.' });
  }
};

// 5. Iniciar Limpieza (Registra hora exacta de inicio y pasa la habitación a EN_LIMPIEZA)
exports.startHousekeepingTask = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const taskId = Number(req.params.taskId || req.params.id);

    const task = await db.get(
      `SELECT ht.*, r.number as room_number, r.status as room_status
       FROM housekeeping_tasks ht
       JOIN rooms r ON ht.room_id = r.id
       WHERE ht.id = ? AND ht.hotel_id = ?`,
      [taskId, hotelId]
    );
    if (!task) {
      return res.status(404).json({ error: 'Tarea de limpieza no encontrada.' });
    }
    if (['COMPLETADA', 'APROBADA'].includes(task.status)) {
      return res.status(400).json({ error: 'Esta tarea de limpieza ya fue finalizada.' });
    }

    const nowIso = new Date().toISOString();
    const today = getTodayString();
    const assignedUser = task.assigned_to || req.user?.id || 1;

    await db.withTransaction(async (tx) => {
      await tx.run(
        `UPDATE housekeeping_tasks
         SET status = 'EN_PROCESO',
             started_at = COALESCE(started_at, ?),
             assigned_to = ?
         WHERE id = ? AND hotel_id = ?`,
        [nowIso, assignedUser, taskId, hotelId]
      );

      if (task.room_status !== 'OCUPADA') {
        await tx.run('UPDATE rooms SET status = ? WHERE id = ? AND hotel_id = ?', [
          'EN_LIMPIEZA',
          task.room_id,
          hotelId
        ]);
        await tx.run(
          `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
           VALUES (?, ?, 'CLEANING', ?, 'EN_LIMPIEZA', ?, 0, ?, ?)`,
          [
            hotelId,
            task.room_id,
            task.room_status,
            `Inicio de limpieza (${task.task_type}) — Tarea #${task.id}`,
            req.user?.id || 1,
            nowIso
          ]
        );
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'INICIAR_LIMPIEZA', 'LIMPIEZA', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          taskId,
          `Inicio de limpieza en Habitación ${task.room_number} (${task.task_type})`,
          today
        ]
      );
    });

    const updated = await db.get('SELECT * FROM housekeeping_tasks WHERE id = ?', [taskId]);
    res.json({
      message: `Limpieza iniciada en la habitación ${task.room_number}.`,
      task: updated
    });
  } catch (error) {
    console.error('Error al iniciar tarea de limpieza:', error);
    res.status(500).json({ error: 'Error interno al iniciar la limpieza.' });
  }
};

// 6. Finalizar Limpieza (Registra hora fin, duración, checklist, evidencias, objetos olvidados y pasa a INSPECCION_PENDIENTE)
exports.completeHousekeepingTask = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const taskId = Number(req.params.taskId || req.params.id);
    const {
      checklist,
      evidence,
      notes,
      issues_reported,
      lost_and_found,
      require_inspection = true
    } = req.body || {};

    const task = await db.get(
      `SELECT ht.*, r.number as room_number, r.status as room_status
       FROM housekeeping_tasks ht
       JOIN rooms r ON ht.room_id = r.id
       WHERE ht.id = ? AND ht.hotel_id = ?`,
      [taskId, hotelId]
    );
    if (!task) {
      return res.status(404).json({ error: 'Tarea de limpieza no encontrada.' });
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const today = getTodayString();

    const startTime = task.started_at ? new Date(task.started_at) : now;
    const elapsedMs = Math.max(0, now.getTime() - startTime.getTime());
    const durationMinutes = Math.max(1, Math.round(elapsedMs / 60000));

    const mergedChecklist = {
      ...DEFAULT_CHECKLIST,
      ...safeJsonParse(task.checklist_json, {}),
      ...(checklist && typeof checklist === 'object' ? checklist : {})
    };
    const evidenceArr = Array.isArray(evidence)
      ? evidence
      : safeJsonParse(task.evidence_json, []);

    // Verificar si la habitación tiene estancia activa (huésped alojado)
    const activeStay = await db.get(
      "SELECT id FROM stays WHERE room_id = ? AND hotel_id = ? AND status = 'ACTIVA'",
      [task.room_id, hotelId]
    );

    const nextTaskStatus = require_inspection ? 'INSPECCION_PENDIENTE' : 'APROBADA';
    let nextRoomStatus = task.room_status;
    if (activeStay) {
      nextRoomStatus = 'OCUPADA';
    } else if (!['MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(task.room_status)) {
      nextRoomStatus = require_inspection ? 'INSPECCION_PENDIENTE' : 'DISPONIBLE';
    }

    await db.withTransaction(async (tx) => {
      await tx.run(
        `UPDATE housekeeping_tasks
         SET status = ?,
             started_at = COALESCE(started_at, ?),
             completed_at = ?,
             duration_minutes = ?,
             checklist_json = ?,
             evidence_json = ?,
             notes = ?,
             issues_reported = COALESCE(?, issues_reported),
             lost_and_found = COALESCE(?, lost_and_found),
             inspected_by = CASE WHEN ? = 'APROBADA' THEN ? ELSE inspected_by END,
             inspected_at = CASE WHEN ? = 'APROBADA' THEN ? ELSE inspected_at END
         WHERE id = ? AND hotel_id = ?`,
        [
          nextTaskStatus,
          nowIso,
          nowIso,
          durationMinutes,
          JSON.stringify(mergedChecklist),
          JSON.stringify(evidenceArr),
          notes !== undefined ? String(notes).trim() : task.notes,
          issues_reported !== undefined ? String(issues_reported).trim() : null,
          lost_and_found !== undefined ? String(lost_and_found).trim() : null,
          nextTaskStatus,
          req.user?.id || 1,
          nextTaskStatus,
          nowIso,
          taskId,
          hotelId
        ]
      );

      if (nextRoomStatus !== task.room_status) {
        await tx.run('UPDATE rooms SET status = ? WHERE id = ? AND hotel_id = ?', [
          nextRoomStatus,
          task.room_id,
          hotelId
        ]);
      }

      await tx.run(
        `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
         VALUES (?, ?, 'CLEANING', ?, ?, ?, 0, ?, ?)`,
        [
          hotelId,
          task.room_id,
          task.room_status,
          nextRoomStatus,
          `Limpieza finalizada (${durationMinutes} min)${
            lost_and_found ? ' | Objeto olvidado: ' + lost_and_found : ''
          }${notes ? ' | Obs: ' + notes : ''}`,
          req.user?.id || 1,
          nowIso
        ]
      );

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'FINALIZAR_LIMPIEZA', 'LIMPIEZA', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          taskId,
          `Habitación ${task.room_number}: Limpieza terminada en ${durationMinutes} min -> Estado ${nextRoomStatus}`,
          today
        ]
      );
    });

    const updated = await db.get('SELECT * FROM housekeeping_tasks WHERE id = ?', [taskId]);
    res.json({
      message: require_inspection
        ? `Limpieza finalizada en habitación ${task.room_number}. Pasa a Inspección Pendiente.`
        : `Limpieza finalizada y aprobada en habitación ${task.room_number}.`,
      task: {
        ...updated,
        checklist: safeJsonParse(updated.checklist_json, DEFAULT_CHECKLIST),
        evidence: safeJsonParse(updated.evidence_json, [])
      },
      room_status: nextRoomStatus
    });
  } catch (error) {
    console.error('Error al finalizar tarea de limpieza:', error);
    res.status(500).json({ error: 'Error interno al finalizar la tarea de limpieza.' });
  }
};

// 7. Inspección y Aprobación / Rechazo de Habitación Limpia para habilitar a DISPONIBLE
exports.inspectHousekeepingTask = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const taskId = Number(req.params.taskId || req.params.id);
    const {
      approved = true,
      inspection_notes = '',
      target_room_status = 'DISPONIBLE'
    } = req.body || {};

    const task = await db.get(
      `SELECT ht.*, r.number as room_number, r.status as room_status
       FROM housekeeping_tasks ht
       JOIN rooms r ON ht.room_id = r.id
       WHERE ht.id = ? AND ht.hotel_id = ?`,
      [taskId, hotelId]
    );
    if (!task) {
      return res.status(404).json({ error: 'Tarea de limpieza no encontrada.' });
    }

    if (!approved && !String(inspection_notes || '').trim()) {
      return res.status(400).json({
        error: 'Al rechazar una inspección debe indicar el motivo o corrección requerida.'
      });
    }

    const nowIso = new Date().toISOString();
    const today = getTodayString();

    const activeStay = await db.get(
      "SELECT id FROM stays WHERE room_id = ? AND hotel_id = ? AND status = 'ACTIVA'",
      [task.room_id, hotelId]
    );

    const nextTaskStatus = approved ? 'APROBADA' : 'PENDIENTE';
    let nextRoomStatus = task.room_status;

    if (activeStay) {
      nextRoomStatus = 'OCUPADA';
    } else if (!['MANTENIMIENTO', 'FUERA_DE_SERVICIO'].includes(task.room_status)) {
      if (approved) {
        nextRoomStatus = target_room_status === 'LIMPIA' ? 'LIMPIA' : 'DISPONIBLE';
      } else {
        nextRoomStatus = 'PENDIENTE_LIMPIEZA';
      }
    }

    await db.withTransaction(async (tx) => {
      await tx.run(
        `UPDATE housekeeping_tasks
         SET status = ?,
             inspected_by = ?,
             inspected_at = ?,
             inspection_notes = ?,
             completed_at = COALESCE(completed_at, ?)
         WHERE id = ? AND hotel_id = ?`,
        [
          nextTaskStatus,
          req.user?.id || 1,
          nowIso,
          String(inspection_notes || '').trim(),
          nowIso,
          taskId,
          hotelId
        ]
      );

      if (nextRoomStatus !== task.room_status) {
        await tx.run('UPDATE rooms SET status = ? WHERE id = ? AND hotel_id = ?', [
          nextRoomStatus,
          task.room_id,
          hotelId
        ]);
      }

      await tx.run(
        `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
         VALUES (?, ?, 'CLEANING', ?, ?, ?, 0, ?, ?)`,
        [
          hotelId,
          task.room_id,
          task.room_status,
          nextRoomStatus,
          approved
            ? `Inspección de limpieza APROBADA -> Habitación habilitada (${nextRoomStatus})${
                inspection_notes ? ' — ' + inspection_notes : ''
              }`
            : `Inspección de limpieza RECHAZADA (Requiere repaso): ${inspection_notes}`,
          req.user?.id || 1,
          nowIso
        ]
      );

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, ?, 'LIMPIEZA', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          approved ? 'APROBAR_INSPECCION_LIMPIEZA' : 'RECHAZAR_INSPECCION_LIMPIEZA',
          taskId,
          `Habitación ${task.room_number}: Inspección ${
            approved ? 'APROBADA' : 'RECHAZADA'
          } -> Estado habitación: ${nextRoomStatus}`,
          today
        ]
      );
    });

    const updated = await db.get('SELECT * FROM housekeeping_tasks WHERE id = ?', [taskId]);
    res.json({
      message: approved
        ? `Habitación ${task.room_number} inspeccionada y habilitada como ${nextRoomStatus}.`
        : `Inspección rechazada. La habitación ${task.room_number} volvió a estado PENDIENTE_LIMPIEZA.`,
      task: updated,
      room_status: nextRoomStatus
    });
  } catch (error) {
    console.error('Error al inspeccionar limpieza:', error);
    res.status(500).json({ error: 'Error interno al procesar la inspección de limpieza.' });
  }
};

// 8. Reportar Daño, Desperfecto o Faltante desde Limpieza hacia Mantenimiento
exports.reportDamageFromHousekeeping = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      room_id,
      housekeeping_task_id,
      category = 'Equipamiento / Mobiliario',
      priority = 'ALTA',
      title,
      description,
      block_room = false,
      block_status = 'MANTENIMIENTO',
      estimated_cost = 0,
      evidence = []
    } = req.body || {};

    if (!room_id || !String(title || '').trim()) {
      return res.status(400).json({
        error: 'Debe seleccionar la habitación e indicar el título del daño o faltante detectado.'
      });
    }

    const room = await db.get(
      'SELECT * FROM rooms WHERE id = ? AND hotel_id = ? AND COALESCE(active, 1) = 1',
      [Number(room_id), hotelId]
    );
    if (!room) {
      return res.status(404).json({ error: 'Habitación no encontrada en este establecimiento.' });
    }

    const nowIso = new Date().toISOString();
    const today = getTodayString();
    const shouldBlock = Boolean(block_room) && room.status !== 'OCUPADA';
    const targetBlockStatus =
      block_status === 'FUERA_DE_SERVICIO' ? 'FUERA_DE_SERVICIO' : 'MANTENIMIENTO';

    const createdTicket = await db.withTransaction(async (tx) => {
      const ins = await tx.run(
        `INSERT INTO maintenance_tickets (
          hotel_id, room_id, housekeeping_task_id, reported_by,
          issue_type, category, priority, title, description,
          status, block_room, room_blocked_status, estimated_cost,
          evidence_json, created_at
        ) VALUES (?, ?, ?, ?, 'CORRECTIVO', ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?, ?, ?)`,
        [
          hotelId,
          room.id,
          housekeeping_task_id ? Number(housekeeping_task_id) : null,
          req.user?.id || 1,
          String(category).trim(),
          VALID_PRIORITIES.includes(String(priority).toUpperCase())
            ? String(priority).toUpperCase()
            : 'ALTA',
          String(title).trim(),
          description ? String(description).trim() : '',
          shouldBlock ? 1 : 0,
          shouldBlock ? targetBlockStatus : null,
          Number(estimated_cost || 0),
          JSON.stringify(Array.isArray(evidence) ? evidence : []),
          nowIso
        ]
      );

      if (housekeeping_task_id) {
        const hkTask = await tx.get(
          'SELECT id, issues_reported FROM housekeeping_tasks WHERE id = ? AND hotel_id = ?',
          [Number(housekeeping_task_id), hotelId]
        );
        if (hkTask) {
          const updatedIssues = [hkTask.issues_reported, `[Ticket #${ins.id}] ${title}`]
            .filter(Boolean)
            .join(' | ');
          await tx.run('UPDATE housekeeping_tasks SET issues_reported = ? WHERE id = ?', [
            updatedIssues,
            hkTask.id
          ]);
        }
      }

      const nextRoomStatus = shouldBlock ? targetBlockStatus : room.status;
      if (shouldBlock && nextRoomStatus !== room.status) {
        await tx.run('UPDATE rooms SET status = ? WHERE id = ? AND hotel_id = ?', [
          nextRoomStatus,
          room.id,
          hotelId
        ]);
      }

      await tx.run(
        `INSERT INTO room_history (hotel_id, room_id, category, previous_status, new_status, notes, cost, user_id, created_at)
         VALUES (?, ?, 'MAINTENANCE', ?, ?, ?, ?, ?, ?)`,
        [
          hotelId,
          room.id,
          room.status,
          nextRoomStatus,
          `[Reporte desde Housekeeping #${ins.id}] ${title}: ${description || 'Sin detalle'}`,
          Number(estimated_cost || 0),
          req.user?.id || 1,
          nowIso
        ]
      );

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
         VALUES (?, ?, 'REPORTE_DANO_LIMPIEZA', 'LIMPIEZA', ?, ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          ins.id,
          `Habitación ${room.number}: Reporte de daño/faltante "${title}"${
            shouldBlock ? ' (Habitación bloqueada a ' + targetBlockStatus + ')' : ''
          }`,
          today
        ]
      );

      return tx.get('SELECT * FROM maintenance_tickets WHERE id = ?', [ins.id]);
    });

    res.status(201).json({
      message: shouldBlock
        ? `Daño reportado a Mantenimiento y habitación ${room.number} pasada a ${targetBlockStatus}.`
        : `Daño o faltante reportado exitosamente a Mantenimiento para la habitación ${room.number}.`,
      ticket: createdTicket
    });
  } catch (error) {
    console.error('Error al reportar daño desde limpieza:', error);
    res.status(500).json({ error: 'Error interno al reportar daño o faltante.' });
  }
};

