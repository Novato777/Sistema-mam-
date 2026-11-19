const db = require('../config/db');
const { getTodayString, formatDate } = require('../utils/date');
const {
  SUPPORTED_PROVIDERS,
  validateHotelDianConfig,
  prepareElectronicDocumentPayload
} = require('../services/dianAdapter');

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

const buildEntryNumber = (hotelId, entryId) =>
  `CC-H${hotelId}-${String(entryId).padStart(5, '0')}`;

const buildArApNumber = (hotelId, docType, id) =>
  `${docType}-H${hotelId}-${String(id).padStart(5, '0')}`;

const isBankMethod = (methodStr) => {
  const m = String(methodStr || '').toUpperCase();
  return (
    m.includes('TRANSF') ||
    m.includes('BANCO') ||
    m.includes('NEQUI') ||
    m.includes('DAVIPLATA') ||
    m.includes('TARJETA') ||
    m.includes('DATAFONO')
  );
};

// Verifica que el periodo contable YYYY-MM no esté cerrado
const ensurePeriodOpen = async (tx, hotelId, entryDate) => {
  const periodCode = formatDate(entryDate).substring(0, 7);
  const periodRow = await tx.get(
    'SELECT * FROM accounting_periods WHERE hotel_id = ? AND period_code = ?',
    [hotelId, periodCode]
  );
  if (periodRow && periodRow.status === 'CERRADO') {
    const err = new Error(
      `El periodo contable ${periodCode} se encuentra CERRADO. No se pueden registrar ni modificar asientos en fechas cerradas.`
    );
    err.statusCode = 400;
    throw err;
  }
  if (!periodRow) {
    const [yr, mo] = periodCode.split('-');
    await tx.run(
      `INSERT INTO accounting_periods (hotel_id, period_code, year, month, status)
       VALUES (?, ?, ?, ?, 'ABIERTO')`,
      [hotelId, periodCode, Number(yr), Number(mo)]
    );
  }
  return periodCode;
};

