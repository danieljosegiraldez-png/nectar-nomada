-- CreateIndex
CREATE UNIQUE INDEX "assessment_blind_sample_id_evaluator_user_account_id_key" ON "sensory"."assessment"("blind_sample_id", "evaluator_user_account_id");

