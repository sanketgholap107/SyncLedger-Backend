-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  SastaPaisa / SyncLedger – Full Database Setup Script                       ║
-- ║  Run with:  psql -U pj -d SastaPaisa -f scripts/setup_db.sql               ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 1. ROLES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
    id           SERIAL PRIMARY KEY,
    role_name    VARCHAR(50) UNIQUE NOT NULL,
    description  TEXT,
    created_at   TIMESTAMP(6) DEFAULT NOW()
);

-- ─── 2. USERS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(150) UNIQUE NOT NULL,
    password_hash   TEXT,
    role_id         INT NOT NULL REFERENCES roles(id) ON UPDATE NO ACTION,
    location        VARCHAR(100),
    manager         VARCHAR(100),
    pay_percentage  DECIMAL(5,2),
    status          VARCHAR(20) DEFAULT 'INVITED',
    created_at      TIMESTAMP(6) DEFAULT NOW(),
    updated_at      TIMESTAMP(6)
);

-- ─── 3. PASSWORD SETUP TOKENS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS password_setup_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE ON UPDATE NO ACTION,
    token       TEXT UNIQUE NOT NULL,
    expires_at  TIMESTAMP(6) NOT NULL,
    used        BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP(6) DEFAULT NOW()
);

-- ─── 4. ADMIN DATA (Bank Dump) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_data (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sr_no            INT,
    customer_name    VARCHAR(255) NOT NULL,
    app_no           VARCHAR(100) NOT NULL,
    loan_amt         DECIMAL(15,2),
    net_amt          DECIMAL(15,2),
    bank             VARCHAR(100),
    claim            VARCHAR(50),
    product          VARCHAR(100),
    location         VARCHAR(150),
    month            VARCHAR(20),
    exe              VARCHAR(100),
    exe_head         VARCHAR(100),
    partner          VARCHAR(100),
    business_hub     VARCHAR(100),
    status           VARCHAR(50),
    sp_percent       DECIMAL(8,4),
    sp_gross         DECIMAL(15,2),
    bank_po          DECIMAL(15,2),
    payment          VARCHAR(50),
    dis_date         DATE,
    roi              DECIMAL(6,3),
    tenure           INT,
    gst_on_po        DECIMAL(15,2),
    deduction_06     DECIMAL(15,4),
    gvt_extra        DECIMAL(15,4),
    booster          DECIMAL(15,4),
    import_batch_id  UUID,
    created_at       TIMESTAMPTZ(6) DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_data_app_no             ON admin_data(app_no);
CREATE INDEX IF NOT EXISTS idx_admin_data_month              ON admin_data(month);
CREATE INDEX IF NOT EXISTS idx_admin_data_app_no_month       ON admin_data(app_no, month);
CREATE INDEX IF NOT EXISTS idx_admin_data_customer_name_month ON admin_data(customer_name, month);

-- ─── 5. DSA DATA (DSA Dump) ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dsa_data (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sr_no            INT,
    customer_name    VARCHAR(255) NOT NULL,
    app_no           VARCHAR(100) NOT NULL,
    gross_amt        DECIMAL(15,2),
    net_amt          DECIMAL(15,2),
    bank             VARCHAR(100),
    claim            VARCHAR(50),
    product          VARCHAR(100),
    location         VARCHAR(150),
    month            VARCHAR(20),
    exe              VARCHAR(100),
    exe_head         VARCHAR(100),
    dsa_code         VARCHAR(100),
    business_hub     VARCHAR(100),
    status           VARCHAR(50),
    sp_percent       DECIMAL(8,4),
    sp_gross         DECIMAL(15,2),
    dsa_percent      DECIMAL(8,4),
    dsa_gross        DECIMAL(15,2),
    payment          VARCHAR(50),
    profit           DECIMAL(15,2),
    final_status     VARCHAR(50),
    remark           TEXT,
    import_batch_id  UUID,
    created_at       TIMESTAMPTZ(6) DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dsa_data_app_no             ON dsa_data(app_no);
CREATE INDEX IF NOT EXISTS idx_dsa_data_month              ON dsa_data(month);
CREATE INDEX IF NOT EXISTS idx_dsa_data_app_no_month       ON dsa_data(app_no, month);
CREATE INDEX IF NOT EXISTS idx_dsa_data_customer_name_month ON dsa_data(customer_name, month);

-- ─── 6. VALIDATION RUNS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS validation_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    month         VARCHAR(20) NOT NULL,
    status        VARCHAR(20) DEFAULT 'PENDING',
    total_admin   INT DEFAULT 0,
    total_dsa     INT DEFAULT 0,
    processed     INT DEFAULT 0,
    matched_app_no INT DEFAULT 0,
    matched_name  INT DEFAULT 0,
    unmatched     INT DEFAULT 0,
    started_at    TIMESTAMPTZ(6) DEFAULT NOW(),
    completed_at  TIMESTAMPTZ(6)
);

-- ─── 7. VALIDATED DATA (Matched) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS validated_data (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_data_id     UUID REFERENCES admin_data(id),
    dsa_data_id       UUID REFERENCES dsa_data(id),
    app_no            VARCHAR(100) NOT NULL,
    customer_name     VARCHAR(255),
    match_type        VARCHAR(20) NOT NULL,
    month             VARCHAR(20),
    validation_run_id UUID NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
    validated_at      TIMESTAMPTZ(6) DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_validated_data_run_id ON validated_data(validation_run_id);
CREATE INDEX IF NOT EXISTS idx_validated_data_app_no ON validated_data(app_no);

-- ─── 8. UNMATCHED DATA ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unmatched_data (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source            VARCHAR(10) NOT NULL,
    source_row_id     UUID NOT NULL,
    app_no            VARCHAR(100),
    customer_name     VARCHAR(255),
    month             VARCHAR(20),
    reason            TEXT,
    validation_run_id UUID NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
    flagged_at        TIMESTAMPTZ(6) DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unmatched_data_run_id ON unmatched_data(validation_run_id);

-- ─── 9. SEED ROLES ───────────────────────────────────────────────────────────
INSERT INTO roles (role_name, description)
VALUES
    ('Admin',       'Full system access'),
    ('Employee',    'Limited access'),
    ('DSA Partner', 'Partner access')
ON CONFLICT (role_name) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- Done! Tables and seed data created successfully.
-- Next steps:
--   1. Run: node scripts/createAdmin.js   (creates admin user)
--   2. Run: npm start                     (start the server)
-- ══════════════════════════════════════════════════════════════════════════════