// Motor central de Asientos Contables con validación estricta de Partida Doble
const createJournalEntryInTransaction = async ({
  tx,
  hotelId,
  entryType = 'MANUAL',
  entryDate,
  description,
  reference = '',
  sourceModule = null,
  sourceId = null,
  lines,
  userId = 1
}) => {
  if (!Array.isArray(lines) || lines.length < 2) {
    const err = new Error('Todo asiento contable requiere al menos 2 líneas (Débito y Crédito).');
    err.statusCode = 400;
    throw err;
  }

  const cleanDate = formatDate(entryDate || getTodayString());
  const periodCode = await ensurePeriodOpen(tx, hotelId, cleanDate);
  const nowIso = new Date().toISOString();

  let totalDebit = 0;
  let totalCredit = 0;
  const resolvedLines = [];

  for (const raw of lines) {
    const debit = round2(raw.debit || 0);
    const credit = round2(raw.credit || 0);
    if (debit < 0 || credit < 0) {
      const err = new Error('Los valores de Débito y Crédito no pueden ser negativos.');
      err.statusCode = 400;
      throw err;
    }
    if (debit === 0 && credit === 0) continue;
    if (debit > 0 && credit > 0) {
      const err = new Error('Una misma línea no puede tener Débito y Crédito simultáneamente.');
      err.statusCode = 400;
      throw err;
    }

    let account = null;
    if (raw.account_id) {
      account = await tx.get(
        'SELECT * FROM accounting_accounts WHERE id = ? AND hotel_id = ?',
        [Number(raw.account_id), hotelId]
      );
    } else if (raw.account_code) {
      account = await tx.get(
        'SELECT * FROM accounting_accounts WHERE code = ? AND hotel_id = ?',
        [String(raw.account_code).trim(), hotelId]
      );
    }

    if (!account) {
      const err = new Error(
        `Cuenta contable ${raw.account_code || raw.account_id} no existe en el PUC de este hotel.`
      );
      err.statusCode = 404;
      throw err;
    }
    if (Number(account.active) !== 1) {
      const err = new Error(`La cuenta ${account.code} - ${account.name} está inactiva.`);
      err.statusCode = 400;
      throw err;
    }
    if (Number(account.is_detail) !== 1) {
      const err = new Error(
        `La cuenta ${account.code} (${account.name}) es agrupadora; solo las cuentas de detalle aceptan asientos.`
      );
      err.statusCode = 400;
      throw err;
    }

    totalDebit = round2(totalDebit + debit);
    totalCredit = round2(totalCredit + credit);

    resolvedLines.push({
      account_id: account.id,
      account_code: account.code,
      account_name: account.name,
      third_party_name: (raw.third_party_name || '').trim(),
      third_party_doc: (raw.third_party_doc || '').trim(),
      description: (raw.description || description || '').trim(),
      debit,
      credit
    });
  }

  if (resolvedLines.length < 2 || totalDebit <= 0) {
    const err = new Error('El asiento contable debe tener movimientos válidos mayores a cero.');
    err.statusCode = 400;
    throw err;
  }

  if (Math.abs(totalDebit - totalCredit) >= 0.01) {
    const err = new Error(
      `Descuadre de Partida Doble: Débitos ($${totalDebit}) ≠ Créditos ($${totalCredit}).`
    );
    err.statusCode = 400;
    throw err;
  }

  const ins = await tx.run(
    `INSERT INTO journal_entries (
      hotel_id, entry_type, entry_date, period_code, description, reference,
      source_module, source_id, total_debit, total_credit, status, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONTABILIZADO', ?, ?)`,
    [
      hotelId,
      entryType,
      cleanDate,
      periodCode,
      String(description || '').trim(),
      String(reference || '').trim(),
      sourceModule,
      sourceId,
      totalDebit,
      totalCredit,
      userId || 1,
      nowIso
    ]
  );

  const entryNumber = buildEntryNumber(hotelId, ins.id);
  await tx.run('UPDATE journal_entries SET entry_number = ? WHERE id = ?', [entryNumber, ins.id]);

  for (const line of resolvedLines) {
    await tx.run(
      `INSERT INTO journal_entry_lines (
        hotel_id, entry_id, account_id, account_code, account_name,
        third_party_name, third_party_doc, description, debit, credit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hotelId,
        ins.id,
        line.account_id,
        line.account_code,
        line.account_name,
        line.third_party_name,
        line.third_party_doc,
        line.description,
        line.debit,
        line.credit
      ]
    );
  }

  await tx.run(
    `INSERT INTO audit_logs (hotel_id, user_id, action, module, entity_id, details, date)
     VALUES (?, ?, 'ASIENTO_CONTABLE', 'CONTABILIDAD', ?, ?, ?)`,
    [
      hotelId,
      userId || 1,
      ins.id,
      `Comprobante ${entryNumber} [${entryType}]: ${description} ($${totalDebit})`,
      cleanDate
    ]
  );

  return { id: ins.id, entry_number: entryNumber, total_debit: totalDebit, total_credit: totalCredit };
};

// Helper para contabilizar automáticamente según una regla configurada por el hotel
const postByRuleInTransaction = async ({
  tx,
  hotelId,
  eventCode,
  amount,
  entryDate,
  description,
  reference = '',
  sourceModule,
  sourceId,
  thirdPartyName = '',
  thirdPartyDoc = '',
  invert = false,
  userId = 1
}) => {
  const numAmount = round2(amount);
  if (numAmount <= 0) return null;

  // Evitar duplicación idempotente si ya se contabilizó exactamente esa operación
  if (sourceModule && sourceId && !invert) {
    const existing = await tx.get(
      `SELECT id FROM journal_entries
       WHERE hotel_id = ? AND source_module = ? AND source_id = ? AND status = 'CONTABILIZADO'`,
      [hotelId, sourceModule, sourceId]
    );
    if (existing) return existing;
  }

  const rule = await tx.get(
    'SELECT * FROM accounting_rules WHERE hotel_id = ? AND event_code = ? AND active = 1',
    [hotelId, eventCode]
  );
  if (!rule) return null;

  const debitCode = invert ? rule.credit_account_code : rule.debit_account_code;
  const creditCode = invert ? rule.debit_account_code : rule.credit_account_code;

  return createJournalEntryInTransaction({
    tx,
    hotelId,
    entryType: invert ? 'AJUSTE' : 'AUTOMATICO',
    entryDate: entryDate || getTodayString(),
    description: description || rule.event_name,
    reference,
    sourceModule,
    sourceId,
    userId,
    lines: [
      {
        account_code: debitCode,
        third_party_name: thirdPartyName,
        third_party_doc: thirdPartyDoc,
        description,
        debit: numAmount,
        credit: 0
      },
      {
        account_code: creditCode,
        third_party_name: thirdPartyName,
        third_party_doc: thirdPartyDoc,
        description,
        debit: 0,
        credit: numAmount
      }
    ]
  });
};

// Función interna para calcular Estados Financieros (Balance de Comprobación, P&G y Balance General)
const computeFinancialStatementsData = async (hotelId, fromDate, toDate) => {
  const accounts = await db.query(
    'SELECT * FROM accounting_accounts WHERE hotel_id = ? AND active = 1 ORDER BY code ASC',
    [hotelId]
  );

  // Saldos iniciales anteriores a fromDate
  const openingRows = await db.query(
    `SELECT jel.account_id,
            COALESCE(SUM(jel.debit), 0) as sum_debit,
            COALESCE(SUM(jel.credit), 0) as sum_credit
     FROM journal_entry_lines jel
     JOIN journal_entries je ON jel.entry_id = je.id
     WHERE jel.hotel_id = ? AND je.status = 'CONTABILIZADO' AND je.entry_date < ?
     GROUP BY jel.account_id`,
    [hotelId, fromDate]
  );
  const openingMap = new Map(openingRows.map((r) => [r.account_id, r]));

  // Movimientos del periodo [fromDate, toDate]
  const periodRows = await db.query(
    `SELECT jel.account_id,
            COALESCE(SUM(jel.debit), 0) as sum_debit,
            COALESCE(SUM(jel.credit), 0) as sum_credit
     FROM journal_entry_lines jel
     JOIN journal_entries je ON jel.entry_id = je.id
     WHERE jel.hotel_id = ? AND je.status = 'CONTABILIZADO'
       AND je.entry_date >= ? AND je.entry_date <= ?
     GROUP BY jel.account_id`,
    [hotelId, fromDate, toDate]
  );
  const periodMap = new Map(periodRows.map((r) => [r.account_id, r]));

  const detailAccounts = accounts.filter((a) => Number(a.is_detail) === 1);
  const trialBalance = [];

  let tbOpenDebit = 0;
  let tbOpenCredit = 0;
  let tbPeriodDebit = 0;
  let tbPeriodCredit = 0;
  let tbCloseDebit = 0;
  let tbCloseCredit = 0;

  const incomeRows = [];
  const costRows = [];
  const expenseRows = [];
  const assetRows = [];
  const liabilityRows = [];
  const equityRows = [];

  let totalIncome = 0;
  let totalCosts = 0;
  let totalExpenses = 0;
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;

  // Acumulado histórico para Balance General (hasta toDate) vs P&G (del periodo)
  for (const acc of detailAccounts) {
    const op = openingMap.get(acc.id);
    const per = periodMap.get(acc.id);

    const opDeb = round2(op?.sum_debit || 0);
    const opCred = round2(op?.sum_credit || 0);
    const perDeb = round2(per?.sum_debit || 0);
    const perCred = round2(per?.sum_credit || 0);

    const cumDeb = round2(opDeb + perDeb);
    const cumCred = round2(opCred + perCred);

    const openNet = round2(opDeb - opCred);
    const closeNet = round2(cumDeb - cumCred);

    const openDebitBal = openNet > 0 ? openNet : 0;
    const openCreditBal = openNet < 0 ? Math.abs(openNet) : 0;
    const closeDebitBal = closeNet > 0 ? closeNet : 0;
    const closeCreditBal = closeNet < 0 ? Math.abs(closeNet) : 0;

    if (openDebitBal || openCreditBal || perDeb || perCred || closeDebitBal || closeCreditBal) {
      tbOpenDebit = round2(tbOpenDebit + openDebitBal);
      tbOpenCredit = round2(tbOpenCredit + openCreditBal);
      tbPeriodDebit = round2(tbPeriodDebit + perDeb);
      tbPeriodCredit = round2(tbPeriodCredit + perCred);
      tbCloseDebit = round2(tbCloseDebit + closeDebitBal);
      tbCloseCredit = round2(tbCloseCredit + closeCreditBal);

      trialBalance.push({
        account_id: acc.id,
        code: acc.code,
        name: acc.name,
        account_class: acc.account_class,
        nature: acc.nature,
        opening_debit: openDebitBal,
        opening_credit: openCreditBal,
        period_debit: perDeb,
        period_credit: perCred,
        closing_debit: closeDebitBal,
        closing_credit: closeCreditBal
      });
    }

    // Saldo natural acumulado (para Balance General) y saldo del periodo (para P&G)
    const naturalPeriodBal =
      acc.nature === 'CREDITO' ? round2(perCred - perDeb) : round2(perDeb - perCred);
    const naturalCumBal =
      acc.nature === 'CREDITO' ? round2(cumCred - cumDeb) : round2(cumDeb - cumCred);

    if (acc.account_class === 'INGRESOS' && naturalPeriodBal !== 0) {
      totalIncome = round2(totalIncome + naturalPeriodBal);
      incomeRows.push({ code: acc.code, name: acc.name, amount: naturalPeriodBal });
    } else if (acc.account_class === 'COSTOS' && naturalPeriodBal !== 0) {
      totalCosts = round2(totalCosts + naturalPeriodBal);
      costRows.push({ code: acc.code, name: acc.name, amount: naturalPeriodBal });
    } else if (acc.account_class === 'GASTOS' && naturalPeriodBal !== 0) {
      totalExpenses = round2(totalExpenses + naturalPeriodBal);
      expenseRows.push({ code: acc.code, name: acc.name, amount: naturalPeriodBal });
    } else if (acc.account_class === 'ACTIVO' && naturalCumBal !== 0) {
      totalAssets = round2(totalAssets + naturalCumBal);
      assetRows.push({ code: acc.code, name: acc.name, amount: naturalCumBal });
    } else if (acc.account_class === 'PASIVO' && naturalCumBal !== 0) {
      totalLiabilities = round2(totalLiabilities + naturalCumBal);
      liabilityRows.push({ code: acc.code, name: acc.name, amount: naturalCumBal });
    } else if (acc.account_class === 'PATRIMONIO' && naturalCumBal !== 0) {
      totalEquity = round2(totalEquity + naturalCumBal);
      equityRows.push({ code: acc.code, name: acc.name, amount: naturalCumBal });
    }
  }

  // Utilidad neta acumulada histórica (para cuadrar Balance General: Activo = Pasivo + Patrimonio + Resultado)
  let cumIncomeAll = 0;
  let cumCostsAll = 0;
  let cumExpensesAll = 0;
  for (const acc of detailAccounts) {
    const op = openingMap.get(acc.id);
    const per = periodMap.get(acc.id);
    const cumDeb = round2(Number(op?.sum_debit || 0) + Number(per?.sum_debit || 0));
    const cumCred = round2(Number(op?.sum_credit || 0) + Number(per?.sum_credit || 0));
    if (acc.account_class === 'INGRESOS') cumIncomeAll = round2(cumIncomeAll + (cumCred - cumDeb));
    if (acc.account_class === 'COSTOS') cumCostsAll = round2(cumCostsAll + (cumDeb - cumCred));
    if (acc.account_class === 'GASTOS') cumExpensesAll = round2(cumExpensesAll + (cumDeb - cumCred));
  }
  const cumulativeNetResult = round2(cumIncomeAll - cumCostsAll - cumExpensesAll);

  const grossProfit = round2(totalIncome - totalCosts);
  const netProfit = round2(grossProfit - totalExpenses);
  const totalEquityWithResult = round2(totalEquity + cumulativeNetResult);
  const liabilitiesPlusEquity = round2(totalLiabilities + totalEquityWithResult);

  return {
    period: { from_date: fromDate, to_date: toDate },
    trial_balance: {
      rows: trialBalance,
      totals: {
        opening_debit: tbOpenDebit,
        opening_credit: tbOpenCredit,
        period_debit: tbPeriodDebit,
        period_credit: tbPeriodCredit,
        closing_debit: tbCloseDebit,
        closing_credit: tbCloseCredit,
        is_balanced: Math.abs(tbCloseDebit - tbCloseCredit) < 0.01
      }
    },
    income_statement: {
      income: incomeRows,
      costs: costRows,
      expenses: expenseRows,
      total_income: totalIncome,
      total_costs: totalCosts,
      gross_profit: grossProfit,
      total_expenses: totalExpenses,
      net_profit: netProfit
    },
    balance_sheet: {
      assets: assetRows,
      liabilities: liabilityRows,
      equity: equityRows,
      cumulative_net_result: cumulativeNetResult,
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      total_equity: totalEquityWithResult,
      liabilities_plus_equity: liabilitiesPlusEquity,
      is_balanced: Math.abs(totalAssets - liabilitiesPlusEquity) < 0.01
    }
  };
};

// 1. Overview del Módulo Contable y Financiero
exports.getOverview = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const today = getTodayString();
    const currentPeriod = today.substring(0, 7);
    const monthStart = `${currentPeriod}-01`;

    const accounts = await db.query(
      'SELECT * FROM accounting_accounts WHERE hotel_id = ? ORDER BY code ASC',
      [hotelId]
    );
    const rules = await db.query(
      'SELECT * FROM accounting_rules WHERE hotel_id = ? ORDER BY id ASC',
      [hotelId]
    );
    const periods = await db.query(
      `SELECT ap.*, u.full_name as closed_by_name
       FROM accounting_periods ap
       LEFT JOIN users u ON ap.closed_by = u.id
       WHERE ap.hotel_id = ?
       ORDER BY ap.period_code DESC`,
      [hotelId]
    );

    const recentEntriesRaw = await db.query(
      `SELECT je.*, u.full_name as created_by_name
       FROM journal_entries je
       LEFT JOIN users u ON je.created_by = u.id
       WHERE je.hotel_id = ?
       ORDER BY je.entry_date DESC, je.id DESC
       LIMIT 40`,
      [hotelId]
    );

    let recentEntries = recentEntriesRaw;
    if (recentEntriesRaw.length > 0) {
      const ids = recentEntriesRaw.map((e) => e.id);
      const ph = ids.map(() => '?').join(',');
      const lines = await db.query(
        `SELECT * FROM journal_entry_lines WHERE hotel_id = ? AND entry_id IN (${ph}) ORDER BY id ASC`,
        [hotelId, ...ids]
      );
      const lineMap = new Map();
      for (const l of lines) {
        if (!lineMap.has(l.entry_id)) lineMap.set(l.entry_id, []);
        lineMap.get(l.entry_id).push({
          ...l,
          debit: Number(l.debit || 0),
          credit: Number(l.credit || 0)
        });
      }
      recentEntries = recentEntriesRaw.map((e) => ({
        ...e,
        total_debit: Number(e.total_debit || 0),
        total_credit: Number(e.total_credit || 0),
        lines: lineMap.get(e.id) || []
      }));
    }

    const statements = await computeFinancialStatementsData(hotelId, monthStart, today);

    const arApSummary = await db.query(
      `SELECT doc_type, COALESCE(SUM(balance), 0) as pending_balance, COUNT(*) as count
       FROM accounts_receivable_payable
       WHERE hotel_id = ? AND status IN ('PENDIENTE', 'PARCIAL')
       GROUP BY doc_type`,
      [hotelId]
    );
    const cxcPending = Number(arApSummary.find((r) => r.doc_type === 'CXC')?.pending_balance || 0);
    const cxpPending = Number(arApSummary.find((r) => r.doc_type === 'CXP')?.pending_balance || 0);

    const currentPeriodRow = periods.find((p) => p.period_code === currentPeriod);

    res.json({
      accounts,
      rules,
      periods,
      recent_entries: recentEntries,
      kpis: {
        current_period: currentPeriod,
        current_period_status: currentPeriodRow?.status || 'ABIERTO',
        total_assets: statements.balance_sheet.total_assets,
        total_liabilities: statements.balance_sheet.total_liabilities,
        total_equity: statements.balance_sheet.total_equity,
        month_income: statements.income_statement.total_income,
        month_costs_expenses: round2(
          statements.income_statement.total_costs + statements.income_statement.total_expenses
        ),
        month_net_profit: statements.income_statement.net_profit,
        cxc_pending: cxcPending,
        cxp_pending: cxpPending,
        entries_count: recentEntries.length
      }
    });
  } catch (error) {
    console.error('Error al cargar módulo contable:', error);
    res.status(500).json({ error: 'Error al cargar el módulo de contabilidad.' });
  }
};

// 2. Plan Único de Cuentas (PUC) CRUD
exports.listAccounts = async (req, res) => {
  try {
    const accounts = await db.query(
      'SELECT * FROM accounting_accounts WHERE hotel_id = ? ORDER BY code ASC',
      [req.hotelId]
    );
    res.json(accounts);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar el PUC.' });
  }
};

exports.createAccount = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { code, name, account_class, nature, level, parent_code, is_detail } = req.body;

    if (!code || !String(code).trim() || !name || !String(name).trim()) {
      return res.status(400).json({ error: 'Código y nombre de la cuenta son obligatorios.' });
    }
    const cleanCode = String(code).trim();
    const dup = await db.get(
      'SELECT id FROM accounting_accounts WHERE hotel_id = ? AND code = ?',
      [hotelId, cleanCode]
    );
    if (dup) {
      return res.status(400).json({ error: `Ya existe una cuenta con código ${cleanCode}.` });
    }

    const ins = await db.run(
      `INSERT INTO accounting_accounts (
        hotel_id, code, name, account_class, nature, level, parent_code, is_detail, active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        hotelId,
        cleanCode,
        String(name).trim(),
        (account_class || 'GASTOS').toUpperCase(),
        (nature || 'DEBITO').toUpperCase(),
        Number(level || 4),
        (parent_code || '').trim(),
        is_detail === false || is_detail === 0 ? 0 : 1
      ]
    );

    const created = await db.get('SELECT * FROM accounting_accounts WHERE id = ?', [ins.id]);
    res.status(201).json({ message: 'Cuenta creada en el PUC.', account: created });
  } catch (error) {
    console.error('Error al crear cuenta PUC:', error);
    res.status(500).json({ error: 'Error al crear la cuenta contable.' });
  }
};

