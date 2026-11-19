const express = require('express');
const router = express.Router({ mergeParams: true });
const requireAuth = require('../middleware/auth');
const requireHotelAccess = require('../middleware/tenant');
const hotelController = require('../controllers/hotelController');
const hotelConfigController = require('../controllers/hotelConfigController');
const reservationController = require('../controllers/reservationController');
const receptionController = require('../controllers/receptionController');
const cashController = require('../controllers/cashController');
const housekeepingController = require('../controllers/housekeepingController');
const posServiceController = require('../controllers/posServiceController');
const inventoryController = require('../controllers/inventoryController');
const accountingController = require('../controllers/accountingController');
const maintenanceController = require('../controllers/maintenanceController');
const staffController = require('../controllers/staffController');
const reportController = require('../controllers/reportController');
const notificationController = require('../controllers/notificationController');

// Todas las rutas operativas del hotel exigen autenticación y aislamiento Multi-Tenant
router.use(requireAuth);
router.use(requireHotelAccess);

router.get('/dashboard', requireAuth.requirePermission('dashboard.view'), hotelController.getDashboard);
router.get('/summary', requireAuth.requirePermission('dashboard.view'), hotelController.getDashboard);

// Tipos de Habitación (Módulo 2)
router.get('/room-types', requireAuth.requirePermission('rooms.view'), hotelConfigController.getRoomTypes);
router.post('/room-types', requireAuth.requirePermission('rooms.manage'), hotelConfigController.createRoomType);
router.put('/room-types/:rtId', requireAuth.requirePermission('rooms.manage'), hotelConfigController.updateRoomType);
router.delete('/room-types/:rtId', requireAuth.requirePermission('rooms.manage'), hotelConfigController.deleteRoomType);

// Motor de Reservas, Disponibilidad y Calendario Visual (Módulo 3)
router.get(
  '/reservations/availability',
  requireAuth.requirePermission('reservations.view', 'reception.view'),
  reservationController.checkAvailability
);
router.get(
  '/reservations/calendar',
  requireAuth.requirePermission('reservations.view', 'reception.view', 'rooms.view'),
  reservationController.getOccupancyCalendar
);
router.get(
  '/reservations',
  requireAuth.requirePermission('reservations.view', 'reception.view'),
  reservationController.listReservations
);
router.post(
  '/reservations',
  requireAuth.requirePermission('reservations.manage'),
  reservationController.createReservation
);
router.put(
  '/reservations/:id',
  requireAuth.requirePermission('reservations.manage'),
  reservationController.updateReservation
);
router.post(
  '/reservations/:id/advance',
  requireAuth.requirePermission('reservations.manage', 'cash.operate'),
  reservationController.registerAdvancePayment
);
router.patch(
  '/reservations/:id/status',
  requireAuth.requirePermission('reservations.manage', 'reception.checkin'),
  reservationController.updateReservationStatus
);

// Gestión de Habitaciones, Estados e Historial (Módulo 2)
router.get('/rooms', requireAuth.requirePermission('rooms.view'), hotelController.getRooms);
router.post('/rooms', requireAuth.requirePermission('rooms.manage'), hotelController.createRoom);
router.put('/rooms/:id', requireAuth.requirePermission('rooms.manage'), hotelController.updateRoom);
router.patch(
  '/rooms/:id/status',
  requireAuth.requirePermission('rooms.manage', 'housekeeping.operate', 'housekeeping.inspect', 'maintenance.operate'),
  hotelController.changeRoomStatus
);
router.patch('/rooms/:id/activate', requireAuth.requirePermission('rooms.manage'), hotelController.activateRoom);
router.delete('/rooms/:id', requireAuth.requirePermission('rooms.manage'), hotelController.deleteRoom);
router.get('/rooms/:id/history', requireAuth.requirePermission('rooms.view'), hotelController.getRoomHistory);
router.post(
  '/rooms/:id/history',
  requireAuth.requirePermission('rooms.manage', 'housekeeping.operate', 'housekeeping.inspect', 'maintenance.operate'),
  hotelController.addRoomHistoryEvent
);

