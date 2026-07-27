-- CreateTable
CREATE TABLE "password_setup_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(6) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_setup_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "role_name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "password_hash" TEXT,
    "role_id" INTEGER NOT NULL,
    "location" VARCHAR(100),
    "manager" VARCHAR(100),
    "pay_percentage" DECIMAL(5,2),
    "status" VARCHAR(20) NOT NULL DEFAULT 'INVITED',
    "created_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_data" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sr_no" INTEGER,
    "customer_name" VARCHAR(255) NOT NULL,
    "app_no" VARCHAR(100) NOT NULL,
    "loan_amt" DECIMAL(15,2),
    "net_amt" DECIMAL(15,2),
    "bank" VARCHAR(100),
    "claim" VARCHAR(50),
    "product" VARCHAR(100),
    "location" VARCHAR(150),
    "month" VARCHAR(20),
    "exe" VARCHAR(100),
    "exe_head" VARCHAR(100),
    "partner" VARCHAR(100),
    "business_hub" VARCHAR(100),
    "status" VARCHAR(50),
    "sp_percent" DECIMAL(8,4),
    "sp_gross" DECIMAL(15,2),
    "bank_po" DECIMAL(15,2),
    "payment" VARCHAR(50),
    "dis_date" DATE,
    "roi" DECIMAL(6,3),
    "tenure" INTEGER,
    "gst_on_po" DECIMAL(15,2),
    "deduction_06" DECIMAL(15,4),
    "gvt_extra" DECIMAL(15,4),
    "booster" DECIMAL(15,4),
    "import_batch_id" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dsa_data" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sr_no" INTEGER,
    "customer_name" VARCHAR(255) NOT NULL,
    "app_no" VARCHAR(100) NOT NULL,
    "gross_amt" DECIMAL(15,2),
    "net_amt" DECIMAL(15,2),
    "bank" VARCHAR(100),
    "claim" VARCHAR(50),
    "product" VARCHAR(100),
    "location" VARCHAR(150),
    "month" VARCHAR(20),
    "exe" VARCHAR(100),
    "exe_head" VARCHAR(100),
    "dsa_code" VARCHAR(100),
    "business_hub" VARCHAR(100),
    "status" VARCHAR(50),
    "sp_percent" DECIMAL(8,4),
    "sp_gross" DECIMAL(15,2),
    "dsa_percent" DECIMAL(8,4),
    "dsa_gross" DECIMAL(15,2),
    "payment" VARCHAR(50),
    "profit" DECIMAL(15,2),
    "final_status" VARCHAR(50),
    "remark" TEXT,
    "import_batch_id" UUID,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dsa_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "month" VARCHAR(20) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "total_admin" INTEGER NOT NULL DEFAULT 0,
    "total_dsa" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "matched_app_no" INTEGER NOT NULL DEFAULT 0,
    "matched_name" INTEGER NOT NULL DEFAULT 0,
    "unmatched" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "validation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validated_data" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "admin_data_id" UUID,
    "dsa_data_id" UUID,
    "app_no" VARCHAR(100) NOT NULL,
    "customer_name" VARCHAR(255),
    "match_type" VARCHAR(20) NOT NULL,
    "month" VARCHAR(20),
    "validation_run_id" UUID NOT NULL,
    "validated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validated_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unmatched_data" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" VARCHAR(10) NOT NULL,
    "source_row_id" UUID NOT NULL,
    "app_no" VARCHAR(100),
    "customer_name" VARCHAR(255),
    "month" VARCHAR(20),
    "reason" TEXT,
    "validation_run_id" UUID NOT NULL,
    "flagged_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unmatched_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_setup_tokens_token_key" ON "password_setup_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "roles_role_name_key" ON "roles"("role_name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "admin_data_app_no_idx" ON "admin_data"("app_no");

-- CreateIndex
CREATE INDEX "admin_data_month_idx" ON "admin_data"("month");

-- CreateIndex
CREATE INDEX "admin_data_app_no_month_idx" ON "admin_data"("app_no", "month");

-- CreateIndex
CREATE INDEX "admin_data_customer_name_month_idx" ON "admin_data"("customer_name", "month");

-- CreateIndex
CREATE INDEX "dsa_data_app_no_idx" ON "dsa_data"("app_no");

-- CreateIndex
CREATE INDEX "dsa_data_month_idx" ON "dsa_data"("month");

-- CreateIndex
CREATE INDEX "dsa_data_app_no_month_idx" ON "dsa_data"("app_no", "month");

-- CreateIndex
CREATE INDEX "dsa_data_customer_name_month_idx" ON "dsa_data"("customer_name", "month");

-- CreateIndex
CREATE INDEX "validated_data_validation_run_id_idx" ON "validated_data"("validation_run_id");

-- CreateIndex
CREATE INDEX "validated_data_app_no_idx" ON "validated_data"("app_no");

-- CreateIndex
CREATE INDEX "unmatched_data_validation_run_id_idx" ON "unmatched_data"("validation_run_id");

-- AddForeignKey
ALTER TABLE "password_setup_tokens" ADD CONSTRAINT "password_setup_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "validated_data" ADD CONSTRAINT "validated_data_admin_data_id_fkey" FOREIGN KEY ("admin_data_id") REFERENCES "admin_data"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validated_data" ADD CONSTRAINT "validated_data_dsa_data_id_fkey" FOREIGN KEY ("dsa_data_id") REFERENCES "dsa_data"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validated_data" ADD CONSTRAINT "validated_data_validation_run_id_fkey" FOREIGN KEY ("validation_run_id") REFERENCES "validation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unmatched_data" ADD CONSTRAINT "unmatched_data_validation_run_id_fkey" FOREIGN KEY ("validation_run_id") REFERENCES "validation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