exports.updateAccount = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const accountId = Number(req.params.accountId);
    const existing = await db.get(
      'SELECT * FROM accounting_accounts WHERE id = ? AND hotel_id = ?',
      [accountId, hotelId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Cuenta contable no encontrada.' });
    }

    const { name, nature, is_detail, active } = req.body;
    await db.run(
      `UPDATE accounting_accounts
       SET name = ?, nature = ?, is_detail = ?, active = ?
       WHERE id = ? AND hotel_id = ?`,
      [
        name !== undefined && String(name).trim() ? String(name).trim() : existing.name,
        nature ? String(nature).toUpperCase() : existing.nature,
        is_detail !== undefined ? (is_detail ? 1 : 0) : existing.is_detail,
        active !== undefined ? (active ? 1 : 0) : existing.active,
        accountId,
        hotelId
      ]
    );
    const updated = await db.get('SELECT * FROM accounting_accounts WHERE id = ?', [accountId]);
    res.json({ message: 'Cuenta PUC actualizada.', account: updated });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la cuenta contable.' });
  }
};

// 3. Reglas de Contabilización Automática
exports.listRules = async (req, res) => {
  try {
    const rules = await db.query(
      'SELECT * FROM accounting_rules WHERE hotel_id = ? ORDER BY id ASC',
      [req.hotelId]
    );
    res.json(rules);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar reglas contables.' });
  }
};

