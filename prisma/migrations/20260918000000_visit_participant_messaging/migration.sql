-- Existing IDs, messages and read cursors are preserved. No historical coverage is invented.
CREATE TYPE "ConversationScope" AS ENUM ('BOOKING', 'COVERAGE_VISIT');
ALTER TABLE "Visit" ADD COLUMN "assignmentRevision" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_assignmentRevision_positive" CHECK ("assignmentRevision" > 0);
CREATE UNIQUE INDEX "Visit_id_bookingId_key" ON "Visit"("id", "bookingId");
ALTER TABLE "Conversation" ADD COLUMN "scope" "ConversationScope" NOT NULL DEFAULT 'BOOKING',
 ADD COLUMN "visitId" TEXT, ADD COLUMN "coverageSitterId" TEXT, ADD COLUMN "assignmentRevision" INTEGER;
DROP INDEX "Conversation_bookingId_key";
CREATE UNIQUE INDEX "Conversation_booking_scope_key" ON "Conversation"("bookingId") WHERE "scope" = 'BOOKING';
CREATE UNIQUE INDEX "Conversation_visitId_assignmentRevision_key" ON "Conversation"("visitId", "assignmentRevision");
CREATE INDEX "Conversation_bookingId_scope_idx" ON "Conversation"("bookingId", "scope");
CREATE INDEX "Conversation_coverageSitterId_idx" ON "Conversation"("coverageSitterId");
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_scope_context" CHECK (
 ("scope" = 'BOOKING' AND "visitId" IS NULL AND "coverageSitterId" IS NULL AND "assignmentRevision" IS NULL) OR
 ("scope" = 'COVERAGE_VISIT' AND "visitId" IS NOT NULL AND "coverageSitterId" IS NOT NULL AND "assignmentRevision" IS NOT NULL AND "assignmentRevision" > 0));
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_visitId_bookingId_fkey" FOREIGN KEY ("visitId", "bookingId") REFERENCES "Visit"("id", "bookingId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_coverageSitterId_fkey" FOREIGN KEY ("coverageSitterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Central enforcement covers updateMany, ordinary assignment, handoff and repair SQL.
-- Callers never increment independently. Same-sitter writes/replays cannot rotate tenure.
CREATE FUNCTION taskwhisker_visit_assignment_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW."sitterId" IS DISTINCT FROM OLD."sitterId" THEN
  NEW."assignmentRevision" := OLD."assignmentRevision" + 1;
 ELSE
  NEW."assignmentRevision" := OLD."assignmentRevision";
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Visit_assignment_revision" BEFORE UPDATE OF "sitterId", "assignmentRevision" ON "Visit"
 FOR EACH ROW EXECUTE FUNCTION taskwhisker_visit_assignment_revision();
CREATE FUNCTION taskwhisker_coverage_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' THEN
  IF ROW(NEW."scope", NEW."bookingId", NEW."visitId", NEW."coverageSitterId", NEW."assignmentRevision") IS DISTINCT FROM
     ROW(OLD."scope", OLD."bookingId", OLD."visitId", OLD."coverageSitterId", OLD."assignmentRevision") THEN
   RAISE EXCEPTION 'Conversation identity is immutable' USING ERRCODE = '23514';
  END IF;
 ELSIF NEW."scope" = 'COVERAGE_VISIT' THEN
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE id = NEW."coverageSitterId" AND role = 'SITTER') THEN
   RAISE EXCEPTION 'Coverage requires a sitter' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Visit" WHERE id = NEW."visitId" AND "bookingId" = NEW."bookingId"
    AND "sitterId" = NEW."coverageSitterId" AND "assignmentRevision" = NEW."assignmentRevision") THEN
   RAISE EXCEPTION 'Coverage requires current assignment tenure' USING ERRCODE = '23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Conversation_coverage_identity" BEFORE INSERT OR UPDATE ON "Conversation"
 FOR EACH ROW EXECUTE FUNCTION taskwhisker_coverage_identity();
-- A delivered timestamp is an unambiguous watermark within a coverage thread.
-- The lock is held until commit, so even concurrent/direct inserts cannot arrive
-- behind a cursor. Historical BOOKING timestamps are deliberately unchanged.
CREATE FUNCTION taskwhisker_coverage_message_clock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE thread_scope "ConversationScope"; last_created TIMESTAMP(3);
BEGIN
 SELECT scope INTO thread_scope FROM "Conversation" WHERE id = NEW."conversationId" FOR UPDATE;
 IF thread_scope = 'COVERAGE_VISIT' THEN
  SELECT max("createdAt") INTO last_created FROM "Message" WHERE "conversationId" = NEW."conversationId";
  NEW."createdAt" := GREATEST(clock_timestamp()::timestamp(3), last_created + interval '1 millisecond');
  IF NEW."senderUserId" IS NULL OR NEW."senderType" NOT IN ('SITTER', 'OPERATOR') OR
     NOT EXISTS (SELECT 1 FROM "User" WHERE id = NEW."senderUserId" AND role::text = NEW."senderType"::text) THEN
   RAISE EXCEPTION 'Coverage requires authenticated sender identity' USING ERRCODE = '23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Message_coverage_clock" BEFORE INSERT ON "Message"
 FOR EACH ROW EXECUTE FUNCTION taskwhisker_coverage_message_clock();