// Recepción, Huéspedes, Folios de Estancia, Acompañantes y Cumplimiento Legal (Módulo 4)
router.get(
  '/reception/guests',
  requireAuth.requirePermission('reception.view'),
  receptionController.listGuests
);
router.get(
  '/reception/guests/:guestId',
  requireAuth.requirePermission('reception.view'),
  receptionController.getGuestHistory
);
router.post(
  '/reception/guests',
  requireAuth.requirePermission('reception.checkin', 'reception.view'),
  receptionController.saveGuest
);
router.put(
  '/reception/guests/:guestId',
  requireAuth.requirePermission('reception.checkin', 'reception.view'),
  receptionController.saveGuest
);

router.get(
  '/reception/stays',
  requireAuth.requirePermission('reception.view', 'rooms.view'),
  receptionController.listStays
);
router.get(
  '/reception/stays/:stayId/folio',
  requireAuth.requirePermission('reception.view', 'cash.view'),
  receptionController.getStayFolio
);
router.post(
  '/reception/checkin',
  requireAuth.requirePermission('reception.checkin'),
  receptionController.performCheckIn
);
router.post(
  '/reception/stays/:stayId/companions',
  requireAuth.requirePermission('reception.checkin', 'reception.view'),
  receptionController.addCompanion
);
router.delete(
  '/reception/stays/:stayId/companions/:companionId',
  requireAuth.requirePermission('reception.checkin', 'reception.view'),
  receptionController.removeCompanion
);
router.post(
  '/reception/stays/:stayId/charges',
  requireAuth.requirePermission('reception.checkin', 'cash.operate', 'restaurant.operate'),
  receptionController.addFolioCharge
);
router.post(
  '/reception/stays/:stayId/payments',
  requireAuth.requirePermission('cash.operate', 'reception.checkin'),
  receptionController.addFolioPayment
);
router.post(
  '/reception/stays/:stayId/change-room',
  requireAuth.requirePermission('reception.checkin', 'rooms.manage'),
  receptionController.changeStayRoom
);
router.post(
  '/reception/stays/:stayId/checkout',
  requireAuth.requirePermission('reception.checkout'),
  receptionController.performCheckOut
);
router.get(
  '/reception/compliance-report',
  requireAuth.requirePermission('reception.view', 'reports.view'),
  receptionController.getLegalComplianceReport
);

// Compatibilidad con atajos directos desde el Rack de Habitaciones
router.post('/rooms/:id/guest', requireAuth.requirePermission('reception.checkin'), hotelController.assignGuest);
router.post('/rooms/:id/assign', requireAuth.requirePermission('reception.checkin'), hotelController.assignGuest);
router.post('/rooms/:id/payment', requireAuth.requirePermission('cash.operate'), hotelController.registerPayment);
router.post('/rooms/:id/pay', requireAuth.requirePermission('cash.operate'), hotelController.registerPayment);
router.post('/rooms/:id/checkout', requireAuth.requirePermission('reception.checkout'), hotelController.checkoutRoom);

// Caja y Movimientos Financieros (Módulo 5 - Bloque 7)
router.get(
  '/cash/overview',
  requireAuth.requirePermission('cash.view', 'cash.operate'),
  cashController.getCashOverview
);
router.post(
  '/cash/registers/open',
  requireAuth.requirePermission('cash.operate'),
  cashController.openCashRegister
);
router.post(
  '/cash/registers/:registerId/audit',
  requireAuth.requirePermission('cash.close', 'cash.operate'),
  cashController.performCashAudit
);
router.post(
  '/cash/registers/:registerId/close',
  requireAuth.requirePermission('cash.close'),
  cashController.closeCashRegister
);
router.post(
  '/cash/movements',
  requireAuth.requirePermission('cash.operate'),
  cashController.createCashMovement
);
router.post(
  '/cash/movements/:movementId/void',
  requireAuth.requirePermission('cash.void'),
  cashController.voidCashMovement
);
router.get(
  '/cash/movements/:movementId/receipt',
  requireAuth.requirePermission('cash.view', 'cash.operate'),
  cashController.getMovementReceipt
);
router.get(
  '/cash/reports',
  requireAuth.requirePermission('cash.view', 'reports.view'),
  cashController.getCashReports
);