exports.updateRule = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const ruleId = Number(req.params.ruleId);
    const existing = await db.get(
      'SELECT * FROM accounting_rules WHERE id = ? AND hotel_id = ?',
      [ruleId, hotelId]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Regla contable no encontrada.' });
    }

    const { debit_account_code, credit_account_code, active, description } = req.body;
    const debCode = debit_account_code || existing.debit_account_code;
    const credCode = credit_account_code || existing.credit_account_code;

    const debAcc = await db.get(
      'SELECT id, is_detail FROM accounting_accounts WHERE hotel_id = ? AND code = ? AND active = 1',
      [hotelId, debCode]
    );
    const credAcc = await db.get(
      'SELECT id, is_detail FROM accounting_accounts WHERE hotel_id = ? AND code = ? AND active = 1',
      [hotelId, credCode]
    );
    if (!debAcc || Number(debAcc.is_detail) !== 1 || !credAcc || Number(credAcc.is_detail) !== 1) {
      return res.status(400).json({
        error: 'Las cuentas Débito y Crédito de la regla deben existir como cuentas de detalle activas en el PUC.'
      });
    }

    await db.run(
      `UPDATE accounting_rules
       SET debit_account_code = ?, credit_account_code = ?, active = ?, description = ?
       WHERE id = ? AND hotel_id = ?`,
      [
        debCode,
        credCode,
        active !== undefined ? (active ? 1 : 0) : existing.active,
        description !== undefined ? String(description).trim() : existing.description,
        ruleId,
        hotelId
      ]
    );

    const updated = await db.get('SELECT * FROM accounting_rules WHERE id = ?', [ruleId]);
    res.json({ message: 'Regla de contabilización actualizada.', rule: updated });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la regla contable.' });
  }
};

// 4. Comprobantes / Libro Diario (Crear Manual, Listar y Anular con reversión)
exports.listJournalEntries = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { from_date, to_date, entry_type, status } = req.query;

    let sql = `
      SELECT je.*, u.full_name as created_by_name
      FROM journal_entries je
      LEFT JOIN users u ON je.created_by = u.id
      WHERE je.hotel_id = ?
    `;
    const params = [hotelId];
    if (from_date) {
      sql += ' AND je.entry_date >= ?';
      params.push(formatDate(from_date));
    }
    if (to_date) {
      sql += ' AND je.entry_date <= ?';
      params.push(formatDate(to_date));
    }
    if (entry_type && entry_type !== 'ALL') {
      sql += ' AND je.entry_type = ?';
      params.push(entry_type);
    }
    if (status && status !== 'ALL') {
      sql += ' AND je.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY je.entry_date DESC, je.id DESC LIMIT 200';

    const entries = await db.query(sql, params);
    if (entries.length === 0) return res.json([]);

    const ids = entries.map((e) => e.id);
    const ph = ids.map(() => '?').join(',');
    const lines = await db.query(
      `SELECT * FROM journal_entry_lines WHERE hotel_id = ? AND entry_id IN (${ph}) ORDER BY id ASC`,
      [hotelId, ...ids]
    );
    const lineMap = new Map();
    for (const l of lines) {
      if (!lineMap.has(l.entry_id)) lineMap.set(l.entry_id, []);
      lineMap.get(l.entry_id).push({
        ...l,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0)
      });
    }

    res.json(
      entries.map((e) => ({
        ...e,
        total_debit: Number(e.total_debit || 0),
        total_credit: Number(e.total_credit || 0),
        lines: lineMap.get(e.id) || []
      }))
    );
  } catch (error) {
    console.error('Error al listar Libro Diario:', error);
    res.status(500).json({ error: 'Error al consultar el Libro Diario.' });
  }
};

exports.createJournalEntry = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { entry_date, entry_type, description, reference, lines } = req.body;
    if (!description || !String(description).trim()) {
      return res.status(400).json({ error: 'La descripción o concepto del comprobante es obligatoria.' });
    }

    const created = await db.withTransaction(async (tx) => {
      return createJournalEntryInTransaction({
        tx,
        hotelId,
        entryType: entry_type === 'AJUSTE' ? 'AJUSTE' : 'MANUAL',
        entryDate: entry_date || getTodayString(),
        description,
        reference,
        sourceModule: 'MANUAL',
        lines,
        userId: req.user?.id || 1
      });
    });

    res.status(201).json({
      message: `Comprobante ${created.entry_number} contabilizado correctamente.`,
      entry: created
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al crear asiento contable:', error);
    res.status(500).json({ error: 'Error interno al contabilizar el comprobante.' });
  }
};

exports.voidJournalEntry = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const entryId = Number(req.params.entryId);
    const { void_reason, reason } = req.body || {};
    const effectiveReason = String(void_reason || reason || '').trim();
    if (!effectiveReason) {
      return res.status(400).json({ error: 'Debe indicar el motivo de la anulación contable.' });
    }

    const original = await db.get(
      'SELECT * FROM journal_entries WHERE id = ? AND hotel_id = ?',
      [entryId, hotelId]
    );
    if (!original) {
      return res.status(404).json({ error: 'Comprobante contable no encontrado.' });
    }
    if (original.status === 'ANULADO') {
      return res.status(400).json({ error: 'Este comprobante ya fue anulado.' });
    }

    const origLines = await db.query(
      'SELECT * FROM journal_entry_lines WHERE entry_id = ? AND hotel_id = ?',
      [entryId, hotelId]
    );

    const today = getTodayString();
    const nowIso = new Date().toISOString();

    const reversal = await db.withTransaction(async (tx) => {
      await ensurePeriodOpen(tx, hotelId, original.entry_date);
      const revEntry = await createJournalEntryInTransaction({
        tx,
        hotelId,
        entryType: 'AJUSTE',
        entryDate: today,
        description: `[REVERSIÓN] Anulación ${original.entry_number}: ${effectiveReason}`,
        reference: original.entry_number,
        sourceModule: 'REVERSION_CONTABLE',
        sourceId: original.id,
        userId: req.user?.id || 1,
        lines: origLines.map((l) => ({
          account_id: l.account_id,
          account_code: l.account_code,
          third_party_name: l.third_party_name,
          third_party_doc: l.third_party_doc,
          description: `Reversión de ${original.entry_number}`,
          debit: Number(l.credit || 0),
          credit: Number(l.debit || 0)
        }))
      });

      await tx.run(
        `UPDATE journal_entries
         SET status = 'ANULADO', void_reason = ?, voided_by = ?, voided_at = ?
         WHERE id = ? AND hotel_id = ?`,
        [effectiveReason, req.user?.id || 1, nowIso, original.id, hotelId]
      );

      return revEntry;
    });

    res.json({
      message: `Comprobante ${original.entry_number} anulado con asiento inverso ${reversal.entry_number}.`,
      reversal
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al anular comprobante contable:', error);
    res.status(500).json({ error: 'Error al anular el comprobante contable.' });
  }
};

