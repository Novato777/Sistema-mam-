const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const userController = require('../controllers/userController');

router.use(requireAuth);

// Catálogo de roles y permisos granulares
router.get('/catalog', userController.getRolesAndPermissions);

// Directorio y administración de usuarios
router.get('/', requireAuth.requirePermission('users.view'), userController.listUsers);
router.post('/', requireAuth.requirePermission('users.manage'), userController.createUser);
router.put('/:id', requireAuth.requirePermission('users.manage'), userController.updateUser);
router.patch(
  '/:id/status',
  requireAuth.requirePermission('users.manage'),
  userController.toggleUserStatus
);

// Control de sesiones activas
router.get('/sessions', requireAuth.requirePermission('users.view'), userController.listSessions);
router.post(
  '/sessions/:sessionId/revoke',
  requireAuth.requirePermission('users.manage'),
  userController.revokeSession
);

// Bitácora de auditoría y seguridad
router.get('/audit-logs', requireAuth.requirePermission('audit.view'), userController.listAuditLogs);

module.exports = router;

