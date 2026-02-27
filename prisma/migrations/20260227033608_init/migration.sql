-- CreateTable
CREATE TABLE "Note" (
    "id" UUID NOT NULL,
    "title" VARCHAR(120),
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" UUID,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" UUID NOT NULL,
    "name" VARCHAR(30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" UUID,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteTag" (
    "noteId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "NoteTag_pkey" PRIMARY KEY ("noteId","tagId")
);

-- CreateTable
CREATE TABLE "ReviewEvent" (
    "id" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewBatchDate" DATE NOT NULL,
    "userId" UUID,

    CONSTRAINT "ReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewBatch" (
    "id" UUID NOT NULL,
    "reviewDate" DATE NOT NULL,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewBatchItem" (
    "id" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "noteId" UUID NOT NULL,

    CONSTRAINT "ReviewBatchItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Note_userId_idx" ON "Note"("userId");

-- CreateIndex
CREATE INDEX "Note_deletedAt_idx" ON "Note"("deletedAt");

-- CreateIndex
CREATE INDEX "Note_createdAt_idx" ON "Note"("createdAt");

-- CreateIndex
CREATE INDEX "Tag_userId_idx" ON "Tag"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

-- CreateIndex
CREATE INDEX "NoteTag_tagId_idx" ON "NoteTag"("tagId");

-- CreateIndex
CREATE INDEX "ReviewEvent_noteId_idx" ON "ReviewEvent"("noteId");

-- CreateIndex
CREATE INDEX "ReviewEvent_userId_reviewBatchDate_idx" ON "ReviewEvent"("userId", "reviewBatchDate");

-- CreateIndex
CREATE INDEX "ReviewBatch_userId_idx" ON "ReviewBatch"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewBatch_userId_reviewDate_key" ON "ReviewBatch"("userId", "reviewDate");

-- CreateIndex
CREATE INDEX "ReviewBatchItem_noteId_idx" ON "ReviewBatchItem"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewBatchItem_batchId_noteId_key" ON "ReviewBatchItem"("batchId", "noteId");

-- AddForeignKey
ALTER TABLE "NoteTag" ADD CONSTRAINT "NoteTag_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteTag" ADD CONSTRAINT "NoteTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewEvent" ADD CONSTRAINT "ReviewEvent_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewBatchItem" ADD CONSTRAINT "ReviewBatchItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ReviewBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewBatchItem" ADD CONSTRAINT "ReviewBatchItem_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