// 5. Sincronizar / Contabilizar Operaciones Históricas Pendientes del Hotel
exports.syncOperations = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    let postedCount = 0;

    await db.withTransaction(async (tx) => {
      // A. Cargos en folios (Hospedaje y Servicios)
      const charges = await tx.query(
        `SELECT ac.*, ga.stay_id, g.first_name, g.last_name, g.document
         FROM account_charges ac
         JOIN guest_accounts ga ON ac.account_id = ga.id
         JOIN stays s ON ga.stay_id = s.id
         LEFT JOIN guests g ON s.guest_id = g.id
         WHERE ac.hotel_id = ? AND ac.amount > 0`,
        [hotelId]
      );
      for (const ch of charges) {
        const isLodging = ['ALOJAMIENTO', 'HOSPEDAJE'].includes(String(ch.type || '').toUpperCase());
        const ev = isLodging ? 'HOSPEDAJE_CARGO' : 'POS_CARGO_FOLIO';
        const resEntry = await postByRuleInTransaction({
          tx,
          hotelId,
          eventCode: ev,
          amount: ch.amount,
          entryDate: ch.date,
          description: ch.description,
          reference: `CARGO-${ch.id}`,
          sourceModule: 'ACCOUNT_CHARGE',
          sourceId: ch.id,
          thirdPartyName: `${ch.first_name || ''} ${ch.last_name || ''}`.trim(),
          thirdPartyDoc: ch.document || '',
          userId: req.user?.id || 1
        });
        if (resEntry && resEntry.entry_number) postedCount++;
      }

      // B. Movimientos de Caja activos (Ingresos y Egresos)
      const cashMovs = await tx.query(
        `SELECT * FROM cash_movements
         WHERE hotel_id = ? AND COALESCE(voided, 0) = 0 AND movement_subtype != 'ANULACION_COMPENSATORIA'`,
        [hotelId]
      );
      for (const cm of cashMovs) {
        const bank = isBankMethod(cm.payment_method);
        let ev = null;
        if (cm.type === 'EGRESO') {
          if (String(cm.category || '').toUpperCase().includes('COMPRA')) continue;
          ev = 'GASTO_CAJA';
        } else if (cm.movement_subtype === 'ANTICIPO') {
          ev = 'ANTICIPO_RESERVA';
        } else if (cm.movement_subtype === 'PAGO_SERVICIO') {
          const catUp = String(cm.category || '').toUpperCase();
          ev =
            catUp.includes('RESTAURANTE') || catUp.includes('CAFETER')
              ? bank
                ? 'POS_RESTAURANTE_BANCO'
                : 'POS_RESTAURANTE_CAJA'
              : 'POS_SERVICIOS_CAJA';
        } else if (cm.payment_id || cm.stay_id || String(cm.category || '').toUpperCase().includes('HABIT')) {
          ev = bank ? 'HOSPEDAJE_PAGO_BANCO' : 'HOSPEDAJE_PAGO_EFECTIVO';
        } else {
          ev = 'CXC_ALTA';
        }

        const resEntry = await postByRuleInTransaction({
          tx,
          hotelId,
          eventCode: ev,
          amount: cm.amount,
          entryDate: cm.date,
          description: cm.description || cm.category,
          reference: cm.receipt_number || `CM-${cm.id}`,
          sourceModule: 'CASH_MOVEMENT',
          sourceId: cm.id,
          userId: req.user?.id || 1
        });
        if (resEntry && resEntry.entry_number) postedCount++;
      }

      // C. Compras de Inventario recibidas
      const purchases = await tx.query(
        `SELECT po.*, s.name as supplier_name, s.tax_id as supplier_doc
         FROM purchase_orders po
         LEFT JOIN suppliers s ON po.supplier_id = s.id
         WHERE po.hotel_id = ? AND po.status = 'RECIBIDA'`,
        [hotelId]
      );
      for (const po of purchases) {
        const ev = po.cash_movement_id ? 'COMPRA_INVENTARIO_CONTADO' : 'COMPRA_INVENTARIO_CREDITO';
        const resEntry = await postByRuleInTransaction({
          tx,
          hotelId,
          eventCode: ev,
          amount: po.total_amount,
          entryDate: po.purchase_date,
          description: `Compra Inventario ${po.order_number}${po.invoice_number ? ' Fact. ' + po.invoice_number : ''}`,
          reference: po.order_number,
          sourceModule: 'PURCHASE_ORDER',
          sourceId: po.id,
          thirdPartyName: po.supplier_name || 'Proveedor',
          thirdPartyDoc: po.supplier_doc || '',
          userId: req.user?.id || 1
        });
        if (resEntry && resEntry.entry_number) postedCount++;
      }
    });

    res.json({
      message:
        postedCount > 0
          ? `Sincronización contable completada: ${postedCount} nuevos asientos generados por partida doble.`
          : 'Todas las operaciones existentes ya se encontraban contabilizadas.',
      posted_count: postedCount
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al sincronizar operaciones contables:', error);
    res.status(500).json({ error: 'Error al sincronizar operaciones contables.' });
  }
};

// 6. Libro Mayor (General Ledger por Cuenta y Periodo)
exports.getGeneralLedger = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const today = getTodayString();
    const fromDate = req.query.from_date ? formatDate(req.query.from_date) : `${today.substring(0, 7)}-01`;
    const toDate = req.query.to_date ? formatDate(req.query.to_date) : today;
    const accountCode = req.query.account_code && req.query.account_code !== 'ALL' ? String(req.query.account_code) : null;

    let accSql =
      'SELECT * FROM accounting_accounts WHERE hotel_id = ? AND is_detail = 1 AND active = 1';
    const accParams = [hotelId];
    if (accountCode) {
      accSql += ' AND code = ?';
      accParams.push(accountCode);
    }
    accSql += ' ORDER BY code ASC';
    const targetAccounts = await db.query(accSql, accParams);

    const ledger = [];
    for (const acc of targetAccounts) {
      const openRow = await db.get(
        `SELECT COALESCE(SUM(jel.debit), 0) as deb, COALESCE(SUM(jel.credit), 0) as cred
         FROM journal_entry_lines jel
         JOIN journal_entries je ON jel.entry_id = je.id
         WHERE jel.hotel_id = ? AND jel.account_id = ? AND je.status = 'CONTABILIZADO' AND je.entry_date < ?`,
        [hotelId, acc.id, fromDate]
      );

      const lines = await db.query(
        `SELECT jel.*, je.entry_number, je.entry_date, je.entry_type, je.reference, je.description as entry_desc
         FROM journal_entry_lines jel
         JOIN journal_entries je ON jel.entry_id = je.id
         WHERE jel.hotel_id = ? AND jel.account_id = ? AND je.status = 'CONTABILIZADO'
           AND je.entry_date >= ? AND je.entry_date <= ?
         ORDER BY je.entry_date ASC, je.id ASC, jel.id ASC`,
        [hotelId, acc.id, fromDate, toDate]
      );

      const openDeb = round2(openRow?.deb || 0);
      const openCred = round2(openRow?.cred || 0);
      let runningBalance =
        acc.nature === 'CREDITO' ? round2(openCred - openDeb) : round2(openDeb - openCred);

      if (runningBalance === 0 && lines.length === 0 && !accountCode) continue;

      const openingBalance = runningBalance;
      let totalDebit = 0;
      let totalCredit = 0;

      const enrichedLines = lines.map((l) => {
        const d = round2(l.debit || 0);
        const c = round2(l.credit || 0);
        totalDebit = round2(totalDebit + d);
        totalCredit = round2(totalCredit + c);
        runningBalance =
          acc.nature === 'CREDITO'
            ? round2(runningBalance + c - d)
            : round2(runningBalance + d - c);
        return {
          ...l,
          debit: d,
          credit: c,
          running_balance: runningBalance
        };
      });

      ledger.push({
        account: acc,
        opening_balance: openingBalance,
        total_debit: totalDebit,
        total_credit: totalCredit,
        closing_balance: runningBalance,
        movements: enrichedLines
      });
    }

    res.json({ period: { from_date: fromDate, to_date: toDate }, ledger });
  } catch (error) {
    console.error('Error al consultar Libro Mayor:', error);
    res.status(500).json({ error: 'Error al generar el Libro Mayor.' });
  }
};

