const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { getTodayString } = require('../utils/date');
const {
  PERMISSIONS_CATALOG,
  ROLES_DEFINITION,
  resolveEffectivePermissions
} = require('../config/permissions');

exports.getRolesAndPermissions = async (req, res) => {
  res.json({
    roles: ROLES_DEFINITION,
    permissions: PERMISSIONS_CATALOG
  });
};

exports.listUsers = async (req, res) => {
  try {
    const users = await db.query(
      `SELECT id, username, full_name, document, position, email, phone,
              role, custom_permissions, active, default_hotel_id, last_login_at, created_at
       FROM users
       ORDER BY id ASC`
    );

    const assignments = await db.query(
      `SELECT uh.user_id, uh.hotel_id, uh.role, uh.active, h.name as hotel_name
       FROM user_hotels uh
       JOIN hotels h ON uh.hotel_id = h.id
       WHERE h.active = 1
       ORDER BY uh.hotel_id ASC`
    );

    const enriched = users.map((u) => {
      const userHotels = assignments.filter((a) => a.user_id === u.id);
      let parsedCustom = { grant: [], revoke: [] };
      if (u.custom_permissions) {
        try {
          const parsed = JSON.parse(u.custom_permissions);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            parsedCustom = {
              grant: Array.isArray(parsed.grant) ? parsed.grant : [],
              revoke: Array.isArray(parsed.revoke) ? parsed.revoke : []
            };
          }
        } catch (_) {
          // Ignorar JSON inválido
        }
      }

      return {
        ...u,
        role: u.role === 'ADMIN' ? 'PROPIETARIO' : u.role || 'RECEPCIONISTA',
        custom_permissions_obj: parsedCustom,
        effective_permissions: resolveEffectivePermissions(u.role, u.custom_permissions),
        hotels: userHotels
      };
    });

    res.json(enriched);
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    res.status(500).json({ error: 'Error al obtener la lista de usuarios y empleados.' });
  }
};

