-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_carId_fkey";

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'form',
ALTER COLUMN "carId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_carId_fkey" FOREIGN KEY ("carId") REFERENCES "Car"("id") ON DELETE SET NULL ON UPDATE CASCADE;
