import prisma from "../../config/prisma.js";
import { v4 as uuidv4 } from 'uuid';

const BATCH_SIZE = 200;

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Strip spaces, dashes, leading zeros for fuzzy app_no comparison */
const normalizeAppNo = (val) => {
  if (!val) return '';
  return String(val).replace(/[\s\-\/\.]/g, '').replace(/^0+/, '').toUpperCase();
};

/** Simple Levenshtein distance */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

/** Similarity score 0–1 */
function similarity(a, b) {
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// ─── POST /api/validate ───────────────────────────────────────────────────────
export const startValidation = async (req, res, next) => {
  try {
    const { month, sheet_name, bank } = req.body;
    if (!month) return res.status(400).json({ message: 'month is required.' });

    const userId = req.user.userId;
    const isSuperAdmin = req.user?.role === 'Super Admin' || req.user?.role === 'Admin';
    const { targetUserId } = req.body;
    
    const normalizedMonth = String(month).trim().toUpperCase();
    const whereClause = { month: normalizedMonth };
    if (sheet_name) whereClause.sheet_name = sheet_name;
    if (bank) whereClause.bank = bank;

    // DSA data is scoped to the logged-in user (unless Super Admin selects a target)
    const dsaWhereClause = { ...whereClause };
    if (!isSuperAdmin) {
      dsaWhereClause.user_id = userId;
    } else if (targetUserId && targetUserId !== 'ALL') {
      dsaWhereClause.user_id = targetUserId;
    }

    // Count rows for this month (and optional sheet)
    const [totalAdmin, totalDsa] = await Promise.all([
      prisma.admin_data.count({ where: whereClause }),
      prisma.dsa_data.count({ where: dsaWhereClause }),
    ]);

    if (totalAdmin === 0) return res.status(400).json({ message: `No admin data found matching criteria.` });
    if (totalDsa === 0) return res.status(400).json({ message: `No DSA data found matching criteria.` });

    // Create validation run record
    const validationRun = await prisma.validation_runs.create({
      data: {
        id: uuidv4(),
        user_id: (isSuperAdmin && targetUserId && targetUserId !== 'ALL') ? targetUserId : userId,
        month: normalizedMonth,
        status: 'RUNNING',
        total_admin: totalAdmin,
        total_dsa: totalDsa,
      },
    });

    // Respond immediately — validation runs in background
    res.status(202).json({
      message: 'Validation started.',
      runId: validationRun.id,
      month: normalizedMonth,
      totalAdmin,
      totalDsa,
    });

    // Run validation asynchronously (do NOT await here)
    runValidationBatched(validationRun.id, normalizedMonth, sheet_name, bank, totalDsa, userId, isSuperAdmin).catch(async (err) => {
      console.error('Validation error:', err);
      await prisma.validation_runs.update({
        where: { id: validationRun.id },
        data: { status: 'FAILED', completed_at: new Date() },
      });
    });

  } catch (err) {
    next(err);
  }
};

// ─── Background Validation Logic (Enhanced 5-tier matching) ─────────────────
async function runValidationBatched(runId, month, sheet_name, bank, totalDsa, userId, isSuperAdmin) {
  let offset = 0;
  let matchedAppNo = 0;
  let matchedName = 0;
  let unmatched = 0;

  const whereClause = { month };
  if (sheet_name) whereClause.sheet_name = sheet_name;
  if (bank) whereClause.bank = bank;

  // DSA where clause is scoped to user
  const dsaWhereClause = { ...whereClause };
  if (!isSuperAdmin) {
    dsaWhereClause.user_id = userId;
  } else {
    // For Super Admin, we need to know if it was a targetted run or global
    const run = await prisma.validation_runs.findUnique({ where: { id: runId } });
    if (run && run.user_id !== userId) {
        dsaWhereClause.user_id = run.user_id;
    }
  }

  // Pre-fetch ALL admin rows for this month (needed for fallback matching)
  const allAdminRows = await prisma.admin_data.findMany({
    where: whereClause,
    select: {
      id: true, app_no: true, customer_name: true,
      bank: true, loan_amt: true, net_amt: true, sheet_name: true,
    },
  });

  // Build lookup maps
  const adminByAppNo = {};
  const adminByNormAppNo = {};
  const adminByName = {};
  allAdminRows.forEach(a => {
    if (a.app_no) adminByAppNo[a.app_no] = a;
    const normAppNo = normalizeAppNo(a.app_no);
    if (normAppNo) adminByNormAppNo[normAppNo] = a;
    if (a.customer_name) adminByName[a.customer_name.toUpperCase().trim()] = a;
  });

  // Track matched admin IDs so we can flag unmatched admin rows at the end
  const matchedAdminIds = new Set();

  // Update progress helper
  const updateProgress = async () => {
    await prisma.validation_runs.update({
      where: { id: runId },
      data: {
        matched_app_no: matchedAppNo,
        matched_name: matchedName,
        unmatched,
        processed: matchedAppNo + matchedName + unmatched,
      },
    });
  };

  while (offset < totalDsa) {
    // Fetch batch of DSA rows (scoped to user)
    const dsaBatch = await prisma.dsa_data.findMany({
      where: dsaWhereClause,
      skip: offset,
      take: BATCH_SIZE,
      select: {
        id: true, app_no: true, customer_name: true, month: true, sheet_name: true,
        bank: true, gross_amt: true, net_amt: true,
      },
    });

    if (!dsaBatch.length) break;

    const validatedRows = [];
    const unmatchedRows = [];

    for (const dsa of dsaBatch) {
      let adminMatch = null;
      let matchType = null;

      // ── Tier 1: Exact APP_NO match ────────────────────────────────────
      if (dsa.app_no && adminByAppNo[dsa.app_no]) {
        adminMatch = adminByAppNo[dsa.app_no];
        matchType = 'APP_NO';
      }

      // ── Tier 2: Normalized APP_NO match ───────────────────────────────
      if (!adminMatch) {
        const normDsaAppNo = normalizeAppNo(dsa.app_no);
        if (normDsaAppNo && adminByNormAppNo[normDsaAppNo]) {
          adminMatch = adminByNormAppNo[normDsaAppNo];
          matchType = 'NORMALIZED_APP_NO';
        }
      }

      // ── Tier 3: Exact CUSTOMER_NAME match ─────────────────────────────
      if (!adminMatch) {
        const normalizedName = dsa.customer_name?.toUpperCase().trim();
        if (normalizedName && adminByName[normalizedName]) {
          adminMatch = adminByName[normalizedName];
          matchType = 'CUSTOMER_NAME';
        }
      }

      // ── Tier 4: Fuzzy name match (≥85% similarity) ───────────────────
      if (!adminMatch && dsa.customer_name) {
        const dsaNameUpper = dsa.customer_name.toUpperCase().trim();
        let bestScore = 0;
        let bestAdmin = null;
        for (const a of allAdminRows) {
          if (!a.customer_name) continue;
          const score = similarity(dsaNameUpper, a.customer_name.toUpperCase().trim());
          if (score > bestScore && score >= 0.85) {
            bestScore = score;
            bestAdmin = a;
          }
        }
        if (bestAdmin) {
          adminMatch = bestAdmin;
          matchType = 'FUZZY_NAME';
        }
      }

      // ── Tier 5: Bank + Amount combo ───────────────────────────────────
      if (!adminMatch && dsa.bank) {
        const dsaBank = dsa.bank.toUpperCase().trim();
        const dsaAmt = parseFloat(dsa.gross_amt || dsa.net_amt || 0);
        if (dsaAmt > 0) {
          for (const a of allAdminRows) {
            if (!a.bank) continue;
            const adminBank = a.bank.toUpperCase().trim();
            const adminAmt = parseFloat(a.loan_amt || a.net_amt || 0);
            if (adminBank === dsaBank && adminAmt > 0) {
              const diff = Math.abs(dsaAmt - adminAmt) / Math.max(dsaAmt, adminAmt);
              if (diff <= 0.01) { // within 1%
                adminMatch = a;
                matchType = 'BANK_AMOUNT';
                break;
              }
            }
          }
        }
      }

      // ── Record result ─────────────────────────────────────────────────
      if (adminMatch) {
        validatedRows.push({
          // id: uuidv4(),
          // admin_data_id: adminMatch.id,
          // dsa_data_id: dsa.id,
          // app_no: dsa.app_no,
          // customer_name: dsa.customer_name,
          // match_type: matchType,
          // month,
          // sheet_name: dsa.sheet_name || adminMatch.sheet_name,
          // validation_run_id: runId,
          id: uuidv4(),
          admin_data_id: adminMatch.id,
          dsa_data_id: dsa.id,
          app_no: adminMatch.app_no,
          customer_name: adminMatch.customer_name,
          match_type: matchType,
          month,
          sheet_name: dsa.sheet_name || adminMatch.sheet_name,
          validation_run_id: runId,
        });
        matchedAdminIds.add(adminMatch.id);
        if (matchType === 'APP_NO' || matchType === 'NORMALIZED_APP_NO') {
          matchedAppNo++;
        } else {
          matchedName++;
        }
      } else {
        unmatchedRows.push({
          id: uuidv4(),
          source: 'DSA',
          source_row_id: dsa.id,
          app_no: dsa.app_no,
          customer_name: dsa.customer_name,
          month,
          sheet_name: dsa.sheet_name,
          reason: 'No match on APP_NO, Name, Fuzzy Name, or Bank+Amount',
          validation_run_id: runId,
        });
        unmatched++;
      }
    }

    // Bulk insert validated rows
    if (validatedRows.length > 0) {
      await prisma.validated_data.createMany({ data: validatedRows });
    }

    // Bulk insert unmatched rows
    if (unmatchedRows.length > 0) {
      await prisma.unmatched_data.createMany({ data: unmatchedRows });
    }

    // Update progress every batch
    await updateProgress();
    offset += BATCH_SIZE;

    // Small breathing room for DB
    await new Promise(res => setTimeout(res, 30));
  }

  // ── Flag unmatched Admin rows ───────────────────────────────────────────────
  const unmatchedAdminRows = allAdminRows
    .filter(a => !matchedAdminIds.has(a.id))
    .map(a => ({
      id: uuidv4(),
      source: 'ADMIN',
      source_row_id: a.id,
      app_no: a.app_no,
      customer_name: a.customer_name,
      month,
      sheet_name: a.sheet_name,
      reason: 'Unmatched in Admin data (no corresponding DSA row validated)',
      validation_run_id: runId,
    }));

  if (unmatchedAdminRows.length > 0) {
    // Insert in chunks
    const CHUNK = 500;
    for (let i = 0; i < unmatchedAdminRows.length; i += CHUNK) {
      await prisma.unmatched_data.createMany({
        data: unmatchedAdminRows.slice(i, i + CHUNK),
      });
    }
    unmatched += unmatchedAdminRows.length;
  }

  // Mark completed
  await prisma.validation_runs.update({
    where: { id: runId },
    data: {
      status: 'DONE',
      matched_app_no: matchedAppNo,
      matched_name: matchedName,
      unmatched,
      processed: matchedAppNo + matchedName + unmatched,
      completed_at: new Date(),
    },
  });
}

// ─── GET /api/validate/:runId/status ─────────────────────────────────────────
export const getValidationStatus = async (req, res, next) => {
  try {
    const { runId } = req.params;

    const run = await prisma.validation_runs.findUnique({ where: { id: runId } });
    if (!run) return res.status(404).json({ message: 'Validation run not found.' });

    const progress = run.total_dsa > 0
      ? Math.round(((run.processed || 0) / run.total_dsa) * 100)
      : 0;

    res.json({
      runId: run.id,
      month: run.month,
      status: run.status,
      totalAdmin: run.total_admin,
      totalDsa: run.total_dsa,
      processed: run.processed || 0,
      matchedAppNo: run.matched_app_no,
      matchedName: run.matched_name,
      unmatched: run.unmatched,
      progress,
      startedAt: run.started_at,
      completedAt: run.completed_at,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/validate/history ────────────────────────────────────────────────
export const getValidationHistory = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user?.role === 'Super Admin' || req.user?.role === 'Admin';
    const { userId } = req.query;
    let where = {};
    if (!isSuperAdmin) {
      where.user_id = req.user.userId;
    } else if (userId && userId !== 'ALL') {
      where.user_id = userId;
    }

    const runs = await prisma.validation_runs.findMany({
      where,
      include: {
        user: {
          select: { name: true }
        }
      },
      orderBy: { started_at: 'desc' },
      take: 20,
    });
    res.json({ runs });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/validate/:runId/matched ─────────────────────────────────────────
export const getMatchedData = async (req, res, next) => {
  try {
    const { runId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      prisma.validated_data.findMany({
        where: { validation_run_id: runId },
        include: {
          admin_data: true,
          dsa_data: true,
        },
        skip,
        take: limit,
        orderBy: { validated_at: 'desc' },
      }),
      prisma.validated_data.count({ where: { validation_run_id: runId } }),
    ]);

    res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/validate/:runId/unmatched ───────────────────────────────────────
export const getUnmatchedData = async (req, res, next) => {
  try {
    const { runId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const source = req.query.source; // optional: 'DSA' or 'ADMIN'

    const where = { validation_run_id: runId };
    if (source) where.source = source.toUpperCase();

    const [data, total] = await Promise.all([
      prisma.unmatched_data.findMany({
        where,
        skip,
        take: limit,
        orderBy: { flagged_at: 'desc' },
      }),
      prisma.unmatched_data.count({ where }),
    ]);

    res.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/validate/record/:source/:id ───────────────────────────────────
export const getRecordDetails = async (req, res, next) => {
  try {
    const { source, id } = req.params;
    let record = null;

    if (source.toUpperCase() === 'ADMIN') {
      record = await prisma.admin_data.findUnique({ where: { id } });
    } else if (source.toUpperCase() === 'DSA') {
      record = await prisma.dsa_data.findUnique({ 
        where: { id },
        include: { user: { select: { name: true } } }
      });
    }

    if (!record) return res.status(404).json({ message: 'Record not found.' });
    res.json(record);
  } catch (err) {
    next(err);
  }
};

// ─── PATCH /api/validate/record/:source/:id ─────────────────────────────────
const ADMIN_FIELDS = [
  'sr_no', 'customer_name', 'app_no', 'loan_amt', 'net_amt', 'bank', 'claim', 'product',
  'location', 'month', 'exe', 'exe_head', 'partner', 'business_hub', 'status',
  'sp_percent', 'sp_gross', 'bank_po', 'payment', 'dis_date', 'roi', 'tenure',
  'gst_on_po', 'deduction_06', 'gvt_extra', 'booster', 'sheet_name'
];

const DSA_FIELDS = [
  'sr_no', 'customer_name', 'app_no', 'gross_amt', 'net_amt', 'bank', 'claim', 'product',
  'location', 'month', 'exe', 'exe_head', 'dsa_code', 'business_hub', 'status',
  'sp_percent', 'sp_gross', 'dsa_percent', 'dsa_gross', 'payment', 'profit',
  'final_status', 'remark', 'claim_remark', 'sheet_name'
];

const INT_FIELDS = ['sr_no', 'tenure'];
const DECIMAL_FIELDS = [
  'loan_amt', 'net_amt', 'sp_percent', 'sp_gross', 'bank_po', 'roi',
  'gst_on_po', 'deduction_06', 'gvt_extra', 'booster', 'gross_amt',
  'dsa_percent', 'dsa_gross', 'profit'
];
const DATE_FIELDS = ['dis_date', 'selected_month'];

export const updateRecord = async (req, res, next) => {
  try {
    const { source, id } = req.params;
    const rawData = req.body;

    const isParsedAdmin = source.toUpperCase() === 'ADMIN';
    const allowedFields = isParsedAdmin ? ADMIN_FIELDS : DSA_FIELDS;

    const updateData = {};
    for (const key of allowedFields) {
      if (key in rawData) {
        let val = rawData[key];
        if (val === '' || val === null || val === undefined) {
          updateData[key] = null;
        } else if (INT_FIELDS.includes(key)) {
          const parsed = parseInt(val, 10);
          updateData[key] = isNaN(parsed) ? null : parsed;
        } else if (DECIMAL_FIELDS.includes(key)) {
          const parsed = parseFloat(val);
          updateData[key] = isNaN(parsed) ? null : parsed;
        } else if (DATE_FIELDS.includes(key)) {
          const parsed = new Date(val);
          updateData[key] = isNaN(parsed.getTime()) ? null : parsed;
        } else {
          updateData[key] = String(val);
        }
      }
    }

    let updated = null;
    if (isParsedAdmin) {
      updated = await prisma.admin_data.update({
        where: { id },
        data: updateData,
      });
    } else if (source.toUpperCase() === 'DSA') {
      updated = await prisma.dsa_data.update({
        where: { id },
        data: updateData,
      });
    }

    if (!updated) return res.status(404).json({ message: 'Record not found.' });
    res.json({ message: 'Record updated successfully.', updated });
  } catch (err) {
    next(err);
  }
};


// ─── GET /api/validate/dsa/claim-months/:userId ──────────────────────────────
// Returns distinct selected_month (claim submission dates) for a specific DSA user
export const getDsaClaimMonths = async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    // Verify user exists and is a DSA agent
    const user = await prisma.users.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    // Get distinct claim months (selected_month) for this user
    const claimMonths = await prisma.dsa_data.findMany({
      where: { user_id: userId },
      select: { selected_month: true, claim_remark: true },
      distinct: ['selected_month'],
      orderBy: { selected_month: 'desc' },
    });

    const result = claimMonths
      .filter(cm => cm.selected_month)
      .map(cm => ({
        claimMonth: cm.selected_month,
        claimRemark: cm.claim_remark,
      }));

    res.json({ claimMonths: result });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/validate/dsa/multi-month-data/:userId ──────────────────────────
// Returns all data months with remarks for a specific claim submission
export const getDsaMultiMonthData = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { claimMonth } = req.query;

    if (!claimMonth) {
      return res.status(400).json({ message: 'claimMonth parameter is required.' });
    }

    const claimMonthDate = new Date(claimMonth);
    if (isNaN(claimMonthDate.getTime())) {
      return res.status(400).json({ message: 'Invalid claimMonth format.' });
    }

    // Get all distinct data months for this user's claim submission
    const monthsData = await prisma.dsa_data.findMany({
      where: {
        user_id: userId,
        selected_month: claimMonthDate,
      },
      select: {
        month: true,
        remark: true,
        claim_remark: true,
        id: true,
        app_no: true,
        customer_name: true,
        gross_amt: true,
        net_amt: true,
        bank: true,
        product: true,
        location: true,
        dsa_percent: true,
        dsa_gross: true,
      },
      orderBy: { month: 'asc' },
    });

    // Group by month and aggregate remarks
    const groupedByMonth = {};
    const allMonthRecords = [];

    monthsData.forEach(record => {
      if (!groupedByMonth[record.month]) {
        groupedByMonth[record.month] = {
          month: record.month,
          remarks: [],
          recordCount: 0,
          totalGrossAmt: 0,
          totalNetAmt: 0,
          records: [],
        };
      }
      
      if (record.remark && !groupedByMonth[record.month].remarks.includes(record.remark)) {
        groupedByMonth[record.month].remarks.push(record.remark);
      }
      
      groupedByMonth[record.month].recordCount += 1;
      groupedByMonth[record.month].totalGrossAmt += record.gross_amt ? parseFloat(record.gross_amt) : 0;
      groupedByMonth[record.month].totalNetAmt += record.net_amt ? parseFloat(record.net_amt) : 0;
      groupedByMonth[record.month].records.push(record);
    });

    // Get the primary claim month (the one selected by the user in the UI)
    const claimMonthData = monthsData.find(m => m);
    const primaryMonth = claimMonthData?.month; // The main month user selected

    // Separate primary month and other months
    const primaryMonthData = groupedByMonth[primaryMonth] || null;
    const otherMonths = Object.values(groupedByMonth)
      .filter(m => m.month !== primaryMonth)
      .sort((a, b) => a.month.localeCompare(b.month));

    res.json({
      claimRemark: claimMonthData?.claim_remark || null,
      selectedMonth: primaryMonth,
      primaryMonthData,
      otherMonths,
      hasMultipleMonths: otherMonths.length > 0,
      allDistinctMonths: Object.keys(groupedByMonth).sort(),
      allRecords: monthsData,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/tentative-records ───────────────────────────────────────
export const getTentativeRecords = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 25;
    const skip = (page - 1) * limit;

    const { agentId, month, bank, status } = req.query;

    const where = {};

    // Filter by agent (via validated_data -> dsa_data -> user_id)
    if (agentId && agentId !== 'ALL') {
      where.validated_data = {
        some: {
          dsa_data: {
            user_id: agentId
          }
        }
      };
    }

    // Filter by month
    if (month && month !== 'ALL') {
      where.month = month;
    }

    // Filter by bank
    if (bank && bank !== 'ALL') {
      where.bank = bank;
    }

    // Filter by status
    if (status && status !== 'ALL') {
      where.status = status;
    } else {
      // By default show records with non-empty status
      where.status = {
        not: null,
        notIn: ['']
      };
    }

    const [data, total] = await Promise.all([
      prisma.admin_data.findMany({
        where,
        include: {
          validated_data: {
            include: {
              dsa_data: {
                include: {
                  user: {
                    select: { name: true }
                  }
                }
              }
            }
          }
        },
        skip,
        take: limit,
        orderBy: { created_at: 'desc' }
      }),
      prisma.admin_data.count({ where })
    ]);

    // Format the response to return the DSA Agent name if matched
    const formattedData = data.map(record => {
      let agentName = '—';
      if (record.validated_data && record.validated_data.length > 0) {
        const dsa = record.validated_data[0].dsa_data;
        if (dsa && dsa.user) {
          agentName = dsa.user.name;
        }
      }
      return {
        ...record,
        agentName
      };
    });

    res.json({
      data: formattedData,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/admin/tentative-filters-data ──────────────────────────────────
export const getTentativeFiltersData = async (req, res, next) => {
  try {
    const [statuses, months, banks] = await Promise.all([
      prisma.admin_data.findMany({
        where: {
          status: {
            not: null,
            notIn: ['']
          }
        },
        select: { status: true },
        distinct: ['status']
      }),
      prisma.admin_data.findMany({
        where: { month: { not: null } },
        select: { month: true },
        distinct: ['month'],
        orderBy: { month: 'asc' }
      }),
      prisma.admin_data.findMany({
        where: { bank: { not: null } },
        select: { bank: true },
        distinct: ['bank'],
        orderBy: { bank: 'asc' }
      })
    ]);

    res.json({
      statuses: statuses.map(s => s.status).filter(Boolean),
      months: months.map(m => m.month).filter(Boolean),
      banks: banks.map(b => b.bank).filter(Boolean)
    });
  } catch (err) {
    next(err);
  }
};