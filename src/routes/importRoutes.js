import express from 'express';
import multer from 'multer';
import * as importController from '../controllers/importController.js';
import * as validationController from '../controllers/validationController.js';
import * as downloadController from '../controllers/downloadController.js';
import * as userController from '../controllers/userController.js';
import { authenticateToken, requireRole } from '../middlewares/auth.js';

const router = express.Router();


// Multer — store in memory (no disk I/O needed, we parse buffer directly)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB max
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/)) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx and .xls files are allowed.'));
    }
  },
});

// ─── Import Routes ────────────────────────────────────────────────────────────
// POST /api/import/admin  — Admin uploads Excel
router.post('/import/admin', authenticateToken, requireRole('Super Admin', 'Admin'), upload.single('file'), importController.importAdminData);

// POST /api/import/dsa    — DSA Agent uploads Excel
router.post('/import/dsa', authenticateToken, upload.single('file'), importController.importDsaData);

// GET  /api/import/months — Fetch available months for dropdown
router.get('/import/months', authenticateToken, importController.getAvailableMonths);

// GET  /api/import/admin-data — View imported admin data (paginated)
router.get('/import/admin-data', authenticateToken, requireRole('Super Admin', 'Admin'), importController.getAdminData);

// GET  /api/import/dsa-data — View imported DSA data (paginated, filterable by batchId)
router.get('/import/dsa-data', authenticateToken, importController.getDsaData);

// GET  /api/import/dsa-batches — List DSA import batches
router.get('/import/dsa-batches', authenticateToken, importController.getDsaBatches);

// GET  /api/import/admin-batches — List admin import batches
router.get('/import/admin-batches', authenticateToken, requireRole('Super Admin', 'Admin'), importController.getAdminBatches);

// ─── Validation Routes ────────────────────────────────────────────────────────
// POST /api/validate            — Start validation for a month
router.post('/validate', authenticateToken, requireRole('Super Admin', 'Admin'), validationController.startValidation);

// GET  /api/validate/history    — List recent validation runs
router.get('/validate/history', authenticateToken, requireRole('Super Admin', 'Admin'), validationController.getValidationHistory);

// GET  /api/validate/runs       — List completed runs (for dropdowns)
router.get('/validate/runs', authenticateToken, requireRole('Super Admin', 'Admin'), downloadController.getCompletedRuns);

// GET  /api/validate/:runId/status   — Poll progress of a run
router.get('/validate/:runId/status', authenticateToken, requireRole('Super Admin', 'Admin'), validationController.getValidationStatus);

// GET  /api/validate/:runId/matched  — Paginated matched data
router.get('/validate/:runId/matched', authenticateToken, requireRole('Super Admin', 'Admin'), validationController.getMatchedData);

// GET  /api/validate/:runId/unmatched — Paginated unmatched data
router.get('/validate/:runId/unmatched', authenticateToken, requireRole('Super Admin', 'Admin'), validationController.getUnmatchedData);

// GET  /api/validate/record/:source/:id — Fetch full details for a record
router.get('/validate/record/:source/:id', authenticateToken, requireRole('Super Admin', 'Admin'), validationController.getRecordDetails);

// PATCH /api/validate/record/:source/:id — Update a record
router.patch('/validate/record/:source/:id', authenticateToken, requireRole('Super Admin', 'Admin'), validationController.updateRecord);

// GET  /api/admin/tentative-records — View tentative records
router.get('/admin/tentative-records', authenticateToken, requireRole('Super Admin', 'Admin'), validationController.getTentativeRecords);

// GET  /api/admin/tentative-filters-data — Get list of values for filters
router.get('/admin/tentative-filters-data', authenticateToken, requireRole('Super Admin', 'Admin'), validationController.getTentativeFiltersData);

// GET  /api/validate/dsa/claim-months/:userId — Get all claim months for a DSA user
router.get('/validate/dsa/claim-months/:userId', authenticateToken, requireRole('Super Admin', 'Admin'), validationController.getDsaClaimMonths);

// GET  /api/validate/dsa/multi-month-data/:userId — Get all months data for a specific claim submission
router.get('/validate/dsa/multi-month-data/:userId', authenticateToken, requireRole('Super Admin', 'Admin'), validationController.getDsaMultiMonthData);

// Download Routes ──────────────────────────────────────────────────────────
// GET  /api/validate/:runId/download/excel?type=matched|unmatched|all|dsa_share
router.get('/validate/:runId/download/excel', authenticateToken, downloadController.downloadExcel);

// GET  /api/validate/:runId/download/pdf?type=matched|unmatched|all
router.get('/validate/:runId/download/pdf', authenticateToken, downloadController.downloadPdf);

// ─── Reporting Routes ─────────────────────────────────────────────────────────
// GET  /api/reporting/summary?month=...
router.get('/reporting/summary', authenticateToken, requireRole('Super Admin', 'Admin'), downloadController.getReportingSummary);

// ─── Delete Routes (Super Admin/Admin only) ─────────────────────────────────────────
// DELETE /api/import/dsa-batch/:batchId
router.delete('/import/dsa-batch/:batchId', authenticateToken, requireRole('Super Admin', 'Admin'), importController.deleteDsaBatch);

// DELETE /api/import/admin-batch/:batchId
router.delete('/import/admin-batch/:batchId', authenticateToken, requireRole('Super Admin', 'Admin'), importController.deleteAdminBatch);

export default router;