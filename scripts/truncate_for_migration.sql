-- ============================================================================
-- TRUNCATION SCRIPT: Run BEFORE the Prisma migration
-- This clears DSA-related data so the new non-nullable user_id column can be added.
-- ============================================================================

-- Order matters due to foreign key constraints:
-- 1. unmatched_data references validation_runs
-- 2. validated_data references validation_runs, admin_data, dsa_data
-- 3. validation_runs (now standalone after child tables cleared)
-- 4. dsa_data (now standalone after validated_data cleared)

TRUNCATE TABLE unmatched_data CASCADE;
TRUNCATE TABLE validated_data CASCADE;
TRUNCATE TABLE validation_runs CASCADE;
TRUNCATE TABLE dsa_data CASCADE;

-- NOTE: admin_data is NOT truncated — it doesn't need user_id.
-- If you also want a fresh start for admin data, uncomment:
-- TRUNCATE TABLE admin_data CASCADE;
