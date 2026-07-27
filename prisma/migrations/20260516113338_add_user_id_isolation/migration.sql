/*
  Warnings:

  - Added the required column `user_id` to the `dsa_data` table without a default value. This is not possible if the table is not empty.
  - Added the required column `user_id` to the `validation_runs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "admin_data" ADD COLUMN     "selected_month" DATE,
ADD COLUMN     "sheet_name" VARCHAR(100),
ALTER COLUMN "sp_percent" SET DATA TYPE DECIMAL(15,4);

-- AlterTable
ALTER TABLE "dsa_data" ADD COLUMN     "selected_month" DATE,
ADD COLUMN     "sheet_name" VARCHAR(100),
ADD COLUMN     "user_id" UUID NOT NULL,
ALTER COLUMN "sp_percent" SET DATA TYPE DECIMAL(15,4),
ALTER COLUMN "dsa_percent" SET DATA TYPE DECIMAL(15,4);

-- AlterTable
ALTER TABLE "unmatched_data" ADD COLUMN     "sheet_name" VARCHAR(100);

-- AlterTable
ALTER TABLE "validated_data" ADD COLUMN     "sheet_name" VARCHAR(100);

-- AlterTable
ALTER TABLE "validation_runs" ADD COLUMN     "user_id" UUID NOT NULL;

-- CreateIndex
CREATE INDEX "dsa_data_user_id_idx" ON "dsa_data"("user_id");

-- CreateIndex
CREATE INDEX "dsa_data_user_id_month_idx" ON "dsa_data"("user_id", "month");

-- CreateIndex
CREATE INDEX "validation_runs_user_id_idx" ON "validation_runs"("user_id");

-- AddForeignKey
ALTER TABLE "dsa_data" ADD CONSTRAINT "dsa_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
