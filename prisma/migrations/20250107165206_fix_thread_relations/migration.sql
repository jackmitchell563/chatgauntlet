/*
  Warnings:

  - You are about to drop the column `parentThreadId` on the `Message` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_parentThreadId_fkey";

-- DropIndex
DROP INDEX "Message_parentThreadId_idx";

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "parentThreadId";
