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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      learning_completions: {
        Row: {
          completed_at: string
          credits_awarded: number
          id: string
          module_id: string
          score: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string
          credits_awarded: number
          id?: string
          module_id: string
          score?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string
          credits_awarded?: number
          id?: string
          module_id?: string
          score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_completions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "learning_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_modules: {
        Row: {
          created_at: string
          description: string
          id: string
          kind: string
          min_watch_seconds: number
          pass_threshold: number
          questions: Json | null
          reward: number
          sort_order: number
          title: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          kind: string
          min_watch_seconds?: number
          pass_threshold?: number
          questions?: Json | null
          reward?: number
          sort_order?: number
          title: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          kind?: string
          min_watch_seconds?: number
          pass_threshold?: number
          questions?: Json | null
          reward?: number
          sort_order?: number
          title?: string
          video_url?: string | null
        }
        Relationships: []
      }
      markets: {
        Row: {
          category_id: string | null
          closes_at: string
          created_at: string
          creator_id: string | null
          description: string | null
          id: string
          no_pool: number
          polymarket_id: string | null
          resolution: Database["public"]["Enums"]["market_resolution"] | null
          resolved_at: string | null
          source: string | null
          status: Database["public"]["Enums"]["market_status"]
          title: string
          volume: number
          yes_pool: number
        }
        Insert: {
          category_id?: string | null
          closes_at: string
          created_at?: string
          creator_id?: string | null
          description?: string | null
          id?: string
          no_pool?: number
          polymarket_id?: string | null
          resolution?: Database["public"]["Enums"]["market_resolution"] | null
          resolved_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["market_status"]
          title: string
          volume?: number
          yes_pool?: number
        }
        Update: {
          category_id?: string | null
          closes_at?: string
          created_at?: string
          creator_id?: string | null
          description?: string | null
          id?: string
          no_pool?: number
          polymarket_id?: string | null
          resolution?: Database["public"]["Enums"]["market_resolution"] | null
          resolved_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["market_status"]
          title?: string
          volume?: number
          yes_pool?: number
        }
        Relationships: [
          {
            foreignKeyName: "markets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          credits_spent: number
          id: string
          market_id: string
          no_shares: number
          user_id: string
          yes_shares: number
        }
        Insert: {
          credits_spent?: number
          id?: string
          market_id: string
          no_shares?: number
          user_id: string
          yes_shares?: number
        }
        Update: {
          credits_spent?: number
          id?: string
          market_id?: string
          no_shares?: number
          user_id?: string
          yes_shares?: number
        }
        Relationships: [
          {
            foreignKeyName: "positions_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          id: string
          market_id: string
          recorded_at: string
          yes_price: number
        }
        Insert: {
          id?: string
          market_id: string
          recorded_at?: string
          yes_price: number
        }
        Update: {
          id?: string
          market_id?: string
          recorded_at?: string
          yes_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_history_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          credits: number
          id: string
          last_daily_claim: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          credits?: number
          id: string
          last_daily_claim?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          credits?: number
          id?: string
          last_daily_claim?: string | null
          username?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          action: Database["public"]["Enums"]["trade_action"]
          created_at: string
          credits: number
          id: string
          market_id: string
          price: number
          shares: number
          side: Database["public"]["Enums"]["trade_side"]
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["trade_action"]
          created_at?: string
          credits: number
          id?: string
          market_id: string
          price: number
          shares: number
          side: Database["public"]["Enums"]["trade_side"]
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["trade_action"]
          created_at?: string
          credits?: number
          id?: string
          market_id?: string
          price?: number
          shares?: number
          side?: Database["public"]["Enums"]["trade_side"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      auto_close_markets: { Args: never; Returns: undefined }
      claim_daily_credits: { Args: never; Returns: Json }
      claim_learning_reward: {
        Args: { _module_id: string; _score: number }
        Returns: {
          credits_awarded: number
          new_balance: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      place_trade: {
        Args: {
          _credits: number
          _market_id: string
          _side: Database["public"]["Enums"]["trade_side"]
        }
        Returns: Json
      }
      resolve_market: {
        Args: {
          _market_id: string
          _resolution: Database["public"]["Enums"]["market_resolution"]
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user"
      market_resolution: "yes" | "no" | "invalid"
      market_status: "open" | "closed" | "resolved"
      trade_action: "buy" | "sell"
      trade_side: "yes" | "no"
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
  public: {
    Enums: {
      app_role: ["admin", "user"],
      market_resolution: ["yes", "no", "invalid"],
      market_status: ["open", "closed", "resolved"],
      trade_action: ["buy", "sell"],
      trade_side: ["yes", "no"],
    },
  },
} as const
