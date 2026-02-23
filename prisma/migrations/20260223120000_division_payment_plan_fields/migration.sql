-- AlterTable
ALTER TABLE "Divisions"
ADD COLUMN     "allowPaymentPlans" BOOLEAN,
ADD COLUMN     "installmentCount" INTEGER,
ADD COLUMN     "installmentDueDates" TIMESTAMP(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMP(3)[],
ADD COLUMN     "installmentAmounts" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