exports.createUser = async (req, res) => {
  try {
    const {
      username,
      password,
      full_name,
      document,
      position,
      email,
      phone,
      role,
      default_hotel_id,
      hotel_ids,
      custom_permissions
    } = req.body;

    if (!username || !password || !full_name) {
      return res.status(400).json({
        error: 'Nombre de usuario, contraseña y nombre completo del empleado son obligatorios.'
      });
    }

    const cleanUsername = username.trim().toLowerCase();
    const existing = await db.get('SELECT id FROM users WHERE LOWER(username) = ?', [cleanUsername]);
    if (existing) {
      return res.status(400).json({ error: 'El nombre de usuario ya está registrado.' });
    }

    const validRole = ROLES_DEFINITION[role] ? role : 'RECEPCIONISTA';
    const hashedPassword = await bcrypt.hash(password, 10);
    const today = getTodayString();

    const assignedHotels =
      Array.isArray(hotel_ids) && hotel_ids.length > 0
        ? hotel_ids.map((id) => Number(id))
        : [Number(default_hotel_id || req.hotelId || 1)];

    const primaryHotelId = Number(default_hotel_id) || assignedHotels[0] || 1;
    const customPermsStr = custom_permissions ? JSON.stringify(custom_permissions) : null;

    const createdUserId = await db.withTransaction(async (tx) => {
      const ins = await tx.run(
        `INSERT INTO users (
          username, password, full_name, document, position, email, phone,
          role, custom_permissions, active, default_hotel_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          cleanUsername,
          hashedPassword,
          full_name.trim(),
          document || '',
          position || ROLES_DEFINITION[validRole].name,
          email || '',
          phone || '',
          validRole,
          customPermsStr,
          primaryHotelId,
          today
        ]
      );

      const newUserId = ins.id;

      for (const hId of assignedHotels) {
        await tx.run(
          'INSERT INTO user_hotels (user_id, hotel_id, role, active) VALUES (?, ?, ?, 1)',
          [newUserId, hId, validRole]
        );
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, ip_address, date)
         VALUES (?, ?, 'CREAR_USUARIO', 'USUARIOS', ?, ?, ?, ?)`,
        [
          primaryHotelId,
          req.user.id,
          newUserId,
          `Empleado creado: ${full_name.trim()} (@${cleanUsername}) con rol ${validRole}`,
          req.ip || '127.0.0.1',
          today
        ]
      );

      return newUserId;
    });

    const createdUser = await db.get(
      'SELECT id, username, full_name, document, position, email, phone, role, active, default_hotel_id FROM users WHERE id = ?',
      [createdUserId]
    );

    res.status(201).json({
      message: 'Usuario creado y asignado correctamente.',
      user: createdUser
    });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({ error: 'Error interno al crear el usuario.' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const {
      full_name,
      document,
      position,
      email,
      phone,
      role,
      password,
      default_hotel_id,
      hotel_ids,
      custom_permissions
    } = req.body;

    const existing = await db.get('SELECT * FROM users WHERE id = ?', [targetId]);
    if (!existing) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const validRole = role && ROLES_DEFINITION[role] ? role : existing.role;
    const customPermsStr =
      custom_permissions !== undefined
        ? JSON.stringify(custom_permissions)
        : existing.custom_permissions;

    await db.withTransaction(async (tx) => {
      if (password && password.trim().length > 0) {
        const hashed = await bcrypt.hash(password.trim(), 10);
        await tx.run('UPDATE users SET password = ? WHERE id = ?', [hashed, targetId]);
      }

      await tx.run(
        `UPDATE users SET
          full_name = COALESCE(?, full_name),
          document = COALESCE(?, document),
          position = COALESCE(?, position),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          role = ?,
          custom_permissions = ?,
          default_hotel_id = COALESCE(?, default_hotel_id)
         WHERE id = ?`,
        [
          full_name ? full_name.trim() : null,
          document !== undefined ? document : null,
          position !== undefined ? position : null,
          email !== undefined ? email : null,
          phone !== undefined ? phone : null,
          validRole,
          customPermsStr,
          default_hotel_id ? Number(default_hotel_id) : null,
          targetId
        ]
      );

      if (Array.isArray(hotel_ids) && hotel_ids.length > 0) {
        await tx.run('DELETE FROM user_hotels WHERE user_id = ?', [targetId]);
        for (const hId of hotel_ids) {
          await tx.run(
            'INSERT INTO user_hotels (user_id, hotel_id, role, active) VALUES (?, ?, ?, 1)',
            [targetId, Number(hId), validRole]
          );
        }
      } else {
        await tx.run('UPDATE user_hotels SET role = ? WHERE user_id = ?', [validRole, targetId]);
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, ip_address, date)
         VALUES (?, ?, 'ACTUALIZAR_USUARIO', 'USUARIOS', ?, ?, ?, ?)`,
        [
          default_hotel_id || existing.default_hotel_id || 1,
          req.user.id,
          targetId,
          `Usuario actualizado: @${existing.username} (Rol: ${validRole})`,
          req.ip || '127.0.0.1',
          getTodayString()
        ]
      );
    });

    res.json({ message: 'Usuario y permisos actualizados correctamente.' });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ error: 'Error al actualizar el usuario.' });
  }
};

exports.toggleUserStatus = async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const { active } = req.body;

    if (targetId === req.user.id && Number(active) === 0) {
      return res.status(400).json({
        error: 'Por seguridad, no puedes desactivar tu propia cuenta en sesión.'
      });
    }

    const existing = await db.get('SELECT * FROM users WHERE id = ?', [targetId]);
    if (!existing) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const newActive = active ? 1 : 0;
    const nowIso = new Date().toISOString();

    await db.withTransaction(async (tx) => {
      await tx.run('UPDATE users SET active = ? WHERE id = ?', [newActive, targetId]);

      // Si se desactiva al usuario, revocar de inmediato todas sus sesiones abiertas
      if (newActive === 0) {
        await tx.run(
          'UPDATE user_sessions SET revoked = 1, revoked_at = ? WHERE user_id = ? AND revoked = 0',
          [nowIso, targetId]
        );
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, ip_address, date)
         VALUES (?, ?, ?, 'USUARIOS', ?, ?, ?, ?)`,
        [
          existing.default_hotel_id || 1,
          req.user.id,
          newActive === 1 ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO',
          targetId,
          `Estado de @${existing.username} cambiado a ${newActive === 1 ? 'ACTIVO' : 'INACTIVO'}`,
          req.ip || '127.0.0.1',
          getTodayString()
        ]
      );
    });

    res.json({
      message:
        newActive === 1
          ? 'Usuario activado correctamente.'
          : 'Usuario desactivado y sesiones activas revocadas.'
    });
  } catch (error) {
    console.error('Error al cambiar estado de usuario:', error);
    res.status(500).json({ error: 'Error al actualizar el estado del usuario.' });
  }
};

exports.listSessions = async (req, res) => {
  try {
    const sessions = await db.query(
      `SELECT
        s.id,
        s.user_id,
        u.username,
        u.full_name,
        u.role,
        s.hotel_id,
        h.name as hotel_name,
        s.ip_address,
        s.user_agent,
        s.created_at,
        s.last_active_at,
        s.revoked,
        s.revoked_at
       FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN hotels h ON s.hotel_id = h.id
       ORDER BY s.id DESC
       LIMIT 100`
    );

    res.json(sessions);
  } catch (error) {
    console.error('Error al listar sesiones:', error);
    res.status(500).json({ error: 'Error al obtener el registro de sesiones.' });
  }
};

exports.revokeSession = async (req, res) => {
  try {
    const sessionId = Number(req.params.sessionId);
    const session = await db.get(
      `SELECT s.*, u.username FROM user_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.id = ?`,
      [sessionId]
    );

    if (!session) {
      return res.status(404).json({ error: 'Sesión no encontrada.' });
    }

    await db.withTransaction(async (tx) => {
      await tx.run(
        'UPDATE user_sessions SET revoked = 1, revoked_at = ? WHERE id = ?',
        [new Date().toISOString(), sessionId]
      );

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, ip_address, date)
         VALUES (?, ?, 'REVOCAR_SESION', 'AUTH', ?, ?, ?, ?)`,
        [
          session.hotel_id || 1,
          req.user.id,
          sessionId,
          `Sesión #${sessionId} del usuario @${session.username} cerrada remotamente`,
          req.ip || '127.0.0.1',
          getTodayString()
        ]
      );
    });

    res.json({ message: 'Sesión revocada exitosamente.' });
  } catch (error) {
    console.error('Error al revocar sesión:', error);
    res.status(500).json({ error: 'Error al revocar la sesión.' });
  }
};

exports.listAuditLogs = async (req, res) => {
  try {
    const { hotelId, module, userId } = req.query;
    const params = [];
    const conditions = [];

    if (hotelId) {
      conditions.push('a.hotel_id = ?');
      params.push(Number(hotelId));
    }
    if (module) {
      conditions.push('a.module = ?');
      params.push(String(module));
    }
    if (userId) {
      conditions.push('a.user_id = ?');
      params.push(Number(userId));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const logs = await db.query(
      `SELECT
        a.id,
        a.hotel_id,
        h.name as hotel_name,
        a.user_id,
        u.username,
        u.full_name,
        u.role as user_role,
        a.action,
        a.module,
        a.entity_id,
        a.details,
        a.ip_address,
        a.date
       FROM audit_logs a
       LEFT JOIN users u ON a.user_id = u.id
       LEFT JOIN hotels h ON a.hotel_id = h.id
       ${whereClause}
       ORDER BY a.id DESC
       LIMIT 150`,
      params
    );

    res.json(logs);
  } catch (error) {
    console.error('Error al listar bitácora de auditoría:', error);
    res.status(500).json({ error: 'Error al obtener la bitácora de auditoría.' });
  }
};

