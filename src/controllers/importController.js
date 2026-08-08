import prisma from "../../config/prisma.js";
import XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
// const XLSX = require('xlsx');
// const { v4: uuidv4 } = require('uuid');

// const prisma = new PrismaClient();

// ─── Helper: parse month string from excel row ───────────────────────────────
const normalizeMonth = (val) => (val ? String(val).trim().toUpperCase() : null);

// ─── Helper: parse "January 2026" → Date(2026, 0, 1) ─────────────────────────
const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const parseSelectedMonth = (val) => {
  if (!val) return null;
  const parts = String(val).trim().split(/\s+/);
  if (parts.length !== 2) return null;
  const mIdx = MONTH_NAMES.indexOf(parts[0].toLowerCase());
  const year = parseInt(parts[1], 10);
  if (mIdx === -1 || isNaN(year)) return null;
  return new Date(Date.UTC(year, mIdx, 1));
};

// ─── Helper: parse numeric / percentage fields ───────────────────────────────
const toDecimal = (val) => {
  if (val === undefined || val === null || val === '') return null;
  const str = String(val).replace('%', '').trim();
  const num = parseFloat(str);
  if (isNaN(num)) return null;
  // Cap to safe range to avoid numeric overflow (up to ~100 crore)
  if (Math.abs(num) > 999999999) return null;
  return num;
};

const toDate = (val) => {
  if (!val) return null;
  // Excel serial date
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) return new Date(date.y, date.m - 1, date.d);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