// Movimientos de Caja (Rutas rápidas desde el Rack de Habitaciones)
router.get('/transactions', requireAuth.requirePermission('cash.view'), hotelController.getTransactions);
router.post('/transactions', requireAuth.requirePermission('cash.operate'), hotelController.createTransaction);
router.delete('/transactions/:id', requireAuth.requirePermission('cash.void'), hotelController.deleteTransaction);

// Módulo 6 — Limpieza y Housekeeping (Bloque 8)
router.get(
  '/housekeeping/overview',
  requireAuth.requirePermission('housekeeping.view', 'housekeeping.operate', 'rooms.view'),
  housekeepingController.getHousekeepingOverview
);
router.post(
  '/housekeeping/tasks',
  requireAuth.requirePermission('housekeeping.operate', 'housekeeping.inspect', 'rooms.manage'),
  housekeepingController.createHousekeepingTask
);
router.post(
  '/housekeeping/tasks/generate-daily',
  requireAuth.requirePermission('housekeeping.operate', 'housekeeping.inspect', 'rooms.manage'),
  housekeepingController.generateDailyCleaningTasks
);
router.put(
  '/housekeeping/tasks/:taskId/assign',
  requireAuth.requirePermission('housekeeping.operate', 'housekeeping.inspect', 'rooms.manage'),
  housekeepingController.assignHousekeepingTask
);
router.post(
  '/housekeeping/tasks/:taskId/start',
  requireAuth.requirePermission('housekeeping.operate', 'housekeeping.inspect'),
  housekeepingController.startHousekeepingTask
);
router.post(
  '/housekeeping/tasks/:taskId/complete',
  requireAuth.requirePermission('housekeeping.operate', 'housekeeping.inspect'),
  housekeepingController.completeHousekeepingTask
);
router.post(
  '/housekeeping/tasks/:taskId/inspect',
  requireAuth.requirePermission('housekeeping.inspect', 'rooms.manage'),
  housekeepingController.inspectHousekeepingTask
);
router.post(
  '/housekeeping/report-damage',
  requireAuth.requirePermission('housekeeping.operate', 'housekeeping.inspect', 'maintenance.operate'),
  housekeepingController.reportDamageFromHousekeeping
);

// Módulo 7 — Restaurante, Cafetería, Room Service, Minibar, Lavandería y Servicios (Bloque 9)
router.get(
  '/services/overview',
  requireAuth.requirePermission('restaurant.view', 'restaurant.operate'),
  posServiceController.getOverview
);
router.get(
  '/services/catalog',
  requireAuth.requirePermission('restaurant.view', 'restaurant.operate'),
  posServiceController.listCatalog
);
router.post(
  '/services/catalog',
  requireAuth.requirePermission('restaurant.operate'),
  posServiceController.createCatalogItem
);
router.put(
  '/services/catalog/:itemId',
  requireAuth.requirePermission('restaurant.operate'),
  posServiceController.updateCatalogItem
);
router.patch(
  '/services/catalog/:itemId/toggle',
  requireAuth.requirePermission('restaurant.operate'),
  posServiceController.toggleCatalogItem
);

router.get(
  '/services/tables',
  requireAuth.requirePermission('restaurant.view', 'restaurant.operate'),
  posServiceController.listTables
);
router.post(
  '/services/tables',
  requireAuth.requirePermission('restaurant.operate'),
  posServiceController.createTable
);
router.put(
  '/services/tables/:tableId',
  requireAuth.requirePermission('restaurant.operate'),
  posServiceController.updateTable
);
router.delete(
  '/services/tables/:tableId',
  requireAuth.requirePermission('restaurant.operate'),
  posServiceController.deleteTable
);

