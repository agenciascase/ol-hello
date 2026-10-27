export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ad_accounts_catalog: {
        Row: {
          account_id: string
          currency: string | null
          name: string
          provider: string
          status: string | null
          synced_at: string
        }
        Insert: {
          account_id: string
          currency?: string | null
          name: string
          provider: string
          status?: string | null
          synced_at?: string
        }
        Update: {
          account_id?: string
          currency?: string | null
          name?: string
          provider?: string
          status?: string | null
          synced_at?: string
        }
        Relationships: []
      }
      ads_connections: {
        Row: {
          access_token_ciphertext: string
          created_at: string
          expires_at: string | null
          owner_id: string
          provider: string
          refresh_token_ciphertext: string | null
          updated_at: string
        }
        Insert: {
          access_token_ciphertext: string
          created_at?: string
          expires_at?: string | null
          owner_id: string
          provider: string
          refresh_token_ciphertext?: string | null
          updated_at?: string
        }
        Update: {
          access_token_ciphertext?: string
          created_at?: string
          expires_at?: string | null
          owner_id?: string
          provider?: string
          refresh_token_ciphertext?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      client_ad_accounts: {
        Row: {
          account_id: string
          account_name: string
          client_id: string
          created_at: string
          id: string
          provider: string
        }
        Insert: {
          account_id: string
          account_name: string
          client_id: string
          created_at?: string
          id?: string
          provider: string
        }
        Update: {
          account_id?: string
          account_name?: string
          client_id?: string
          created_at?: string
          id?: string
          provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_ad_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          goal_conversions_month: number | null
          goal_cpa: number | null
          goal_roas: number | null
          google_tax_pct: number
          meta_tax_pct: number
          monthly_budget: number | null
          active: boolean
          created_at: string
          created_by: string | null
          emails: string[]
          id: string
          logo_url: string | null
          name: string
          owner_name: string | null
          timezone: string
          updated_at: string
          whatsapp_numbers: string[]
        }
        Insert: {
          goal_conversions_month?: number | null
          goal_cpa?: number | null
          goal_roas?: number | null
          google_tax_pct?: number
          meta_tax_pct?: number
          monthly_budget?: number | null
          active?: boolean
          created_at?: string
          created_by?: string | null
          emails?: string[]
          id?: string
          logo_url?: string | null
          name: string
          owner_name?: string | null
          timezone?: string
          updated_at?: string
          whatsapp_numbers?: string[]
        }
        Update: {
          goal_conversions_month?: number | null
          goal_cpa?: number | null
          goal_roas?: number | null
          google_tax_pct?: number
          meta_tax_pct?: number
          monthly_budget?: number | null
          active?: boolean
          created_at?: string
          created_by?: string | null
          emails?: string[]
          id?: string
          logo_url?: string | null
          name?: string
          owner_name?: string | null
          timezone?: string
          updated_at?: string
          whatsapp_numbers?: string[]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          company?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      report_cache: {
        Row: {
          built_at: string
          data: Json
          report_config_id: string
        }
        Insert: {
          built_at?: string
          data: Json
          report_config_id: string
        }
        Update: {
          built_at?: string
          data?: Json
          report_config_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_cache_report_config_id_fkey"
            columns: ["report_config_id"]
            isOneToOne: true
            referencedRelation: "report_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_configs: {
        Row: {
          actions_taken: string | null
          manager_notes: string | null
          next_steps: string | null
          objective: string
          sections: string[]
          active: boolean
          campaign_filter: string | null
          campaign_ids: string[]
          campaign_mode: string
          channels: string[]
          client_id: string
          compare_previous: boolean
          created_at: string
          created_by: string | null
          id: string
          intro_message: string | null
          metrics: string[]
          name: string
          period: string
          platforms: string[]
          share_token: string | null
          updated_at: string
        }
        Insert: {
          actions_taken?: string | null
          manager_notes?: string | null
          next_steps?: string | null
          objective?: string
          sections?: string[]
          active?: boolean
          campaign_filter?: string | null
          campaign_ids?: string[]
          campaign_mode?: string
          channels?: string[]
          client_id: string
          compare_previous?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          intro_message?: string | null
          metrics?: string[]
          name: string
          period?: string
          platforms?: string[]
          share_token?: string | null
          updated_at?: string
        }
        Update: {
          actions_taken?: string | null
          manager_notes?: string | null
          next_steps?: string | null
          objective?: string
          sections?: string[]
          active?: boolean
          campaign_filter?: string | null
          campaign_ids?: string[]
          campaign_mode?: string
          channels?: string[]
          client_id?: string
          compare_previous?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          intro_message?: string | null
          metrics?: string[]
          name?: string
          period?: string
          platforms?: string[]
          share_token?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_configs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      report_deliveries: {
        Row: {
          channel: string
          error: string | null
          id: string
          recipient: string
          report_config_id: string
          report_url: string | null
          schedule_id: string | null
          sent_at: string
          status: string
          trigger: string
        }
        Insert: {
          channel: string
          error?: string | null
          id?: string
          recipient: string
          report_config_id: string
          report_url?: string | null
          schedule_id?: string | null
          sent_at?: string
          status?: string
          trigger?: string
        }
        Update: {
          channel?: string
          error?: string | null
          id?: string
          recipient?: string
          report_config_id?: string
          report_url?: string | null
          schedule_id?: string | null
          sent_at?: string
          status?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_deliveries_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "report_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_deliveries_report_config_id_fkey"
            columns: ["report_config_id"]
            isOneToOne: false
            referencedRelation: "report_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      report_schedules: {
        Row: {
          active: boolean
          created_at: string
          day_of_month: number | null
          frequency: string
          id: string
          last_run_at: string | null
          next_run_at: string | null
          report_config_id: string
          send_time: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          active?: boolean
          created_at?: string
          day_of_month?: number | null
          frequency: string
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          report_config_id: string
          send_time?: string
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          active?: boolean
          created_at?: string
          day_of_month?: number | null
          frequency?: string
          id?: string
          last_run_at?: string | null
          next_run_at?: string | null
          report_config_id?: string
          send_time?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "report_schedules_report_config_id_fkey"
            columns: ["report_config_id"]
            isOneToOne: false
            referencedRelation: "report_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      scase_live_google_shares: {
        Row: {
          created_at: string
          customer_id: string
          customer_name: string
          expires_at: string
          id: string
          owner_id: string
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          customer_name: string
          expires_at?: string
          id?: string
          owner_id: string
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          customer_name?: string
          expires_at?: string
          id?: string
          owner_id?: string
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      scase_ads_connection_get: {
        Args: { p_provider: string }
        Returns: {
          access_token_ciphertext: string
          expires_at: string
          refresh_token_ciphertext: string
        }[]
      }
      scase_ads_connection_put: {
        Args: {
          p_access_token_ciphertext: string
          p_expires_at: string
          p_provider: string
          p_refresh_token_ciphertext: string
        }
        Returns: undefined
      }
      scase_create_live_google_share: {
        Args: { p_customer_id: string; p_customer_name: string }
        Returns: string
      }
      scase_read_live_google_share: {
        Args: { p_token: string }
        Returns: {
          access_token_ciphertext: string
          customer_id: string
          customer_name: string
          expires_at: string
          refresh_token_ciphertext: string
        }[]
      }
      scase_revoke_live_google_share: {
        Args: { p_token: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "client"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "client"],
    },
  },
} as const
