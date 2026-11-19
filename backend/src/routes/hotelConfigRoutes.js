const express = require('express');
const router = express.Router();
const requireAuth = require('../middleware/auth');
const requireHotelAccess = require('../middleware/tenant');
const hotelConfigController = require('../controllers/hotelConfigController');

router.use(requireAuth);

// Listado global de establecimientos autorizados y creación de nueva sede
router.get('/', hotelConfigController.listHotels);
router.post('/', requireAuth.requireRole('PROPIETARIO', 'ADMINISTRADOR'), hotelConfigController.createHotel);

// Configuración individual aislada por hotel (:hotelId)
router.get('/:hotelId/config', requireHotelAccess, hotelConfigController.getHotelConfig);
router.put(
  '/:hotelId/config',
  requireHotelAccess,
  requireAuth.requireRole('PROPIETARIO', 'ADMINISTRADOR'),
  hotelConfigController.updateHotelConfig
);

// Impuestos por hotel
router.post(
  '/:hotelId/taxes',
  requireHotelAccess,
  requireAuth.requireRole('PROPIETARIO', 'ADMINISTRADOR', 'CONTABILIDAD'),
  hotelConfigController.createTax
);
router.put(
  '/:hotelId/taxes/:taxId',
  requireHotelAccess,
  requireAuth.requireRole('PROPIETARIO', 'ADMINISTRADOR', 'CONTABILIDAD'),
  hotelConfigController.updateTax
);
router.delete(
  '/:hotelId/taxes/:taxId',
  requireHotelAccess,
  requireAuth.requireRole('PROPIETARIO', 'ADMINISTRADOR'),
  hotelConfigController.deleteTax
);

// Métodos de pago por hotel
router.post(
  '/:hotelId/payment-methods',
  requireHotelAccess,
  requireAuth.requireRole('PROPIETARIO', 'ADMINISTRADOR'),
  hotelConfigController.createPaymentMethod
);
router.put(
  '/:hotelId/payment-methods/:pmId',
  requireHotelAccess,
  requireAuth.requireRole('PROPIETARIO', 'ADMINISTRADOR'),
  hotelConfigController.updatePaymentMethod
);
router.delete(
  '/:hotelId/payment-methods/:pmId',
  requireHotelAccess,
  requireAuth.requireRole('PROPIETARIO', 'ADMINISTRADOR'),
  hotelConfigController.deletePaymentMethod
);

// Departamentos por hotel
router.post(
  '/:hotelId/departments',
  requireHotelAccess,
  requireAuth.requireRole('PROPIETARIO', 'ADMINISTRADOR'),
  hotelConfigController.createDepartment
);
router.delete(
  '/:hotelId/departments/:deptId',
  requireHotelAccess,
  requireAuth.requireRole('PROPIETARIO', 'ADMINISTRADOR'),
  hotelConfigController.deleteDepartment
);

// Tipos de habitación por hotel
router.get(
  '/:hotelId/room-types',
  requireHotelAccess,
  requireAuth.requirePermission('rooms.view'),
  hotelConfigController.getRoomTypes
);
router.post(
  '/:hotelId/room-types',
  requireHotelAccess,
  requireAuth.requirePermission('rooms.manage'),
  hotelConfigController.createRoomType
);
router.put(
  '/:hotelId/room-types/:rtId',
  requireHotelAccess,
  requireAuth.requirePermission('rooms.manage'),
  hotelConfigController.updateRoomType
);
router.delete(
  '/:hotelId/room-types/:rtId',
  requireHotelAccess,
  requireAuth.requirePermission('rooms.manage'),
  hotelConfigController.deleteRoomType
);

module.exports = router;