// 7. Estados Financieros (Balance de Comprobación, Estado de Resultados P&G y Balance General)
exports.getFinancialStatements = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const today = getTodayString();
    const fromDate = req.query.from_date ? formatDate(req.query.from_date) : `${today.substring(0, 7)}-01`;
    const toDate = req.query.to_date ? formatDate(req.query.to_date) : today;

    const data = await computeFinancialStatementsData(hotelId, fromDate, toDate);
    res.json(data);
  } catch (error) {
    console.error('Error al generar estados financieros:', error);
    res.status(500).json({ error: 'Error al generar los estados financieros.' });
  }
};

// 8. Cuentas por Cobrar (CXC Agencias/Corporativos) y Cuentas por Pagar (CXP Proveedores)
exports.listArAp = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { doc_type, status } = req.query;

    let sql = 'SELECT * FROM accounts_receivable_payable WHERE hotel_id = ?';
    const params = [hotelId];
    if (doc_type && doc_type !== 'ALL') {
      sql += ' AND doc_type = ?';
      params.push(doc_type);
    }
    if (status && status !== 'ALL') {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY id DESC';

    const rows = await db.query(sql, params);
    const payments = await db.query(
      `SELECT ap.*, u.full_name as user_name
       FROM ar_ap_payments ap
       LEFT JOIN users u ON ap.user_id = u.id
       WHERE ap.hotel_id = ?
       ORDER BY ap.id DESC`,
      [hotelId]
    );
    const payMap = new Map();
    for (const p of payments) {
      if (!payMap.has(p.ar_ap_id)) payMap.set(p.ar_ap_id, []);
      payMap.get(p.ar_ap_id).push({ ...p, amount: Number(p.amount || 0) });
    }

    res.json(
      rows.map((r) => ({
        ...r,
        total_amount: Number(r.total_amount || 0),
        paid_amount: Number(r.paid_amount || 0),
        balance: Number(r.balance || 0),
        payments: payMap.get(r.id) || []
      }))
    );
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar cuentas por cobrar y por pagar.' });
  }
};

exports.createArAp = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      doc_type,
      third_party_type,
      third_party_name,
      third_party_doc,
      guest_id,
      supplier_id,
      issue_date,
      due_date,
      total_amount,
      notes,
      post_accounting = true
    } = req.body;

    const dType = String(doc_type || 'CXC').toUpperCase();
    if (!['CXC', 'CXP'].includes(dType)) {
      return res.status(400).json({ error: 'Tipo inválido. Use CXC o CXP.' });
    }
    if (!third_party_name || !String(third_party_name).trim()) {
      return res.status(400).json({ error: 'El nombre del tercero (empresa/agencia/proveedor) es obligatorio.' });
    }
    const amt = round2(total_amount);
    if (amt <= 0) {
      return res.status(400).json({ error: 'El valor debe ser mayor a cero.' });
    }

    const iDate = issue_date ? formatDate(issue_date) : getTodayString();
    const nowIso = new Date().toISOString();

    const created = await db.withTransaction(async (tx) => {
      const ins = await tx.run(
        `INSERT INTO accounts_receivable_payable (
          hotel_id, doc_type, third_party_type, third_party_name, third_party_doc,
          guest_id, supplier_id, issue_date, due_date, total_amount, paid_amount, balance,
          status, notes, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'PENDIENTE', ?, ?, ?)`,
        [
          hotelId,
          dType,
          (third_party_type || (dType === 'CXC' ? 'AGENCIA' : 'PROVEEDOR')).toUpperCase(),
          String(third_party_name).trim(),
          (third_party_doc || '').trim(),
          guest_id ? Number(guest_id) : null,
          supplier_id ? Number(supplier_id) : null,
          iDate,
          due_date ? formatDate(due_date) : iDate,
          amt,
          amt,
          (notes || '').trim(),
          req.user?.id || 1,
          nowIso
        ]
      );

      const docNum = buildArApNumber(hotelId, dType, ins.id);
      let jEntryId = null;

      if (post_accounting) {
        const entry = await postByRuleInTransaction({
          tx,
          hotelId,
          eventCode: dType === 'CXC' ? 'CXC_ALTA' : 'CXP_ALTA',
          amount: amt,
          entryDate: iDate,
          description: `${docNum} - ${String(third_party_name).trim()}${notes ? ': ' + notes : ''}`,
          reference: docNum,
          sourceModule: 'AR_AP',
          sourceId: ins.id,
          thirdPartyName: String(third_party_name).trim(),
          thirdPartyDoc: (third_party_doc || '').trim(),
          userId: req.user?.id || 1
        });
        jEntryId = entry ? entry.id : null;
      }

      await tx.run(
        'UPDATE accounts_receivable_payable SET doc_number = ?, journal_entry_id = ? WHERE id = ?',
        [docNum, jEntryId, ins.id]
      );

      return tx.get('SELECT * FROM accounts_receivable_payable WHERE id = ?', [ins.id]);
    });

    res.status(201).json({
      message: `${created.doc_number} registrada correctamente.`,
      record: created
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al crear CXC/CXP:', error);
    res.status(500).json({ error: 'Error al registrar la cuenta por cobrar/pagar.' });
  }
};

