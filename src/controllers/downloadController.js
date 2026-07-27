import prisma from "../../config/prisma.js";
import XLSX from 'xlsx';

// ─── GET /api/validate/:runId/download/excel ──────────────────────────────────
// Query: type = matched | unmatched | all | dsa_share
export const downloadExcel = async (req, res, next) => {
    try {
        const { runId } = req.params;
        const type = (req.query.type || 'all').toLowerCase();

        const run = await prisma.validation_runs.findFirst({
      where: req.user?.role === 'Super Admin' || req.user?.role === 'Admin'
        ? { id: runId }
        : { id: runId, user_id: req.user.userId },
    });
        if (!run) return res.status(404).json({ message: 'Validation run not found.' });

        const workbook = XLSX.utils.book_new();

        // ─── Matched Sheet ────────────────────────────────────────────────────
        if (type === 'matched' || type === 'all') {
            const matched = await prisma.validated_data.findMany({
                where: { validation_run_id: runId },
                include: { admin_data: true, dsa_data: true },
                orderBy: { validated_at: 'asc' },
            });

            const matchedRows = matched.map((m, i) => ({
                'SR. NO': i + 1,
                'APP. NO': m.app_no || '',
                'CUSTOMER NAME': m.customer_name || '',
                'MATCH TYPE': m.match_type || '',
                'MONTH': m.month || '',
                'BANK (Admin)': m.admin_data?.bank || '',
                'LOAN AMT (Admin)': m.admin_data?.loan_amt ? Number(m.admin_data.loan_amt) : '',
                'NET AMT (Admin)': m.admin_data?.net_amt ? Number(m.admin_data.net_amt) : '',
                'PRODUCT (Admin)': m.admin_data?.product || '',
                'LOCATION (Admin)': m.admin_data?.location || '',
                'BANK (DSA)': m.dsa_data?.bank || '',
                'GROSS AMT (DSA)': m.dsa_data?.gross_amt ? Number(m.dsa_data.gross_amt) : '',
                'NET AMT (DSA)': m.dsa_data?.net_amt ? Number(m.dsa_data.net_amt) : '',
                'SP % (DSA)': m.dsa_data?.sp_percent ? Number(m.dsa_data.sp_percent) : '',
                'DSA % (DSA)': m.dsa_data?.dsa_percent ? Number(m.dsa_data.dsa_percent) : '',
                'PROFIT (DSA)': m.dsa_data?.profit ? Number(m.dsa_data.profit) : '',
            }));

            const ws = XLSX.utils.json_to_sheet(matchedRows);
            XLSX.utils.book_append_sheet(workbook, ws, 'Matched Data');
        }

        // ─── Unmatched Sheet ──────────────────────────────────────────────────
        if (type === 'unmatched' || type === 'all') {
            const unmatched = await prisma.unmatched_data.findMany({
                where: { validation_run_id: runId },
                orderBy: { flagged_at: 'asc' },
            });

            const unmatchedRows = unmatched.map((u, i) => ({
                'SR. NO': i + 1,
                'SOURCE': u.source || '',
                'APP. NO': u.app_no || '',
                'CUSTOMER NAME': u.customer_name || '',
                'MONTH': u.month || '',
                'REASON': u.reason || '',
            }));

            const ws = XLSX.utils.json_to_sheet(unmatchedRows);
            XLSX.utils.book_append_sheet(workbook, ws, 'Unmatched Data');
        }

        // ─── DSA Share Sheet (mirroring DSA Dump format for matched entries) ──
        if (type === 'dsa_share') {
            const matched = await prisma.validated_data.findMany({
                where: { validation_run_id: runId },
                include: { dsa_data: true, admin_data: true },
                orderBy: { validated_at: 'asc' },
            });

            const dsaShareRows = matched.map((m, i) => ({
                'S NO.': i + 1,
                'CUSTOMER NAME': m.dsa_data?.customer_name || m.customer_name || '',
                'APP. NO': m.app_no || '',
                'GROSS AMT': m.dsa_data?.gross_amt ? Number(m.dsa_data.gross_amt) : '',
                'NET AMT': m.dsa_data?.net_amt ? Number(m.dsa_data.net_amt) : '',
                'BANK': m.dsa_data?.bank || '',
                'CLAIM': m.dsa_data?.claim || '',
                'PRODUCT': m.dsa_data?.product || '',
                'LOCATION': m.dsa_data?.location || '',
                'MONTH': m.dsa_data?.month || m.month || '',
                'EXE': m.dsa_data?.exe || '',
                'EXE HEAD': m.dsa_data?.exe_head || '',
                'DSA CODE': m.dsa_data?.dsa_code || '',
                'BUSINESS HUB': m.dsa_data?.business_hub || '',
                'STATUS': m.dsa_data?.status || '',
                'SP %': m.dsa_data?.sp_percent ? Number(m.dsa_data.sp_percent) : '',
                'SP G.': m.dsa_data?.sp_gross ? Number(m.dsa_data.sp_gross) : '',
                'DSA %': m.dsa_data?.dsa_percent ? Number(m.dsa_data.dsa_percent) : '',
                'DSA G.': m.dsa_data?.dsa_gross ? Number(m.dsa_data.dsa_gross) : '',
                'PAYMENT': m.dsa_data?.payment || '',
                'PROFIT': m.dsa_data?.profit ? Number(m.dsa_data.profit) : '',
                'STATUS.1': m.dsa_data?.final_status || '',
                'REMARK': m.dsa_data?.remark || '',
                'MATCH TYPE': m.match_type || '',
                'ADMIN BANK': m.admin_data?.bank || '',
                'ADMIN LOAN AMT': m.admin_data?.loan_amt ? Number(m.admin_data.loan_amt) : '',
            }));

            const ws = XLSX.utils.json_to_sheet(dsaShareRows);
            XLSX.utils.book_append_sheet(workbook, ws, 'DSA Matched Data');
        }

        // Generate buffer and send
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        const filename = `SastaPaisa_${type}_${run.month}_${new Date().toISOString().slice(0, 10)}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);
    } catch (err) {
        next(err);
    }
};

// ─── GET /api/validate/:runId/download/pdf ────────────────────────────────────
export const downloadPdf = async (req, res, next) => {
    try {
        const { runId } = req.params;
        const type = (req.query.type || 'all').toLowerCase();

        const run = await prisma.validation_runs.findFirst({
      where: req.user?.role === 'Super Admin' || req.user?.role === 'Admin'
        ? { id: runId }
        : { id: runId, user_id: req.user.userId },
    });
        if (!run) return res.status(404).json({ message: 'Validation run not found.' });

        // Build a text-based PDF using raw buffer (no pdfkit dependency needed)
        // We'll generate a simple HTML → PDF-style report as a downloadable text report
        // Instead, let's use a simple approach: generate CSV-style content wrapped in a basic PDF structure

        let reportLines = [];
        reportLines.push('═══════════════════════════════════════════════════════════');
        reportLines.push('           SASTAPAISA — VALIDATION REPORT');
        reportLines.push('═══════════════════════════════════════════════════════════');
        reportLines.push('');
        reportLines.push(`Month:              ${run.month}`);
        reportLines.push(`Status:             ${run.status}`);
        reportLines.push(`Total Admin Rows:   ${run.total_admin}`);
        reportLines.push(`Total DSA Rows:     ${run.total_dsa}`);
        reportLines.push(`Matched (App No):   ${run.matched_app_no}`);
        reportLines.push(`Matched (Name):     ${run.matched_name}`);
        reportLines.push(`Unmatched:          ${run.unmatched}`);
        reportLines.push(`Started:            ${run.started_at ? new Date(run.started_at).toLocaleString() : '—'}`);
        reportLines.push(`Completed:          ${run.completed_at ? new Date(run.completed_at).toLocaleString() : '—'}`);
        reportLines.push('');

        if (type === 'matched' || type === 'all') {
            const matched = await prisma.validated_data.findMany({
                where: { validation_run_id: runId },
                include: { admin_data: true, dsa_data: true },
                orderBy: { validated_at: 'asc' },
            });

            reportLines.push('───────────────────────────────────────────────────────────');
            reportLines.push('  MATCHED DATA');
            reportLines.push('───────────────────────────────────────────────────────────');
            reportLines.push('');
            reportLines.push(`${'#'.padEnd(5)} ${'App No'.padEnd(20)} ${'Customer Name'.padEnd(30)} ${'Match Type'.padEnd(18)} ${'Bank'.padEnd(15)} ${'Amount'.padEnd(12)}`);
            reportLines.push('─'.repeat(100));

            matched.forEach((m, i) => {
                const amt = m.admin_data?.loan_amt || m.dsa_data?.gross_amt || '';
                reportLines.push(
                    `${String(i + 1).padEnd(5)} ${(m.app_no || '').padEnd(20)} ${(m.customer_name || '').slice(0, 28).padEnd(30)} ${(m.match_type || '').padEnd(18)} ${(m.admin_data?.bank || '').slice(0, 13).padEnd(15)} ${String(amt).padEnd(12)}`
                );
            });
            reportLines.push('');
            reportLines.push(`Total Matched: ${matched.length}`);
            reportLines.push('');
        }

        if (type === 'unmatched' || type === 'all') {
            const unmatchedData = await prisma.unmatched_data.findMany({
                where: { validation_run_id: runId },
                orderBy: { flagged_at: 'asc' },
            });

            reportLines.push('───────────────────────────────────────────────────────────');
            reportLines.push('  UNMATCHED DATA');
            reportLines.push('───────────────────────────────────────────────────────────');
            reportLines.push('');
            reportLines.push(`${'#'.padEnd(5)} ${'Source'.padEnd(8)} ${'App No'.padEnd(20)} ${'Customer Name'.padEnd(30)} ${'Reason'.padEnd(40)}`);
            reportLines.push('─'.repeat(103));

            unmatchedData.forEach((u, i) => {
                reportLines.push(
                    `${String(i + 1).padEnd(5)} ${(u.source || '').padEnd(8)} ${(u.app_no || '').padEnd(20)} ${(u.customer_name || '').slice(0, 28).padEnd(30)} ${(u.reason || '').slice(0, 38).padEnd(40)}`
                );
            });
            reportLines.push('');
            reportLines.push(`Total Unmatched: ${unmatchedData.length}`);
        }

        reportLines.push('');
        reportLines.push('═══════════════════════════════════════════════════════════');
        reportLines.push(`Generated: ${new Date().toLocaleString()}`);
        reportLines.push('═══════════════════════════════════════════════════════════');

        const content = reportLines.join('\n');
        const filename = `SastaPaisa_Report_${type}_${run.month}_${new Date().toISOString().slice(0, 10)}.txt`;

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(content);
    } catch (err) {
        next(err);
    }
};

// ─── GET /api/validate/runs ───────────────────────────────────────────────────
// Returns completed runs for dropdown selectors
export const getCompletedRuns = async (req, res, next) => {
    try {
        const isSuperAdmin = req.user?.role === 'Super Admin' || req.user?.role === 'Admin';
        const where = { status: 'DONE' };
        if (!isSuperAdmin) where.user_id = req.user.userId;

        const runs = await prisma.validation_runs.findMany({
            where,
            orderBy: { completed_at: 'desc' },
            take: 50,
        });
        res.json({ runs });
    } catch (err) {
        next(err);
    }
};

// ─── GET /api/reporting/summary ───────────────────────────────────────────────
// Returns overall summary stats across all months
export const getReportingSummary = async (req, res, next) => {
    try {
        const monthQ = req.query.month;
        const isSuperAdmin = req.user?.role === 'Super Admin' || req.user?.role === 'Admin';

        const runsWhere = { status: 'DONE' };
        if (!isSuperAdmin) runsWhere.user_id = req.user.userId;
        if (monthQ) runsWhere.month = monthQ.toUpperCase();

        const runs = await prisma.validation_runs.findMany({
            where: runsWhere,
            orderBy: { completed_at: 'desc' },
        });

        const dsaCountWhere = {};
        if (!isSuperAdmin) dsaCountWhere.user_id = req.user.userId;
        if (monthQ) dsaCountWhere.month = monthQ.toUpperCase();

        const [totalAdminImported, totalDsaImported] = await Promise.all([
            prisma.admin_data.count(monthQ ? { where: { month: monthQ.toUpperCase() } } : {}),
            prisma.dsa_data.count({ where: dsaCountWhere }),
        ]);

        const summary = {
            totalRuns: runs.length,
            totalAdminImported,
            totalDsaImported,
            totalMatched: runs.reduce((sum, r) => sum + (r.matched_app_no || 0) + (r.matched_name || 0), 0),
            totalUnmatched: runs.reduce((sum, r) => sum + (r.unmatched || 0), 0),
            matchRate: 0,
            runs: runs.map(r => ({
                id: r.id,
                month: r.month,
                status: r.status,
                totalAdmin: r.total_admin,
                totalDsa: r.total_dsa,
                matchedAppNo: r.matched_app_no,
                matchedName: r.matched_name,
                unmatched: r.unmatched,
                completedAt: r.completed_at,
            })),
        };

        const totalProcessed = summary.totalMatched + summary.totalUnmatched;
        summary.matchRate = totalProcessed > 0
            ? Math.round((summary.totalMatched / totalProcessed) * 100)
            : 0;

        res.json(summary);
    } catch (err) {
        next(err);
    }
};