// ─── POST /api/import/admin ───────────────────────────────────────────────────
export const importAdminData = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const targetSheet = req.body.sheetName || workbook.SheetNames[0];

    if (!workbook.SheetNames.includes(targetSheet)) {
      return res.status(400).json({ message: `Sheet "${targetSheet}" not found in file.` });
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[targetSheet], { defval: '', raw: false });

    if (!rows.length) return res.status(400).json({ message: 'Excel file is empty.' });

    const batchId = uuidv4();
    const selectedMonthDate = parseSelectedMonth(req.body.selectedMonth);

    const records = rows.map((r) => ({
      sr_no: r['SR. NO'] ? parseInt(r['SR. NO']) : null,
      customer_name: String(r['CUSTOMER NAME'] || r[' CUSTOMER NAME '] || '').trim(),
      app_no: String(r['APP. NO'] || '').trim(),
      loan_amt: toDecimal(r['LOAN AMT']),
      net_amt: toDecimal(r['NET AMT']),
      bank: String(r['BANK'] || r[' BANK '] || '').trim(),
      claim: String(r['CLAIM'] || r[' CLAIM '] || '').trim(),
      product: String(r['PRODUCT'] || r[' PRODUCT '] || '').trim(),
      location: String(r['LOCATION'] || r[' LOCATION '] || '').trim(),
      month: normalizeMonth(r['MONTH'] || r[' MONTH ']),
      exe: String(r['EXE'] || r[' EXE '] || '').trim(),
      exe_head: String(r['EXE HEAD'] || r[' EXE HEAD '] || '').trim(),
      partner: String(r['PARTNER'] || r[' PARTNER '] || '').trim(),
      business_hub: String(r['BUSINESS HUB'] || r[' BUSINESS HUB '] || '').trim(),
      status: String(r['STATUS'] || r[' STATUS '] || '').trim(),
      sp_percent: toDecimal(r['SP %'] || r[' SP % ']),
      sp_gross: toDecimal(r['SP G.']),
      bank_po: toDecimal(r['BANK PO']),
      payment: String(r['PAYMENT'] || r[' PAYMENT '] || '').trim(),
      dis_date: toDate(r['DIS. DATE']),
      roi: toDecimal(r['ROI']),
      tenure: r['TENURE'] ? parseInt(r['TENURE']) : null,
      gst_on_po: toDecimal(r['GST on PO']),
      deduction_06: toDecimal(r['-0.6']),
      gvt_extra: toDecimal(r['GVT EXTRA']),
      booster: toDecimal(r['BOOSTER']),
      sheet_name: String(targetSheet).trim(),
      import_batch_id: batchId,
      selected_month: selectedMonthDate,
    })).filter(r => r.app_no); // skip rows with no app_no

    // Bulk insert in chunks of 500
    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      const result = await prisma.admin_data.createMany({ data: chunk, skipDuplicates: false });
      inserted += result.count;
    }

    res.status(201).json({
      message: 'Admin data imported successfully.',
      batchId,
      totalRows: rows.length,
      inserted,
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/import/dsa ─────────────────────────────────────────────────────
export const importDsaData = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const targetSheet = req.body.sheetName || workbook.SheetNames[0];

    if (!workbook.SheetNames.includes(targetSheet)) {
      return res.status(400).json({ message: `Sheet "${targetSheet}" not found in file.` });
    }

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[targetSheet], { defval: '', raw: false });

    if (!rows.length) return res.status(400).json({ message: 'Excel file is empty.' });

    const batchId = uuidv4();
    const selectedMonthDate = parseSelectedMonth(req.body.selectedMonth);

    const userId = req.user.userId;

    const now = new Date();
    const currentMonthName = now.toLocaleString('default', { month: 'long' }).toUpperCase();
    const currentYear = now.getFullYear();
    const claimRemarkText = `CLAIM ASKED IN ${currentMonthName} ${currentYear}`;

    const nextMonthDate = new Date();
    nextMonthDate.setMonth(now.getMonth() + 1);
    const nextMonthPrefix = nextMonthDate.toLocaleString('default', { month: 'short' }).toUpperCase();
    const currentYearShort = String(now.getFullYear()).slice(-2);

    const processDsaMonth = (rawVal) => {
      let val = normalizeMonth(rawVal);
      if (!val) return null;
      // If no digits in the month, append the current 2-digit year (e.g. .26)
      if (!/\d/.test(val)) {
        val = `${val.substring(0, 3)}.${currentYearShort}`;
      }
      return val;
    };

    const records = rows.map((r) => {
      const processedMonth = processDsaMonth(r['month'] || r['MONTH'] || r[' MONTH ']);
      let recordStatus = String(r['status'] || r['STATUS'] || r[' STATUS '] || '').trim();
      
      if (processedMonth && processedMonth.startsWith(nextMonthPrefix)) {
        recordStatus = 'Tentative';
      }

      return {
        user_id: userId,
        sr_no: r['sr_no'] !== undefined ? parseInt(r['sr_no']) : (r['S NO.'] ? parseInt(r['S NO.']) : null),
        customer_name: String(r['customer_name'] || r['CUSTOMER NAME'] || r[' CUSTOMER NAME '] || '').trim(),
        app_no: String(r['app_no'] || r['APP. NO'] || '').trim(),
        gross_amt: toDecimal(r['gross_amt'] !== undefined ? r['gross_amt'] : r['GROSS AMT']),
        net_amt: toDecimal(r['net_amt'] !== undefined ? r['net_amt'] : r['NET AMT']),
        bank: String(r['bank'] || r['BANK'] || r[' BANK '] || '').trim(),
        claim: String(r['claim'] || r['CLAIM'] || r[' CLAIM '] || '').trim(),
        product: String(r['product'] || r['PRODUCT'] || r[' PRODUCT '] || '').trim(),
        location: String(r['location'] || r['LOCATION'] || r[' LOCATION '] || '').trim(),
        month: processedMonth,
        exe: String(r['exe'] || r['EXE'] || r[' EXE '] || '').trim(),
        exe_head: String(r['exe_head'] || r['EXE HEAD'] || r[' EXE HEAD '] || '').trim(),
        dsa_code: String(r['dsa_code'] || r['DSA CODE'] || r[' DSA CODE '] || '').trim(),
        business_hub: String(r['business_hub'] || r['BUSINESS HUB'] || r[' BUSINESS HUB '] || '').trim(),
        status: recordStatus,
        sp_percent: toDecimal(r['sp_percent'] !== undefined ? r['sp_percent'] : (r['SP %'] || r['  SP %  '])),
        sp_gross: toDecimal(r['sp_gross'] !== undefined ? r['sp_gross'] : r['SP G.']),
        dsa_percent: toDecimal(r['dsa_percent'] !== undefined ? r['dsa_percent'] : (r['DSA %'] || r['  DSA %  '])),
        dsa_gross: toDecimal(r['dsa_gross'] !== undefined ? r['dsa_gross'] : r['DSA G.']),
        payment: String(r['payment'] || r['PAYMENT'] || r[' PAYMENT '] || '').trim(),
        profit: toDecimal(r['profit'] !== undefined ? r['profit'] : (r['PROFIT'] || r[' PROFIT '])),
        final_status: String(r['final_status'] || r['STATUS.1'] || r[' STATUS.1'] || '').trim(),
        remark: String(r['remark'] || r['REMARK'] || '').trim(),
        sheet_name: String(targetSheet).trim(),
        import_batch_id: batchId,
        selected_month: selectedMonthDate,
        claim_remark: claimRemarkText,
      };
    }).filter(r => r.app_no);

    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < records.length; i += CHUNK) {
      const chunk = records.slice(i, i + CHUNK);
      const result = await prisma.dsa_data.createMany({ data: chunk, skipDuplicates: false });
      inserted += result.count;
    }

    res.status(201).json({
      message: 'DSA data imported successfully.',
      batchId,
      totalRows: rows.length,
      inserted,
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/import/months ───────────────────────────────────────────────────
// Returns distinct months and sheet names available in both tables
export const getAvailableMonths = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user?.role === 'Super Admin' || req.user?.role === 'Admin';
    const dsaWhere = isSuperAdmin ? {} : { user_id: req.user.userId };

    const [adminData, dsaData, adminBanks, dsaBanks] = await Promise.all([
      prisma.admin_data.findMany({ select: { month: true, sheet_name: true }, distinct: ['month', 'sheet_name'] }),
      prisma.dsa_data.findMany({ where: dsaWhere, select: { month: true, sheet_name: true }, distinct: ['month', 'sheet_name'] }),
      prisma.admin_data.findMany({ select: { bank: true }, distinct: ['bank'] }),
      prisma.dsa_data.findMany({ where: dsaWhere, select: { bank: true }, distinct: ['bank'] }),
    ]);

    const allMonths = [...new Set([
      ...adminData.map(r => r.month).filter(Boolean),
      ...dsaData.map(r => r.month).filter(Boolean),
    ])].sort();

    const allSheets = [...new Set([
      ...adminData.map(r => r.sheet_name).filter(Boolean),
      ...dsaData.map(r => r.sheet_name).filter(Boolean),
    ])].sort();

    const allBanks = [...new Set([
      ...adminBanks.map(r => r.bank).filter(Boolean),
      ...dsaBanks.map(r => r.bank).filter(Boolean),
    ])].sort();

    res.json({ months: allMonths, sheets: allSheets, banks: allBanks });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/import/admin-data ──────────────────────────────────────────────
// Paginated endpoint to view imported admin (bank) data
export const getAdminData = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const month = req.query.month;
    const search = req.query.search;

    const where = {};
    if (month) where.month = month.toUpperCase();
    if (search) {
      where.OR = [
        { customer_name: { contains: search, mode: 'insensitive' } },
        { app_no: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.admin_data.findMany({ where, skip, take: limit, orderBy: { created_at: 'desc' } }),
      prisma.admin_data.count({ where }),
    ]);

    res.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/import/dsa-data ────────────────────────────────────────────────
// Paginated endpoint to view imported DSA data for a specific batch
export const getDsaData = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    const month = req.query.month;
    const search = req.query.search;
    const batchId = req.query.batchId;
    const isSuperAdmin = req.user?.role === 'Super Admin' || req.user?.role === 'Admin';

    const where = {};
    if (!isSuperAdmin) where.user_id = req.user.userId;
    if (month) where.month = month.toUpperCase();
    if (batchId) where.import_batch_id = batchId;
    if (search) {
      where.OR = [
        { customer_name: { contains: search, mode: 'insensitive' } },
        { app_no: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.dsa_data.findMany({ where, skip, take: limit, orderBy: { sr_no: 'asc' } }),
      prisma.dsa_data.count({ where }),
    ]);

    res.json({
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/import/dsa-batches ─────────────────────────────────────────────
// Returns import batches grouped by import_batch_id
export const getDsaBatches = async (req, res, next) => {
  try {
    const isSuperAdmin = req.user?.role === 'Super Admin' || req.user?.role === 'Admin';
    const userFilter = isSuperAdmin ? {} : { user_id: req.user.userId };

    const batches = await prisma.dsa_data.groupBy({
      by: ['import_batch_id'],
      where: userFilter,
      _count: { id: true },
      _min: { created_at: true, month: true },
      orderBy: { _min: { created_at: 'desc' } },
    });

    // For each batch, get a sample row to extract metadata
    const result = await Promise.all(
      batches.map(async (b) => {
        const sample = await prisma.dsa_data.findFirst({
          where: { import_batch_id: b.import_batch_id, ...userFilter },
          select: { month: true, bank: true, dsa_code: true, created_at: true, location: true },
        });

        // Get distinct banks in this batch
        const banks = await prisma.dsa_data.findMany({
          where: { import_batch_id: b.import_batch_id, ...userFilter },
          select: { bank: true },
          distinct: ['bank'],
        });

        return {
          batchId: b.import_batch_id,
          totalEntries: b._count.id,
          importedAt: b._min.created_at,
          month: sample?.month || '—',
          banks: banks.map(bk => bk.bank).filter(Boolean),
          dsaCode: sample?.dsa_code || '—',
          location: sample?.location || '—',
        };
      })
    );

    res.json({ batches: result });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/import/admin-batches ───────────────────────────────────────────
// Returns admin import batches grouped by import_batch_id
export const getAdminBatches = async (req, res, next) => {
  try {
    const batches = await prisma.admin_data.groupBy({
      by: ['import_batch_id'],
      _count: { id: true },
      _min: { created_at: true, month: true },
      orderBy: { _min: { created_at: 'desc' } },
    });

    const result = await Promise.all(
      batches.map(async (b) => {
        const sample = await prisma.admin_data.findFirst({
          where: { import_batch_id: b.import_batch_id },
          select: { month: true, bank: true, partner: true, created_at: true, location: true },
        });

        const banks = await prisma.admin_data.findMany({
          where: { import_batch_id: b.import_batch_id },
          select: { bank: true },
          distinct: ['bank'],
        });

        return {
          batchId: b.import_batch_id,
          totalEntries: b._count.id,
          importedAt: b._min.created_at,
          month: sample?.month || '—',
          banks: banks.map(bk => bk.bank).filter(Boolean),
          partner: sample?.partner || '—',
          location: sample?.location || '—',
        };
      })
    );

    res.json({ batches: result });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/import/dsa-batch/:batchId ────────────────────────────────────
// Admin / Super Admin only — deletes all DSA records for a batch
export const deleteDsaBatch = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const isSuperAdmin = req.user?.role === 'Super Admin' || req.user?.role === 'Admin';
    const userFilter = isSuperAdmin ? {} : { user_id: req.user.userId };

    const count = await prisma.dsa_data.count({ where: { import_batch_id: batchId, ...userFilter } });
    if (count === 0) return res.status(404).json({ message: 'Batch not found.' });

    await prisma.dsa_data.deleteMany({ where: { import_batch_id: batchId, ...userFilter } });
    res.json({ message: `Deleted ${count} DSA records from batch.`, deleted: count });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/import/admin-batch/:batchId ──────────────────────────────────
// Admin / Super Admin only — deletes all admin records for a batch
export const deleteAdminBatch = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    const count = await prisma.admin_data.count({ where: { import_batch_id: batchId } });
    if (count === 0) return res.status(404).json({ message: 'Batch not found.' });

    await prisma.admin_data.deleteMany({ where: { import_batch_id: batchId } });
    res.json({ message: `Deleted ${count} admin records from batch.`, deleted: count });
  } catch (err) {
    next(err);
  }
};