exports.registerArApPayment = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const arApId = Number(req.params.id);
    const { amount, payment_method, payment_date, reference, register_id, register_in_cash = true, notes } =
      req.body;

    const amt = round2(amount);
    if (amt <= 0) {
      return res.status(400).json({ error: 'El valor del abono/pago debe ser mayor a cero.' });
    }

    const row = await db.get(
      'SELECT * FROM accounts_receivable_payable WHERE id = ? AND hotel_id = ?',
      [arApId, hotelId]
    );
    if (!row) {
      return res.status(404).json({ error: 'Cuenta por cobrar/pagar no encontrada.' });
    }
    if (row.status === 'PAGADA' || Number(row.balance) <= 0) {
      return res.status(400).json({ error: 'Esta cuenta ya se encuentra totalmente pagada.' });
    }
    if (amt > Number(row.balance) + 0.01) {
      return res.status(400).json({
        error: `El abono ($${amt}) supera el saldo pendiente ($${row.balance}).`
      });
    }

    const pDate = payment_date ? formatDate(payment_date) : getTodayString();
    const nowIso = new Date().toISOString();
    const method = payment_method || 'Efectivo';
    const bank = isBankMethod(method);

    const updated = await db.withTransaction(async (tx) => {
      let cashMovId = null;
      let usedRegId = register_id ? Number(register_id) : null;

      if (register_in_cash) {
        let reg = usedRegId
          ? await tx.get("SELECT * FROM cash_registers WHERE id = ? AND hotel_id = ? AND status = 'ABIERTA'", [
              usedRegId,
              hotelId
            ])
          : await tx.get("SELECT * FROM cash_registers WHERE hotel_id = ? AND status = 'ABIERTA' ORDER BY id DESC LIMIT 1", [
              hotelId
            ]);
        if (!reg) {
          const rIns = await tx.run(
            `INSERT INTO cash_registers (
              hotel_id, user_id, name, shift, operation_point, opening_time, opening_balance, status
            ) VALUES (?, ?, 'Caja Principal Recepción', 'MAÑANA', 'RECEPCION', ?, 0, 'ABIERTA')`,
            [hotelId, req.user?.id || 1, nowIso]
          );
          reg = await tx.get('SELECT * FROM cash_registers WHERE id = ?', [rIns.id]);
        }
        usedRegId = reg.id;

        const isIncome = row.doc_type === 'CXC';
        const movIns = await tx.run(
          `INSERT INTO cash_movements (
            hotel_id, register_id, type, movement_subtype, amount,
            category, payment_method, description, reference, date, user_id, voided, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          [
            hotelId,
            reg.id,
            isIncome ? 'INGRESO' : 'EGRESO',
            isIncome ? 'ABONO' : 'EGRESO',
            amt,
            isIncome ? 'Recaudo CXC Corporativa' : 'Pago CXP Proveedor',
            method,
            `${isIncome ? 'Recaudo' : 'Pago'} ${row.doc_number} - ${row.third_party_name}`,
            reference || row.doc_number,
            pDate,
            req.user?.id || 1,
            nowIso
          ]
        );
        cashMovId = movIns.id;
        const rc = `${isIncome ? 'RC' : 'CE'}-H${hotelId}-${String(movIns.id).padStart(5, '0')}`;
        await tx.run('UPDATE cash_movements SET receipt_number = ? WHERE id = ?', [rc, movIns.id]);
      }

      const cashAccCode = bank ? '111005' : '110505';
      const counterAccCode = row.doc_type === 'CXC' ? '130505' : '220505';
      const jEntry = await createJournalEntryInTransaction({
        tx,
        hotelId,
        entryType: 'AUTOMATICO',
        entryDate: pDate,
        description: `${row.doc_type === 'CXC' ? 'Recaudo' : 'Pago'} ${row.doc_number} (${row.third_party_name})`,
        reference: reference || row.doc_number,
        sourceModule: 'AR_AP_PAYMENT',
        sourceId: row.id,
        userId: req.user?.id || 1,
        lines:
          row.doc_type === 'CXC'
            ? [
                { account_code: cashAccCode, third_party_name: row.third_party_name, debit: amt, credit: 0 },
                { account_code: counterAccCode, third_party_name: row.third_party_name, debit: 0, credit: amt }
              ]
            : [
                { account_code: counterAccCode, third_party_name: row.third_party_name, debit: amt, credit: 0 },
                { account_code: cashAccCode, third_party_name: row.third_party_name, debit: 0, credit: amt }
              ]
      });

      await tx.run(
        `INSERT INTO ar_ap_payments (
          hotel_id, ar_ap_id, payment_date, amount, payment_method, reference,
          register_id, cash_movement_id, journal_entry_id, notes, user_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          hotelId,
          row.id,
          pDate,
          amt,
          method,
          reference || '',
          usedRegId,
          cashMovId,
          jEntry.id,
          (notes || '').trim(),
          req.user?.id || 1,
          nowIso
        ]
      );

      const newPaid = round2(Number(row.paid_amount || 0) + amt);
      const newBalance = Math.max(0, round2(Number(row.total_amount || 0) - newPaid));
      const newStatus = newBalance <= 0.01 ? 'PAGADA' : 'PARCIAL';

      await tx.run(
        `UPDATE accounts_receivable_payable
         SET paid_amount = ?, balance = ?, status = ?
         WHERE id = ? AND hotel_id = ?`,
        [newPaid, newBalance, newStatus, row.id, hotelId]
      );

      return tx.get('SELECT * FROM accounts_receivable_payable WHERE id = ?', [row.id]);
    });

    res.json({ message: `Abono registrado en ${updated.doc_number}.`, record: updated });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    console.error('Error al registrar pago CXC/CXP:', error);
    res.status(500).json({ error: 'Error al registrar el pago en CXC/CXP.' });
  }
};

// 9. Conciliación de Cajas y Bancos
exports.listReconciliations = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const rows = await db.query(
      `SELECT br.*, u.full_name as reconciled_by_name
       FROM bank_reconciliations br
       LEFT JOIN users u ON br.reconciled_by = u.id
       WHERE br.hotel_id = ?
       ORDER BY br.id DESC`,
      [hotelId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar conciliaciones.' });
  }
};

