const assert = require('assert');
const http = require('http');

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

async function runTests() {
  console.log('--- INICIANDO VERIFICACIÓN DEL BLOQUE 14: NOTIFICACIONES Y AUTOMATIZACIONES ---');

  // 1. Iniciar servidor express temporalmente
  const app = require('./src/app');
  await app.ready;
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(4002, resolve));

  try {
    // 2. Login de administrador
    const loginRes = await request(
      {
        hostname: 'localhost',
        port: 4002,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      },
      { username: 'admin', password: 'adminpassword123' }
    );
    assert.strictEqual(loginRes.status, 200, 'Login debe ser exitoso');
    const token = loginRes.data.access_token;
    assert.ok(token, 'Token JWT obtenido');

    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 3. Crear notificación manual en Hotel 1
    console.log('1. Probando creación de notificación manual en Hotel 1...');
    const createNotifRes = await request(
      {
        hostname: 'localhost',
        port: 4002,
        path: '/api/hotels/1/notifications',
        method: 'POST',
        headers: authHeaders
      },
      {
        category: 'OPERACION',
        title: 'Prueba de Alerta Bloque 14',
        message: 'Mensaje de prueba de notificación automática interna.',
        severity: 'WARNING',
        action_url: '/recepcion'
      }
    );
    assert.strictEqual(createNotifRes.status, 201, 'Debe crear la notificación con código 201');
    const notifId = createNotifRes.data.notification.id;
    assert.ok(notifId, 'ID de notificación devuelto');

    // 4. Consultar lista de notificaciones en Hotel 1
    console.log('2. Consultando lista de notificaciones...');
    const listRes = await request(
      {
        hostname: 'localhost',
        port: 4002,
        path: '/api/hotels/1/notifications',
        method: 'GET',
        headers: authHeaders
      }
    );
    assert.strictEqual(listRes.status, 200, 'Debe listar notificaciones');
    assert.ok(Array.isArray(listRes.data.notifications), 'Debe devolver array de notificaciones');
    assert.ok(listRes.data.unread_count > 0, 'Debe reportar notificaciones sin leer');

    // 5. Verificar aislamiento multi-tenant: La notificación de Hotel 1 NO debe salir en Hotel 2
    console.log('3. Verificando aislamiento multiempresa en notificaciones...');
    const hotel2ListRes = await request(
      {
        hostname: 'localhost',
        port: 4002,
        path: '/api/hotels/2/notifications',
        method: 'GET',
        headers: authHeaders
      }
    );
    assert.strictEqual(hotel2ListRes.status, 200);
    const existsInHotel2 = hotel2ListRes.data.notifications.some((n) => n.id === notifId);
    assert.strictEqual(existsInHotel2, false, 'Notificación de Hotel 1 no debe existir en Hotel 2');

    // 6. Marcar notificación como leída
    console.log('4. Probando marcado individual como leída...');
    const markRes = await request(
      {
        hostname: 'localhost',
        port: 4002,
        path: `/api/hotels/1/notifications/${notifId}/read`,
        method: 'PATCH',
        headers: authHeaders
      }
    );
    assert.strictEqual(markRes.status, 200, 'Debe marcar leída');

    // 7. Escanear alertas operativas automáticas
    console.log('5. Ejecutando escaneo automático de alertas operativas...');
    const scanRes = await request(
      {
        hostname: 'localhost',
        port: 4002,
        path: '/api/hotels/1/notifications/scan-alerts',
        method: 'POST',
        headers: authHeaders
      }
    );
    assert.strictEqual(scanRes.status, 200, 'Escaneo debe responder 200');
    assert.ok(scanRes.data.new_alerts_created !== undefined, 'Debe informar nuevas alertas creadas');

    // 8. Consultar plantillas de mensajes (WhatsApp y Email)
    console.log('6. Consultando plantillas configurables de mensajería...');
    const tplRes = await request(
      {
        hostname: 'localhost',
        port: 4002,
        path: '/api/hotels/1/notifications/templates',
        method: 'GET',
        headers: authHeaders
      }
    );
    assert.strictEqual(tplRes.status, 200, 'Debe devolver plantillas');
    assert.ok(tplRes.data.templates.length >= 4, 'Debe tener al menos las 4 plantillas base sembradas');

    // 9. Preparar mensaje para huésped y generar enlace wa.me directo
    console.log('7. Preparando mensaje para huésped con generación de enlace wa.me...');
    const prepRes = await request(
      {
        hostname: 'localhost',
        port: 4002,
        path: '/api/hotels/1/notifications/prepare-guest-message',
        method: 'POST',
        headers: authHeaders
      },
      {
        templateCode: 'CONFIRMACION_RESERVA',
        channel: 'WHATSAPP',
        customPhone: '+57 322 206 7870',
        customRecipient: 'Carlos Mario López'
      }
    );
    assert.strictEqual(prepRes.status, 200, 'Debe preparar mensaje');
    assert.ok(prepRes.data.message_body.includes('Carlos Mario López') || prepRes.data.message_body.length > 0);
    assert.ok(prepRes.data.direct_whatsapp_url.startsWith('https://wa.me/573222067870'), 'Enlace directo wa.me generado');

    // 10. Despachar mensaje a Outbox (Buzón de salida)
    console.log('8. Registrando mensaje en outbox...');
    const sendRes = await request(
      {
        hostname: 'localhost',
        port: 4002,
        path: '/api/hotels/1/notifications/send-guest-message',
        method: 'POST',
        headers: authHeaders
      },
      {
        channel: 'WHATSAPP',
        recipient: '573222067870',
        recipientName: 'Carlos Mario López',
        templateCode: 'CONFIRMACION_RESERVA',
        messageBody: prepRes.data.message_body,
        sendViaCloudApi: false
      }
    );
    assert.strictEqual(sendRes.status, 200, 'Debe despachar o encolar');
    assert.ok(sendRes.data.outbox_id, 'Debe devolver outbox_id');

    // 11. Consultar historial de Outbox
    console.log('9. Consultando historial de mensajes despachados (Outbox)...');
    const outboxRes = await request(
      {
        hostname: 'localhost',
        port: 4002,
        path: '/api/hotels/1/notifications/outbox',
        method: 'GET',
        headers: authHeaders
      }
    );
    assert.strictEqual(outboxRes.status, 200);
    assert.ok(outboxRes.data.messages.length > 0, 'Debe contener al menos 1 mensaje despachado');

    console.log('✅ TODAS LAS PRUEBAS DEL BLOQUE 14 PASARON EXITOSAMENTE (11/11).');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('❌ Error en verificación del Bloque 14:', err);
  process.exit(1);
});
