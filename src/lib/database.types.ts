export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      answer_embeddings: {
        Row: {
          answer_id: string
          created_at: string | null
          embedding: string
          id: string
          model: string
          question_id: string
          session_id: string
          text_hash: string
        }
        Insert: {
          answer_id: string
          created_at?: string | null
          embedding: string
          id?: string
          model?: string
          question_id: string
          session_id: string
          text_hash: string
        }
        Update: {
          answer_id?: string
          created_at?: string | null
          embedding?: string
          id?: string
          model?: string
          question_id?: string
          session_id?: string
          text_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "answer_embeddings_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: true
            referencedRelation: "answers"
            referencedColumns: ["id"]
          },
        ]
      }
      answers: {
        Row: {
          created_at: string | null
          freetext: string | null
          id: string
          is_followup: boolean | null
          likert: string | null
          question_id: string
          question_text: string | null
          session_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          freetext?: string | null
          id?: string
          is_followup?: boolean | null
          likert?: string | null
          question_id: string
          question_text?: string | null
          session_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          freetext?: string | null
          id?: string
          is_followup?: boolean | null
          likert?: string | null
          question_id?: string
          question_text?: string | null
          session_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      cluster_assignments: {
        Row: {
          cluster_id: number
          cluster_run_id: string
          id: string
          pc1: number
          pc2: number
          session_id: string
        }
        Insert: {
          cluster_id: number
          cluster_run_id: string
          id?: string
          pc1: number
          pc2: number
          session_id: string
        }
        Update: {
          cluster_id?: number
          cluster_run_id?: string
          id?: string
          pc1?: number
          pc2?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cluster_assignments_cluster_run_id_fkey"
            columns: ["cluster_run_id"]
            isOneToOne: false
            referencedRelation: "cluster_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cluster_assignments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      cluster_insights: {
        Row: {
          cluster_run_id: string
          created_at: string | null
          disagreement_std: number | null
          dominant_axis: string | null
          id: string
          insight_text: string | null
          question_id: string
        }
        Insert: {
          cluster_run_id: string
          created_at?: string | null
          disagreement_std?: number | null
          dominant_axis?: string | null
          id?: string
          insight_text?: string | null
          question_id: string
        }
        Update: {
          cluster_run_id?: string
          created_at?: string | null
          disagreement_std?: number | null
          dominant_axis?: string | null
          id?: string
          insight_text?: string | null
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cluster_insights_cluster_run_id_fkey"
            columns: ["cluster_run_id"]
            isOneToOne: false
            referencedRelation: "cluster_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      cluster_runs: {
        Row: {
          axis_labels: Json | null
          calculated_at: string | null
          id: string
          k_chosen: number
          n_questions: number
          n_respondents: number
          params: Json | null
          pca_explained_variance: Json
          pca_loadings: Json
          question_ids: Json
          reasons_built_at: string | null
          silhouette_by_k: Json | null
          silhouette_score: number | null
        }
        Insert: {
          axis_labels?: Json | null
          calculated_at?: string | null
          id?: string
          k_chosen: number
          n_questions: number
          n_respondents: number
          params?: Json | null
          pca_explained_variance?: Json
          pca_loadings?: Json
          question_ids?: Json
          reasons_built_at?: string | null
          silhouette_by_k?: Json | null
          silhouette_score?: number | null
        }
        Update: {
          axis_labels?: Json | null
          calculated_at?: string | null
          id?: string
          k_chosen?: number
          n_questions?: number
          n_respondents?: number
          params?: Json | null
          pca_explained_variance?: Json
          pca_loadings?: Json
          question_ids?: Json
          reasons_built_at?: string | null
          silhouette_by_k?: Json | null
          silhouette_score?: number | null
        }
        Relationships: []
      }
      cluster_summaries: {
        Row: {
          cluster_id: number
          cluster_run_id: string
          created_at: string | null
          diff: number | null
          diversity_score: number | null
          id: string
          mean_in: number | null
          mean_out: number | null
          n_texts: number
          question_id: string
          representativeness: number | null
          summary: string | null
        }
        Insert: {
          cluster_id: number
          cluster_run_id: string
          created_at?: string | null
          diff?: number | null
          diversity_score?: number | null
          id?: string
          mean_in?: number | null
          mean_out?: number | null
          n_texts?: number
          question_id: string
          representativeness?: number | null
          summary?: string | null
        }
        Update: {
          cluster_id?: number
          cluster_run_id?: string
          created_at?: string | null
          diff?: number | null
          diversity_score?: number | null
          id?: string
          mean_in?: number | null
          mean_out?: number | null
          n_texts?: number
          question_id?: string
          representativeness?: number | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cluster_summaries_cluster_run_id_fkey"
            columns: ["cluster_run_id"]
            isOneToOne: false
            referencedRelation: "cluster_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          email: string
          id: number
        }
        Insert: {
          created_at?: string
          email: string
          id?: never
        }
        Update: {
          created_at?: string
          email?: string
          id?: never
        }
        Relationships: []
      }
      llm_cache: {
        Row: {
          cache_key: string
          created_at: string | null
          model: string
          request_body: Json
          response: string
        }
        Insert: {
          cache_key: string
          created_at?: string | null
          model?: string
          request_body: Json
          response: string
        }
        Update: {
          cache_key?: string
          created_at?: string | null
          model?: string
          request_body?: Json
          response?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          additional_comments: string | null
          completed_at: string | null
          created_at: string | null
          id: string
          interest_level: number | null
          interest_other_text: string | null
          interest_reasons: Json | null
          page_completed: number | null
          session_id: string
          updated_at: string | null
          user_agent: string | null
        }
        Insert: {
          additional_comments?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          interest_level?: number | null
          interest_other_text?: string | null
          interest_reasons?: Json | null
          page_completed?: number | null
          session_id: string
          updated_at?: string | null
          user_agent?: string | null
        }
        Update: {
          additional_comments?: string | null
          completed_at?: string | null
          created_at?: string | null
          id?: string
          interest_level?: number | null
          interest_other_text?: string | null
          interest_reasons?: Json | null
          page_completed?: number | null
          session_id?: string
          updated_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

