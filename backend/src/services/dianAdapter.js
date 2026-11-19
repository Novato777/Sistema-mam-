const crypto = require('crypto');

/**
 * Adaptador Estándar de Facturación Electrónica DIAN (UBL 2.1 - Colombia).
 * Diseñado como interfaz desacoplada para conectar cualquier Proveedor Tecnológico
 * autorizado por la DIAN (Siigo, Alegra, Carvajal, Cadena, Facturatech, etc.)
 * sin simular aceptaciones legales reales cuando no hay credenciales de producción.
 */

const SUPPORTED_PROVIDERS = [
  {
    code: 'ADAPTADOR_ESTANDAR',
    name: 'Adaptador Base UBL 2.1 (Sin proveedor externo conectado)',
    supports_live_transmission: false
  },
  {
    code: 'SIIGO_API',
    name: 'Siigo Nube / Facturación Electrónica API',
    supports_live_transmission: true
  },
  {
    code: 'ALEGRA_API',
    name: 'Alegra Facturación Electrónica DIAN',
    supports_live_transmission: true
  },
  {
    code: 'CARVAJAL_CEN',
    name: 'Carvajal Tecnología y Servicios (CEN Financiero)',
    supports_live_transmission: true
  },
  {
    code: 'FACTURATECH_API',
    name: 'Facturatech Proveedor Tecnológico DIAN',
    supports_live_transmission: true
  }
];

const validateHotelDianConfig = (hotel) => {
  const issues = [];
  if (!hotel?.tax_id) issues.push('Falta el NIT / RUT del establecimiento en Configuración.');
  if (!hotel?.legal_name && !hotel?.name) issues.push('Falta la razón social del emisor.');
  if (!hotel?.dian_resolution) issues.push('Falta el número de resolución de facturación DIAN.');
  if (!hotel?.dian_prefix) issues.push('Falta el prefijo autorizado DIAN (ej. FE).');

  const isLiveConfigured =
    Boolean(hotel?.dian_api_url) &&
    hotel?.dian_environment === 'PRODUCCION' &&
    hotel?.dian_provider !== 'ADAPTADOR_ESTANDAR';

  return {
    ready_for_draft_ubl: Boolean(hotel?.tax_id && (hotel?.legal_name || hotel?.name)),
    ready_for_live_transmission: issues.length === 0 && isLiveConfigured,
    issues,
    environment: hotel?.dian_environment || 'HABILITACION',
    provider: hotel?.dian_provider || 'ADAPTADOR_ESTANDAR'
  };
};

const computeDeterministicCufePreview = ({
  invoiceNumber,
  issueDate,
  totalAmount,
  taxAmount,
  subtotal,
  supplierNit,
  customerDoc,
  environment
}) => {
  const raw = [
    invoiceNumber,
    issueDate,
    Number(subtotal || 0).toFixed(2),
    '01',
    Number(taxAmount || 0).toFixed(2),
    Number(totalAmount || 0).toFixed(2),
    supplierNit || '000000000',
    customerDoc || '222222222222',
    environment || 'HABILITACION'
  ].join('|');

  return crypto.createHash('sha384').update(raw).digest('hex');
};

const escapeXml = (str) =>
  String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const buildUbl21XmlPreview = ({
  hotel,
  invoiceNumber,
  docType,
  issueDate,
  customer,
  lines,
  subtotal,
  taxAmount,
  totalAmount,
  cufe
}) => {
  const rootTag = docType === 'NOTA_CREDITO' ? 'CreditNote' : 'Invoice';
  const customizationId = docType === 'NOTA_CREDITO' ? '20' : '10';
  const profileId =
    docType === 'NOTA_CREDITO'
      ? 'DIAN 2.1: Nota Crédito de Factura Electrónica de Venta'
      : 'DIAN 2.1: Factura Electrónica de Venta';

  const linesXml = (lines || [])
    .map(
      (line, idx) => `  <cac:InvoiceLine>
    <cbc:ID>${idx + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">${Number(line.quantity || 1)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${escapeXml(hotel?.currency || 'COP')}">${Number(
        line.subtotal || 0
      ).toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description>${escapeXml(line.description || 'Servicio Hotelero')}</cbc:Description>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${escapeXml(hotel?.currency || 'COP')}">${Number(
        line.unit_price || 0
      ).toFixed(2)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<${rootTag} xmlns="urn:oasis:names:specification:ubl:schema:xsd:${rootTag}-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>${customizationId}</cbc:CustomizationID>
  <cbc:ProfileID>${escapeXml(profileId)}</cbc:ProfileID>
  <cbc:ID>${escapeXml(invoiceNumber)}</cbc:ID>
  <cbc:UUID schemeName="CUFE-SHA384">${escapeXml(cufe)}</cbc:UUID>
  <cbc:IssueDate>${escapeXml(issueDate)}</cbc:IssueDate>
  <cbc:DocumentCurrencyCode>${escapeXml(hotel?.currency || 'COP')}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(hotel?.legal_name || hotel?.name)}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(hotel?.tax_id || 'SIN_NIT')}</cbc:CompanyID>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${escapeXml(customer?.name || 'Consumidor Final')}</cbc:Name></cac:PartyName>
      <cac:PartyTaxScheme>
        <cbc:CompanyID schemeName="${escapeXml(customer?.doc_type || 'CC')}">${escapeXml(
          customer?.doc || '222222222222'
        )}</cbc:CompanyID>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${escapeXml(hotel?.currency || 'COP')}">${Number(taxAmount || 0).toFixed(
      2
    )}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${escapeXml(hotel?.currency || 'COP')}">${Number(
      subtotal || 0
    ).toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxInclusiveAmount currencyID="${escapeXml(hotel?.currency || 'COP')}">${Number(
      totalAmount || 0
    ).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${escapeXml(hotel?.currency || 'COP')}">${Number(
      totalAmount || 0
    ).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${linesXml}
</${rootTag}>`;
};

const prepareElectronicDocumentPayload = ({
  hotel,
  invoiceNumber,
  docType,
  issueDate,
  customer,
  lines,
  subtotal,
  taxAmount,
  totalAmount
}) => {
  const configCheck = validateHotelDianConfig(hotel);
  const cufe = computeDeterministicCufePreview({
    invoiceNumber,
    issueDate,
    totalAmount,
    taxAmount,
    subtotal,
    supplierNit: hotel?.tax_id,
    customerDoc: customer?.doc,
    environment: configCheck.environment
  });

  const qrPayload = `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}`;
  const xmlUblPreview = buildUbl21XmlPreview({
    hotel,
    invoiceNumber,
    docType,
    issueDate,
    customer,
    lines,
    subtotal,
    taxAmount,
    totalAmount,
    cufe
  });

  return {
    cufe,
    qr_payload: qrPayload,
    xml_ubl_preview: xmlUblPreview,
    provider_name: configCheck.provider,
    provider_status: configCheck.ready_for_live_transmission
      ? 'LISTA_PARA_ENVIO'
      : 'BORRADOR_UBL_PREPARADO',
    adapter_meta: {
      simulated: false,
      note: configCheck.ready_for_live_transmission
        ? 'Documento UBL 2.1 listo para transmisión al proveedor tecnológico configurado.'
        : 'Documento UBL 2.1 preparado localmente. Configure NIT, Resolución DIAN y URL del proveedor tecnológico para transmisión oficial.',
      config_check: configCheck
    }
  };
};

module.exports = {
  SUPPORTED_PROVIDERS,
  validateHotelDianConfig,
  prepareElectronicDocumentPayload
};

