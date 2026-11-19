const https = require('https');
const http = require('http');
const db = require('../config/db');

/**
 * Servicio de Envíos Externos: WhatsApp Cloud API Oficial y SMTP
 * Implementa envío verificado cuando existan credenciales y generación directa de enlace wa.me
 */
class MessageDeliveryService {
  /**
   * Genera el enlace de chat directo de WhatsApp (wa.me) para enviar con 1 clic sin credenciales de Cloud API
   */
  static buildDirectWhatsAppUrl(phone, text) {
    if (!phone) return null;
    const cleanPhone = String(phone).replace(/\D/g, '');
    const encoded = encodeURIComponent(text || '');
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  }

  /**
   * Envía mensaje por WhatsApp Business Cloud API Oficial de Meta
   * Documentación Meta: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
   */
  static async sendWhatsAppCloudApi({ phoneNumberId, accessToken, toPhone, messageBody }) {
    if (!phoneNumberId || !accessToken) {
      throw new Error('El hotel no tiene configuradas las credenciales de WhatsApp Cloud API (Phone Number ID o Access Token).');
    }

    const cleanPhone = String(toPhone).replace(/\D/g, '');
    const postData = JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: cleanPhone,
      type: 'text',
      text: {
        preview_url: false,
        body: messageBody
      }
    });

    return new Promise((resolve, reject) => {
      const options = {
        hostname: 'graph.facebook.com',
        port: 443,
        path: `/v21.0/${phoneNumberId}/messages`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', (d) => { responseBody += d; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(responseBody);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              const messageId = parsed.messages && parsed.messages[0] ? parsed.messages[0].id : null;
              resolve({ success: true, messageId, raw: parsed });
            } else {
              const errMsg = parsed.error ? parsed.error.message : responseBody;
              reject(new Error(`Error WhatsApp Cloud API (${res.statusCode}): ${errMsg}`));
            }
          } catch (e) {
            reject(new Error(`Respuesta inválida de Meta WhatsApp API: ${responseBody}`));
          }
        });
      });

      req.on('error', (err) => reject(err));
      req.write(postData);
      req.end();
    });
  }

  /**
   * Envío por protocolo SMTP básico o adaptador de correo
   */
  static async sendSmtpEmail({ host, port, user, pass, from, secure, to, subject, bodyText, bodyHtml }) {
    if (!host || !user) {
      throw new Error('Configuración SMTP incompleta en el hotel (host o usuario no especificados).');
    }

    // Si nodemailer está instalado se usa dinámicamente, sino fallback descriptivo
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host,
        port: Number(port) || 587,
        secure: Boolean(secure),
        auth: {
          user,
          pass
        }
      });

      const info = await transporter.sendMail({
        from: from || user,
        to,
        subject,
        text: bodyText,
        html: bodyHtml || bodyText.replace(/\n/g, '<br/>')
      });

      return { success: true, messageId: info.messageId };
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        throw new Error('Librería nodemailer no instalada en el entorno backend.');
      }
      throw e;
    }
  }

  /**
   * Renderiza el cuerpo de una plantilla reemplazando variables dinámicas {{variable}}
   */
  static renderTemplate(templateString, variables = {}) {
    if (!templateString) return '';
    return templateString.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
      return variables[key] !== undefined && variables[key] !== null ? String(variables[key]) : match;
    });
  }
}

module.exports = MessageDeliveryService;

