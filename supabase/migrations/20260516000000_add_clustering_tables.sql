-- ============================================================
-- クラスタリング分析パイプライン用テーブル群
-- Issue #26: PCA + kmeansによる意見空間のクラスタリング
-- Issue #27: クラスター内の理由テキスト分析と要約
-- ============================================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- cluster_runs: 1回の再計算ジョブの結果メタデータ
-- ============================================================
CREATE TABLE cluster_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  n_respondents INTEGER NOT NULL,
  n_questions INTEGER NOT NULL,
  k_chosen INTEGER NOT NULL,
  silhouette_score DOUBLE PRECISION,
  pca_explained_variance JSONB NOT NULL DEFAULT '[]'::jsonb,
  pca_loadings JSONB NOT NULL DEFAULT '{}'::jsonb,
  axis_labels JSONB DEFAULT '{}'::jsonb,
  silhouette_by_k JSONB DEFAULT '{}'::jsonb,
  question_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  params JSONB DEFAULT '{}'::jsonb,
  reasons_built_at TIMESTAMPTZ
);

CREATE INDEX idx_cluster_runs_calculated_at ON cluster_runs(calculated_at DESC);

-- ============================================================
-- cluster_assignments: 各回答者のクラスタID + 2D座標
-- ============================================================
CREATE TABLE cluster_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_run_id UUID NOT NULL REFERENCES cluster_runs(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  cluster_id INTEGER NOT NULL,
  pc1 DOUBLE PRECISION NOT NULL,
  pc2 DOUBLE PRECISION NOT NULL,
  UNIQUE(cluster_run_id, session_id)
);

CREATE INDEX idx_cluster_assignments_run ON cluster_assignments(cluster_run_id);
CREATE INDEX idx_cluster_assignments_session ON cluster_assignments(session_id);

-- ============================================================
-- cluster_summaries: (cluster_run_id, cluster_id, question_id) ごとの要約
-- ============================================================
CREATE TABLE cluster_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_run_id UUID NOT NULL REFERENCES cluster_runs(id) ON DELETE CASCADE,
  cluster_id INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  summary TEXT DEFAULT '',
  diversity_score DOUBLE PRECISION,
  n_texts INTEGER NOT NULL DEFAULT 0,
  mean_in DOUBLE PRECISION,
  mean_out DOUBLE PRECISION,
  diff DOUBLE PRECISION,
  representativeness DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cluster_run_id, cluster_id, question_id)
);

CREATE INDEX idx_cluster_summaries_run ON cluster_summaries(cluster_run_id);

-- ============================================================
-- cluster_insights: 質問ごとのクラスタ横断インサイト + 軸情報
-- ============================================================
CREATE TABLE cluster_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_run_id UUID NOT NULL REFERENCES cluster_runs(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  insight_text TEXT DEFAULT '',
  dominant_axis TEXT CHECK (dominant_axis IN ('pc1', 'pc2')),
  disagreement_std DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cluster_run_id, question_id)
);

CREATE INDEX idx_cluster_insights_run ON cluster_insights(cluster_run_id);

-- ============================================================
-- answer_embeddings: 自由記述のembedding永続化
-- ============================================================
CREATE TABLE answer_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  answer_id UUID NOT NULL REFERENCES answers(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  text_hash TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(answer_id)
);

CREATE INDEX idx_answer_embeddings_text_hash ON answer_embeddings(text_hash);
CREATE INDEX idx_answer_embeddings_question ON answer_embeddings(question_id);

-- ============================================================
-- Row Level Security: 全テーブル service_role のみアクセス可
-- ============================================================
ALTER TABLE cluster_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE cluster_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE answer_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to cluster_runs" ON cluster_runs
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access to cluster_assignments" ON cluster_assignments
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access to cluster_summaries" ON cluster_summaries
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access to cluster_insights" ON cluster_insights
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access to answer_embeddings" ON answer_embeddings
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
