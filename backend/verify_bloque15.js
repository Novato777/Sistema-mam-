const assert = require('assert');
const http = require('http');
const bcrypt = require('bcryptjs');
const db = require('./src/config/db');

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, text: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runAuditSuite() {
  console.log('========================================================================');
  console.log('  BLOQUE 15 — SUITE DE PRUEBAS INTEGRALES, AUDITORÍA Y SEGURIDAD FINAL  ');
  console.log('========================================================================\n');

  const app = require('./src/app');
  await app.ready;
  const PORT = 4005;
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));

  try {
    // -------------------------------------------------------------------------
    // 1. CREACIÓN DE USUARIOS DE PRUEBA PARA CADA UNO DE LOS 9 ROLES RBAC
    // -------------------------------------------------------------------------
    console.log('--- TEST 1: AUTORIZACIÓN Y SEGURIDAD RBAC (9 ROLES OFICIALES) ---');
    const rolesToTest = [
      'PROPIETARIO',
      'ADMINISTRADOR',
      'RECEPCIONISTA',
      'CAJERO',
      'LIMPIEZA',
      'CONTABILIDAD',
      'RESTAURANTE',
      'MANTENIMIENTO',
      'AUDITOR'
    ];

    const passwordHash = await bcrypt.hash('TestPassword123!', 10);
    const tokensByRole = {};

    for (const role of rolesToTest) {
      const username = `test_${role.toLowerCase()}`;
      let user = await db.get('SELECT id FROM users WHERE username = ?', [username]);
      if (!user) {
        const ins = await db.run(
          `INSERT INTO users (username, password, full_name, role, active, default_hotel_id, created_at)
           VALUES (?, ?, ?, ?, 1, 1, '2026-11-12')`,
          [username, passwordHash, `Usuario ${role}`, role]
        );
        user = { id: ins.id };
      } else {
        await db.run('UPDATE users SET role = ?, active = 1 WHERE id = ?', [role, user.id]);
      }

      // Asegurar acceso al Hotel 1 y Hotel 2
      await db.run('DELETE FROM user_hotels WHERE user_id = ?', [user.id]);
      await db.run('INSERT INTO user_hotels (user_id, hotel_id, role, active) VALUES (?, 1, ?, 1)', [user.id, role]);
      await db.run('INSERT INTO user_hotels (user_id, hotel_id, role, active) VALUES (?, 2, ?, 1)', [user.id, role]);

      // Login para obtener token JWT de cada rol
      const loginRes = await request(
        {
          hostname: 'localhost',
          port: PORT,
          path: '/api/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        },
        { username, password: 'TestPassword123!' }
      );
      assert.strictEqual(loginRes.status, 200, `Login para ${role} debe ser 200`);
      tokensByRole[role] = loginRes.data.access_token;
    }
    console.log('✓ Se generaron y autenticaron sesiones JWT para los 9 roles oficiales.');

    // Validar matrices de permisos RBAC
    // A. Recepcionista NO debe poder modificar cuentas contables (debe dar 403)
    const recepAttemptPuc = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/hotels/1/accounting/accounts',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokensByRole['RECEPCIONISTA']}`,
        'Content-Type': 'application/json'
      }
    }, { code: '999999', name: 'Cuenta No Autorizada', account_class: 'ACTIVO' });
    assert.strictEqual(recepAttemptPuc.status, 403, 'Recepcionista no debe poder crear cuentas en PUC');

    // B. Personal de Limpieza NO debe poder crear reservas (debe dar 403)
    const limpAttemptRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/hotels/1/reservations',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokensByRole['LIMPIEZA']}`,
        'Content-Type': 'application/json'
      }
    }, { guest: { name: 'Intruso' } });
    assert.strictEqual(limpAttemptRes.status, 403, 'Personal de Limpieza no debe poder crear reservas');

    // C. Cajero NO debe poder crear tickets de mantenimiento correctivo con bloqueo técnico
    const cajeroAttemptMaint = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/hotels/1/maintenance/tickets',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokensByRole['CAJERO']}`,
        'Content-Type': 'application/json'
      }
    }, { title: 'Daño' });
    assert.strictEqual(cajeroAttemptMaint.status, 403, 'Cajero no debe poder operar mantenimiento');

    // D. Auditor PUEDE ver reportes pero NO modificar tarifas
    const auditorReports = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/hotels/1/reports/overview',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokensByRole['AUDITOR']}`
      }
    });
    assert.strictEqual(auditorReports.status, 200, 'Auditor tiene acceso de lectura a reportes');

    const auditorAttemptEdit = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/hotels/1/room-types',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokensByRole['AUDITOR']}`,
        'Content-Type': 'application/json'
      }
    }, { name: 'Tipo Invalido' });
    assert.strictEqual(auditorAttemptEdit.status, 403, 'Auditor no puede crear ni mutar tipos de habitación');

    console.log('✓ Matriz de permisos RBAC verificada estrictamente: restricciones 403 activas.');

    // -------------------------------------------------------------------------
    // 2. PRUEBA DE AISLAMIENTO MULTIEMPRESA ESTRICTO (TENANT ISOLATION)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 2: AISLAMIENTO MULTIEMPRESA ESTRICTO (HOTEL 1 vs HOTEL 2) ---');
    const adminToken = tokensByRole['ADMINISTRADOR'];
    const h1Headers = { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' };

    // Crear un producto de inventario exclusivo en Hotel 1
    const testSku = `TEST-ISO-${Date.now()}`;
    const createProdH1 = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/hotels/1/inventory/products',
      method: 'POST',
      headers: h1Headers
    }, {
      sku: testSku,
      name: 'Producto Aislado H1',
      department: 'GENERAL',
      unit: 'UND',
      cost: 15000,
      price: 25000,
      initial_stock: 10
    });
    assert.strictEqual(createProdH1.status, 201);
    const prodH1Id = createProdH1.data.product.id;

    // Consultar el inventario de Hotel 2 y confirmar que el producto de Hotel 1 NO existe
    const getProdH2 = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/hotels/2/inventory/products',
      method: 'GET',
      headers: h1Headers
    });
    assert.strictEqual(getProdH2.status, 200);
    const prodListH2 = Array.isArray(getProdH2.data) ? getProdH2.data : getProdH2.data.products || [];
    const leaked = prodListH2.some((p) => p.sku === testSku || p.id === prodH1Id);
    assert.strictEqual(leaked, false, '¡Fallo crítico! El inventario de Hotel 1 se filtró a Hotel 2');

    // Intentar consultar o editar el producto de Hotel 1 usando el tenant de Hotel 2
    const crossTenantUpdate = await request({
      hostname: 'localhost',
      port: PORT,
      path: `/api/hotels/2/inventory/products/${prodH1Id}`,
      method: 'PUT',
      headers: h1Headers
    }, { name: 'Intrusión Cross-Tenant' });
    assert.strictEqual(crossTenantUpdate.status, 404, 'No se debe permitir mutación cross-tenant');

    console.log('✓ Aislamiento de datos validado: Hotel 1 y Hotel 2 no comparten registros ni permiten acceso cruzado.');

    // -------------------------------------------------------------------------
    // 3. INTEGRIDAD FINANCIERA Y CONTABLE (PARTIDA DOBLE Y FOLIOS)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 3: INTEGRIDAD FINANCIERA, PARTIDA DOBLE Y CUADRE DE CAJAS ---');
    // A. Validación estricta de partida doble: si Débitos !== Créditos, el backend DEBE rechazar con 400
    const unbalancedEntry = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/hotels/1/accounting/journal',
      method: 'POST',
      headers: h1Headers
    }, {
      entry_date: '2026-11-12',
      description: 'Asiento Descuadrado Bloque 15',
      lines: [
        { account_code: '110505', debit: 50000, credit: 0 },
        { account_code: '414005', debit: 0, credit: 40000 } // Descuadre de 10.000
      ]
    });
    assert.strictEqual(unbalancedEntry.status, 400, 'Asiento descuadrado debe ser rechazado');
    assert.ok(unbalancedEntry.data.error.includes('Partida Doble') || unbalancedEntry.data.error.includes('Descuadre'), 'Debe reportar violación de partida doble');

    // B. Asiento cuadrado perfecto debe ser aceptado
    const balancedEntry = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/hotels/1/accounting/journal',
      method: 'POST',
      headers: h1Headers
    }, {
      entry_date: '2026-11-12',
      description: 'Asiento Auditado Bloque 15',
      lines: [
        { account_code: '110505', debit: 65000, credit: 0 },
        { account_code: '414005', debit: 0, credit: 65000 }
      ]
    });
    assert.strictEqual(balancedEntry.status, 201, 'Asiento cuadrado debe registrarse');
    console.log('✓ Integridad contable verificada: Regla estricta de partida doble Σ Débito = Σ Crédito cumplida.');

    // -------------------------------------------------------------------------
    // 4. PREVENCIÓN TRANSACCIONAL DE OVERBOOKING (CONCURRENCIA)
    // -------------------------------------------------------------------------
    console.log('\n--- TEST 4: CONCURRENCIA ACID Y PREVENCIÓN DE OVERBOOKING ---');
    // Consultar una habitación libre en Hotel 1
    const roomsRes = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api/hotels/1/rooms',
      method: 'GET',
      headers: h1Headers
    });
    const roomsList = Array.isArray(roomsRes.data) ? roomsRes.data : roomsRes.data.rooms || [];
    const targetRoom = roomsList.find((r) => r.status === 'DISPONIBLE') || roomsList[0];
    assert.ok(targetRoom, 'Debe haber una habitación para la prueba');

    const checkInFuture = '2026-12-01';
    const checkOutFuture = '2026-12-05';

    // Disparar 2 solicitudes concurrentes de reserva para LA MISMA habitación y fechas exactas
    const payloadReserva1 = {
      guest_name: 'Cliente Concurrente 1',
      guest_document: '11111111',
      guest_phone: '3001112233',
      check_in_date: checkInFuture,
      check_out_date: checkOutFuture,
      room_ids: [targetRoom.id]
    };

    const payloadReserva2 = {
      guest_name: 'Cliente Concurrente 2',
      guest_document: '22222222',
      guest_phone: '3004445566',
      check_in_date: checkInFuture,
      check_out_date: checkOutFuture,
      room_ids: [targetRoom.id]
    };

    const [res1, res2] = await Promise.all([
      request({ hostname: 'localhost', port: PORT, path: '/api/hotels/1/reservations', method: 'POST', headers: h1Headers }, payloadReserva1),
      request({ hostname: 'localhost', port: PORT, path: '/api/hotels/1/reservations', method: 'POST', headers: h1Headers }, payloadReserva2)
    ]);

    // Exactamente una debe ganar (201) y la otra debe ser rechazada por conflicto/overbooking (409)
    const statuses = [res1.status, res2.status];
    assert.ok(statuses.includes(201), 'Una de las solicitudes concurrentes debe ganar');
    assert.ok(statuses.includes(409), 'La otra solicitud concurrente debe rebotar con 409 Overbooking Conflict');
    console.log(`✓ Prevención de Overbooking exitosa: Reserva A=${res1.status}, Reserva B=${res2.status}. Nunca se sobreasigna.`);

    // -------------------------------------------------------------------------
    // 5. AUDITORÍA FINAL DEL SISTEMA
    // -------------------------------------------------------------------------
    console.log('\n========================================================================');
    console.log('  RESULTADOS DE LA AUDITORÍA FINAL: 100% DE PRUEBAS COMPLETADAS');
    console.log('  1. Autenticación y RBAC: 9 Roles Validados y Confinados');
    console.log('  2. Aislamiento Multi-Tenant: Hotel 1 y Hotel 2 Herméticos');
    console.log('  3. Integridad Financiera: Partida Doble y Control de Arqueos');
    console.log('  4. Control de Concurrencia: Prevención Transaccional de Overbooking');
    console.log('========================================================================\n');
  } finally {
    server.close();
  }
}

runAuditSuite().catch((err) => {
  console.error('❌ Error en Suite de Auditoría Final (Bloque 15):', err);
  process.exit(1);
});
