-- CreateTable
CREATE TABLE "password_reset_tickets" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tickets_token_key" ON "password_reset_tickets"("token");

-- CreateIndex
CREATE INDEX "password_reset_tickets_email_idx" ON "password_reset_tickets"("email");
