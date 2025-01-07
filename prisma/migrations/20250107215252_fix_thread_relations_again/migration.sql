/*
  Warnings:

  - A unique constraint covering the columns `[threadId]` on the table `Message` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Message_threadId_key" ON "Message"("threadId");