router.get(
  '/services/orders',
  requireAuth.requirePermission('restaurant.view', 'restaurant.operate'),
  posServiceController.listOrders
);
router.post(
  '/services/orders',
  requireAuth.requirePermission('restaurant.operate'),
  posServiceController.createOrder
);
router.post(
  '/services/orders/:orderId/items',
  requireAuth.requirePermission('restaurant.operate'),
  posServiceController.addOrderItems
);
router.delete(
  '/services/orders/:orderId/items/:itemId',
  requireAuth.requirePermission('restaurant.operate'),
  posServiceController.removeOrderItem
);
router.patch(
  '/services/orders/:orderId/status',
  requireAuth.requirePermission('restaurant.operate'),
  posServiceController.updateOrderStatus
);
router.post(
  '/services/orders/:orderId/settle',
  requireAuth.requirePermission('restaurant.operate', 'cash.operate'),
  posServiceController.settleOrder
);
router.post(
  '/services/orders/:orderId/void',
  requireAuth.requirePermission('restaurant.operate', 'cash.void'),
  posServiceController.voidOrder
);

router.get(
  '/services/reports',
  requireAuth.requirePermission('restaurant.view', 'reports.view', 'cash.view'),
  posServiceController.getServiceReports
);

// Módulo 8 — Inventario Hotelero Integral, Compras, Kardex y Recetas (Bloque 10)
router.get(
  '/inventory/overview',
  requireAuth.requirePermission('inventory.view', 'inventory.manage'),
  inventoryController.getOverview
);
router.get(
  '/inventory/products',
  requireAuth.requirePermission('inventory.view', 'inventory.manage'),
  inventoryController.listProducts
);
router.post(
  '/inventory/products',
  requireAuth.requirePermission('inventory.manage'),
  inventoryController.createProduct
);
router.put(
  '/inventory/products/:productId',
  requireAuth.requirePermission('inventory.manage'),
  inventoryController.updateProduct
);
router.patch(
  '/inventory/products/:productId/toggle',
  requireAuth.requirePermission('inventory.manage'),
  inventoryController.toggleProduct
);
router.get(
  '/inventory/products/:productId/kardex',
  requireAuth.requirePermission('inventory.view', 'inventory.manage'),
  inventoryController.getProductKardex
);
router.get(
  '/inventory/alerts',
  requireAuth.requirePermission('inventory.view', 'inventory.manage', 'dashboard.view'),
  inventoryController.getAlerts
);

router.get(
  '/inventory/suppliers',
  requireAuth.requirePermission('inventory.view', 'inventory.manage'),
  inventoryController.listSuppliers
);
router.post(
  '/inventory/suppliers',
  requireAuth.requirePermission('inventory.manage'),
  inventoryController.createSupplier
);
router.put(
  '/inventory/suppliers/:supplierId',
  requireAuth.requirePermission('inventory.manage'),
  inventoryController.updateSupplier
);
router.patch(
  '/inventory/suppliers/:supplierId/toggle',
  requireAuth.requirePermission('inventory.manage'),
  inventoryController.toggleSupplier
);

router.get(
  '/inventory/purchases',
  requireAuth.requirePermission('inventory.view', 'inventory.manage'),
  inventoryController.listPurchases
);
router.post(
  '/inventory/purchases',
  requireAuth.requirePermission('inventory.manage'),
  inventoryController.createPurchase
);
router.post(
  '/inventory/purchases/:purchaseId/receive',
  requireAuth.requirePermission('inventory.manage'),
  inventoryController.receivePurchase
);
router.post(
  '/inventory/purchases/:purchaseId/void',
  requireAuth.requirePermission('inventory.manage'),
  inventoryController.voidPurchase
);

router.post(
  '/inventory/movements',
  requireAuth.requirePermission('inventory.manage'),
  inventoryController.registerMovement
);

router.get(
  '/inventory/recipes',
  requireAuth.requirePermission('inventory.view', 'inventory.manage', 'restaurant.view'),
  inventoryController.listRecipes
);
router.put(
  '/inventory/recipes/:catalogId',
  requireAuth.requirePermission('inventory.manage', 'restaurant.operate'),
  inventoryController.saveCatalogRecipe
);