exports.createReconciliation = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { account_code = '110505', period_from, period_to, statement_balance, notes } = req.body;

    const acc = await db.get(
      'SELECT * FROM accounting_accounts WHERE hotel_id = ? AND code = ?',
      [hotelId, account_code]
    );
    if (!acc) {
      return res.status(404).json({ error: 'Cuenta de caja/banco no encontrada en el PUC.' });
    }

    const pFrom = period_from ? formatDate(period_from) : `${getTodayString().substring(0, 7)}-01`;
    const pTo = period_to ? formatDate(period_to) : getTodayString();
    const stmtBal = round2(statement_balance || 0);

    const bookRow = await db.get(
      `SELECT COALESCE(SUM(jel.debit), 0) as deb, COALESCE(SUM(jel.credit), 0) as cred
       FROM journal_entry_lines jel
       JOIN journal_entries je ON jel.entry_id = je.id
       WHERE jel.hotel_id = ? AND jel.account_id = ? AND je.status = 'CONTABILIZADO' AND je.entry_date <= ?`,
      [hotelId, acc.id, pTo]
    );
    const bookBalance = round2(Number(bookRow?.deb || 0) - Number(bookRow?.cred || 0));
    const difference = round2(stmtBal - bookBalance);
    const status = Math.abs(difference) < 0.01 ? 'CONCILIADA' : 'CON_DIFERENCIA';
    const nowIso = new Date().toISOString();

    const ins = await db.run(
      `INSERT INTO bank_reconciliations (
        hotel_id, account_code, account_name, period_from, period_to,
        statement_balance, book_balance, difference, status, notes, reconciled_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hotelId,
        acc.code,
        acc.name,
        pFrom,
        pTo,
        stmtBal,
        bookBalance,
        difference,
        status,
        (notes || '').trim(),
        req.user?.id || 1,
        nowIso
      ]
    );

    const created = await db.get('SELECT * FROM bank_reconciliations WHERE id = ?', [ins.id]);
    res.status(201).json({
      message:
        status === 'CONCILIADA'
          ? `Conciliación cuadrada (${acc.code} - ${acc.name}).`
          : `Conciliación registrada con diferencia de $${difference}.`,
      reconciliation: created
    });
  } catch (error) {
    console.error('Error al crear conciliación:', error);
    res.status(500).json({ error: 'Error al registrar la conciliación.' });
  }
};

// 10. Cierre y Reapertura de Periodo Contable (Separación estricta del Cierre de Turno de Caja)
exports.closePeriod = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { period_code, closing_notes } = req.body;
    if (!period_code || !/^\d{4}-\d{2}$/.test(period_code)) {
      return res.status(400).json({ error: 'Debe indicar un periodo válido en formato YYYY-MM.' });
    }

    const [yr, mo] = period_code.split('-');
    const nowIso = new Date().toISOString();

    // Verificar que todos los asientos del periodo estén cuadrados
    const imbalanced = await db.get(
      `SELECT COUNT(*) as c FROM journal_entries
       WHERE hotel_id = ? AND period_code = ? AND status = 'CONTABILIZADO'
         AND ABS(total_debit - total_credit) >= 0.01`,
      [hotelId, period_code]
    );
    if (imbalanced && Number(imbalanced.c) > 0) {
      return res.status(400).json({
        error: 'Existen comprobantes descuadrados en el periodo; corrija antes de cerrar.'
      });
    }

    await db.withTransaction(async (tx) => {
      const existing = await tx.get(
        'SELECT * FROM accounting_periods WHERE hotel_id = ? AND period_code = ?',
        [hotelId, period_code]
      );
      if (existing && existing.status === 'CERRADO') {
        const err = new Error(`El periodo contable ${period_code} ya se encuentra cerrado.`);
        err.statusCode = 400;
        throw err;
      }

      if (existing) {
        await tx.run(
          `UPDATE accounting_periods
           SET status = 'CERRADO', closed_by = ?, closed_at = ?, closing_notes = ?
           WHERE id = ? AND hotel_id = ?`,
          [req.user?.id || 1, nowIso, (closing_notes || '').trim(), existing.id, hotelId]
        );
      } else {
        await tx.run(
          `INSERT INTO accounting_periods (
            hotel_id, period_code, year, month, status, closed_by, closed_at, closing_notes
          ) VALUES (?, ?, ?, ?, 'CERRADO', ?, ?, ?)`,
          [hotelId, period_code, Number(yr), Number(mo), req.user?.id || 1, nowIso, (closing_notes || '').trim()]
        );
      }

      await tx.run(
        `INSERT INTO audit_logs (hotel_id, user_id, action, module, details, date)
         VALUES (?, ?, 'CIERRE_PERIODO_CONTABLE', 'CONTABILIDAD', ?, ?)`,
        [
          hotelId,
          req.user?.id || 1,
          `Cierre formal del periodo contable ${period_code}. ${closing_notes || ''}`,
          getTodayString()
        ]
      );
    });

    res.json({ message: `Periodo contable ${period_code} cerrado correctamente.` });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    res.status(500).json({ error: 'Error al cerrar el periodo contable.' });
  }
};

exports.reopenPeriod = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { period_code } = req.body;
    await db.run(
      `UPDATE accounting_periods SET status = 'ABIERTO' WHERE hotel_id = ? AND period_code = ?`,
      [hotelId, period_code]
    );
    await db.run(
      `INSERT INTO audit_logs (hotel_id, user_id, action, module, details, date)
       VALUES (?, ?, 'REAPERTURA_PERIODO_CONTABLE', 'CONTABILIDAD', ?, ?)`,
      [hotelId, req.user?.id || 1, `Reapertura autorizada del periodo ${period_code}`, getTodayString()]
    );
    res.json({ message: `Periodo contable ${period_code} reabierto.` });
  } catch (error) {
    res.status(500).json({ error: 'Error al reabrir el periodo contable.' });
  }
};

// 11. Adaptador de Facturación Electrónica DIAN
exports.getDianAdapterOverview = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const hotel = await db.get('SELECT * FROM hotels WHERE id = ?', [hotelId]);
    const invoices = await db.query(
      'SELECT * FROM electronic_invoices WHERE hotel_id = ? ORDER BY id DESC LIMIT 50',
      [hotelId]
    );
    res.json({
      supported_providers: SUPPORTED_PROVIDERS,
      config_status: validateHotelDianConfig(hotel),
      dian_config: {
        dian_environment: hotel?.dian_environment || 'HABILITACION',
        dian_provider: hotel?.dian_provider || 'ADAPTADOR_ESTANDAR',
        dian_resolution: hotel?.dian_resolution || '',
        dian_prefix: hotel?.dian_prefix || 'FE',
        dian_api_url: hotel?.dian_api_url || ''
      },
      invoices
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar el adaptador DIAN.' });
  }
};

exports.saveDianConfig = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const { dian_environment, dian_provider, dian_resolution, dian_prefix, dian_api_url } = req.body;
    await db.run(
      `UPDATE hotels
       SET dian_environment = ?, dian_provider = ?, dian_resolution = ?, dian_prefix = ?, dian_api_url = ?
       WHERE id = ?`,
      [
        dian_environment || 'HABILITACION',
        dian_provider || 'ADAPTADOR_ESTANDAR',
        (dian_resolution || '').trim(),
        (dian_prefix || 'FE').trim(),
        (dian_api_url || '').trim(),
        hotelId
      ]
    );
    const hotel = await db.get('SELECT * FROM hotels WHERE id = ?', [hotelId]);
    res.json({
      message: 'Configuración de adaptador DIAN actualizada.',
      config_status: validateHotelDianConfig(hotel)
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar configuración DIAN.' });
  }
};

exports.prepareElectronicInvoice = async (req, res) => {
  try {
    const hotelId = req.hotelId;
    const {
      doc_type = 'FACTURA_VENTA',
      customer_name,
      customer_doc_type = 'CC',
      customer_doc,
      customer_email,
      stay_id,
      service_order_id,
      subtotal,
      tax_amount = 0,
      lines
    } = req.body;

    if (!customer_name || !String(customer_name).trim()) {
      return res.status(400).json({ error: 'El nombre o razón social del adquirente es obligatorio.' });
    }

    const hotel = await db.get('SELECT * FROM hotels WHERE id = ?', [hotelId]);
    const prefix = hotel?.dian_prefix || 'FE';
    const issueDate = getTodayString();
    const nowIso = new Date().toISOString();

    const numSub = round2(subtotal || 0);
    const numTax = round2(tax_amount || 0);
    const numTotal = round2(numSub + numTax);
    if (numTotal <= 0) {
      return res.status(400).json({ error: 'El total de la factura electrónica debe ser mayor a cero.' });
    }

    const countRow = await db.get(
      'SELECT COUNT(*) as c FROM electronic_invoices WHERE hotel_id = ?',
      [hotelId]
    );
    const nextSeq = Number(countRow?.c || 0) + 1;
    const invoiceNumber = `${prefix}-${String(nextSeq).padStart(6, '0')}`;

    const docLines =
      Array.isArray(lines) && lines.length > 0
        ? lines
        : [{ description: 'Servicios Hoteleros / Hospedaje', quantity: 1, unit_price: numSub, subtotal: numSub }];

    const prepared = prepareElectronicDocumentPayload({
      hotel,
      invoiceNumber,
      docType: doc_type,
      issueDate,
      customer: { name: customer_name, doc_type: customer_doc_type, doc: customer_doc },
      lines: docLines,
      subtotal: numSub,
      taxAmount: numTax,
      totalAmount: numTotal
    });

    const ins = await db.run(
      `INSERT INTO electronic_invoices (
        hotel_id, invoice_number, prefix, doc_type, customer_name, customer_doc_type,
        customer_doc, customer_email, stay_id, service_order_id, issue_date,
        subtotal, tax_amount, total_amount, cufe, qr_payload, xml_ubl_preview,
        provider_name, provider_status, provider_response_json, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        hotelId,
        invoiceNumber,
        prefix,
        doc_type,
        String(customer_name).trim(),
        customer_doc_type,
        (customer_doc || '').trim(),
        (customer_email || '').trim(),
        stay_id ? Number(stay_id) : null,
        service_order_id ? Number(service_order_id) : null,
        issueDate,
        numSub,
        numTax,
        numTotal,
        prepared.cufe,
        prepared.qr_payload,
        prepared.xml_ubl_preview,
        prepared.provider_name,
        prepared.provider_status,
        JSON.stringify(prepared.adapter_meta),
        req.user?.id || 1,
        nowIso
      ]
    );

    const created = await db.get('SELECT * FROM electronic_invoices WHERE id = ?', [ins.id]);
    res.status(201).json({
      message: `Documento electrónico UBL 2.1 ${invoiceNumber} preparado (${prepared.provider_status}).`,
      invoice: created
    });
  } catch (error) {
    console.error('Error al preparar factura electrónica DIAN:', error);
    res.status(500).json({ error: 'Error al generar el documento electrónico DIAN.' });
  }
};

exports.createJournalEntryInTransaction = createJournalEntryInTransaction;
exports.postByRuleInTransaction = postByRuleInTransaction;
exports.isBankMethod = isBankMethod;