// Módulo 9 — Contabilidad de Partida Doble, PUC, CXC/CXP, Conciliación, Estados Financieros y Adaptador DIAN (Bloque 11)
router.get(
  '/accounting/overview',
  requireAuth.requirePermission('accounting.view', 'accounting.manage'),
  accountingController.getOverview
);
router.get(
  '/accounting/accounts',
  requireAuth.requirePermission('accounting.view', 'accounting.manage'),
  accountingController.listAccounts
);
router.post(
  '/accounting/accounts',
  requireAuth.requirePermission('accounting.manage'),
  accountingController.createAccount
);
router.put(
  '/accounting/accounts/:accountId',
  requireAuth.requirePermission('accounting.manage'),
  accountingController.updateAccount
);

router.get(
  '/accounting/rules',
  requireAuth.requirePermission('accounting.view', 'accounting.manage'),
  accountingController.listRules
);
router.put(
  '/accounting/rules/:ruleId',
  requireAuth.requirePermission('accounting.manage'),
  accountingController.updateRule
);

router.get(
  '/accounting/journal',
  requireAuth.requirePermission('accounting.view', 'accounting.manage'),
  accountingController.listJournalEntries
);
router.post(
  '/accounting/journal',
  requireAuth.requirePermission('accounting.manage'),
  accountingController.createJournalEntry
);
router.post(
  '/accounting/journal/:entryId/void',
  requireAuth.requirePermission('accounting.manage'),
  accountingController.voidJournalEntry
);
router.post(
  '/accounting/sync-operations',
  requireAuth.requirePermission('accounting.manage'),
  accountingController.syncOperations
);

router.get(
  '/accounting/ledger',
  requireAuth.requirePermission('accounting.view', 'accounting.manage'),
  accountingController.getGeneralLedger
);
router.get(
  '/accounting/statements',
  requireAuth.requirePermission('accounting.view', 'accounting.manage', 'reports.view'),
  accountingController.getFinancialStatements
);

router.get(
  '/accounting/ar-ap',
  requireAuth.requirePermission('accounting.view', 'accounting.manage'),
  accountingController.listArAp
);
router.post(
  '/accounting/ar-ap',
  requireAuth.requirePermission('accounting.manage'),
  accountingController.createArAp
);
router.post(
  '/accounting/ar-ap/:id/payments',
  requireAuth.requirePermission('accounting.manage', 'cash.operate'),
  accountingController.registerArApPayment
);

router.get(
  '/accounting/reconciliations',
  requireAuth.requirePermission('accounting.view', 'accounting.manage'),
  accountingController.listReconciliations
);
router.post(
  '/accounting/reconciliations',
  requireAuth.requirePermission('accounting.manage'),
  accountingController.createReconciliation
);

router.post(
  '/accounting/periods/close',
  requireAuth.requirePermission('accounting.manage'),
  accountingController.closePeriod
);
router.post(
  '/accounting/periods/reopen',
  requireAuth.requirePermission('accounting.manage'),
  accountingController.reopenPeriod
);

router.get(
  '/accounting/dian',
  requireAuth.requirePermission('accounting.view', 'accounting.manage'),
  accountingController.getDianAdapterOverview
);
router.put(
  '/accounting/dian/config',
  requireAuth.requirePermission('accounting.manage', 'config.manage'),
  accountingController.saveDianConfig
);
router.post(
  '/accounting/dian/invoices',
  requireAuth.requirePermission('accounting.manage'),
  accountingController.prepareElectronicInvoice
);

// Módulo 10 — Personal, Fichas de Empleados, Turnos y Rendimiento Operativo (Bloque 12)
router.get(
  '/staff/overview',
  requireAuth.requirePermission('users.view', 'users.manage', 'dashboard.view'),
  staffController.getStaffOverview
);
router.put(
  '/staff/:userId/profile',
  requireAuth.requirePermission('users.manage'),
  staffController.saveEmployeeProfile
);
router.get(
  '/staff/:userId/activity',
  requireAuth.requirePermission('users.view', 'users.manage', 'audit.view'),
  staffController.getEmployeeActivityHistory
);
router.post(
  '/staff/shifts',
  requireAuth.requirePermission('users.manage'),
  staffController.createShift
);
router.patch(
  '/staff/shifts/:shiftId/status',
  requireAuth.requirePermission('users.manage', 'users.view'),
  staffController.updateShiftStatus
);
router.delete(
  '/staff/shifts/:shiftId',
  requireAuth.requirePermission('users.manage'),
  staffController.deleteShift
);

// Módulo 11 — Mantenimiento Preventivo y Correctivo + Historial Técnico por Habitación (Bloque 12)
router.get(
  '/maintenance/overview',
  requireAuth.requirePermission('maintenance.view', 'maintenance.operate', 'rooms.view'),
  maintenanceController.getOverview
);
router.post(
  '/maintenance/tickets',
  requireAuth.requirePermission('maintenance.operate', 'housekeeping.operate', 'rooms.manage'),
  maintenanceController.createTicket
);
router.post(
  '/maintenance/tickets/:ticketId/start',
  requireAuth.requirePermission('maintenance.operate'),
  maintenanceController.startTicket
);
router.put(
  '/maintenance/tickets/:ticketId',
  requireAuth.requirePermission('maintenance.operate'),
  maintenanceController.updateTicket
);
router.post(
  '/maintenance/tickets/:ticketId/resolve',
  requireAuth.requirePermission('maintenance.operate', 'rooms.manage'),
  maintenanceController.resolveTicket
);
router.get(
  '/maintenance/rooms/:roomId/history',
  requireAuth.requirePermission('maintenance.view', 'maintenance.operate', 'rooms.view'),
  maintenanceController.getRoomTechnicalHistory
);

// Módulo 12 — Reportes, Estadísticas, ADR/RevPAR, Control Legal y Rentabilidad (Bloque 13)
router.get(
  '/reports/overview',
  requireAuth.requirePermission('reports.view', 'reports.export', 'accounting.view', 'dashboard.view'),
  reportController.getReportsOverview
);

// Módulo 14 — Notificaciones y Automatizaciones (Bloque 14)
router.get(
  '/notifications',
  requireAuth.requirePermission('notifications.view', 'dashboard.view'),
  notificationController.getNotifications
);
router.patch(
  '/notifications/:id/read',
  requireAuth.requirePermission('notifications.view', 'dashboard.view'),
  notificationController.markAsRead
);
router.post(
  '/notifications/mark-all-read',
  requireAuth.requirePermission('notifications.view', 'dashboard.view'),
  notificationController.markAllAsRead
);
router.post(
  '/notifications/scan-alerts',
  requireAuth.requirePermission('notifications.manage', 'dashboard.view'),
  notificationController.scanOperationalAlerts
);
router.post(
  '/notifications',
  requireAuth.requirePermission('notifications.manage'),
  notificationController.createNotification
);
router.get(
  '/notifications/templates',
  requireAuth.requirePermission('notifications.view', 'notifications.manage'),
  notificationController.getTemplates
);
router.put(
  '/notifications/templates/:templateId',
  requireAuth.requirePermission('notifications.manage', 'config.manage'),
  notificationController.updateTemplate
);
router.post(
  '/notifications/prepare-guest-message',
  requireAuth.requirePermission('notifications.view', 'reception.view', 'reservations.view'),
  notificationController.prepareGuestMessage
);
router.post(
  '/notifications/send-guest-message',
  requireAuth.requirePermission('notifications.manage', 'reception.view', 'reservations.view'),
  notificationController.sendMessageToGuest
);
router.get(
  '/notifications/outbox',
  requireAuth.requirePermission('notifications.view', 'notifications.manage'),
  notificationController.getMessageOutbox
);
router.put(
  '/notifications/config/messaging',
  requireAuth.requirePermission('config.manage', 'notifications.manage'),
  notificationController.updateMessagingConfig
);

module.exports = router;
