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
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_bet_invites: {
        Row: {
          created_at: string
          group_bet_id: string
          id: string
          invited_user_id: string
          status: Database["public"]["Enums"]["invite_status"]
        }
        Insert: {
          created_at?: string
          group_bet_id: string
          id?: string
          invited_user_id: string
          status?: Database["public"]["Enums"]["invite_status"]
        }
        Update: {
          created_at?: string
          group_bet_id?: string
          id?: string
          invited_user_id?: string
          status?: Database["public"]["Enums"]["invite_status"]
        }
        Relationships: [
          {
            foreignKeyName: "group_bet_invites_group_bet_id_fkey"
            columns: ["group_bet_id"]
            isOneToOne: false
            referencedRelation: "group_bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bet_invites_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_bet_participants: {
        Row: {
          created_at: string
          credits_wagered: number
          group_bet_id: string
          id: string
          payout: number | null
          side: Database["public"]["Enums"]["trade_side"]
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_wagered: number
          group_bet_id: string
          id?: string
          payout?: number | null
          side: Database["public"]["Enums"]["trade_side"]
          user_id: string
        }
        Update: {
          created_at?: string
          credits_wagered?: number
          group_bet_id?: string
          id?: string
          payout?: number | null
          side?: Database["public"]["Enums"]["trade_side"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_bet_participants_group_bet_id_fkey"
            columns: ["group_bet_id"]
            isOneToOne: false
            referencedRelation: "group_bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bet_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_bets: {
        Row: {
          closes_at: string
          created_at: string
          creator_id: string
          description: string | null
          id: string
          resolution: Database["public"]["Enums"]["group_bet_resolution"] | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["group_bet_status"]
          title: string
        }
        Insert: {
          closes_at: string
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          resolution?:
            | Database["public"]["Enums"]["group_bet_resolution"]
            | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["group_bet_status"]
          title: string
        }
        Update: {
          closes_at?: string
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          resolution?:
            | Database["public"]["Enums"]["group_bet_resolution"]
            | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["group_bet_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_bets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      market_suggestions: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_summary: string | null
          status: Database["public"]["Enums"]["suggestion_status"]
          suggested_closes_at: string
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_summary?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          suggested_closes_at: string
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_summary?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          suggested_closes_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_suggestions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          category_id: string | null
          closes_at: string
          created_at: string
          created_via: Database["public"]["Enums"]["market_origin"]
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
          created_via?: Database["public"]["Enums"]["market_origin"]
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
          created_via?: Database["public"]["Enums"]["market_origin"]
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
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
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
          bio: string | null
          created_at: string
          credits: number
          id: string
          last_daily_claim: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          credits?: number
          id: string
          last_daily_claim?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
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
      approve_market_suggestion: {
        Args: {
          _category_id?: string
          _closes_at?: string
          _description?: string
          _suggestion_id: string
          _title?: string
        }
        Returns: string
      }
      auto_close_markets: { Args: never; Returns: undefined }
      claim_daily_credits: { Args: never; Returns: Json }
      claim_learning_reward: {
        Args: { _module_id: string; _score: number }
        Returns: {
          credits_awarded: number
          new_balance: number
        }[]
      }
      create_group_bet: {
        Args: {
          _closes_at: string
          _description: string
          _friend_ids: string[]
          _title: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_group_bet_member: {
        Args: { _bet_id: string; _user_id: string }
        Returns: boolean
      }
      join_group_bet: {
        Args: {
          _credits: number
          _group_bet_id: string
          _side: Database["public"]["Enums"]["trade_side"]
        }
        Returns: undefined
      }
      mark_all_notifications_read: { Args: never; Returns: undefined }
      mark_notification_read: { Args: { _id: string }; Returns: undefined }
      place_trade: {
        Args: {
          p_action: Database["public"]["Enums"]["trade_action"]
          p_credits: number
          p_market_id: string
          p_side: Database["public"]["Enums"]["trade_side"]
        }
        Returns: Json
      }
      reject_market_suggestion: {
        Args: { _suggestion_id: string }
        Returns: undefined
      }
      remove_friend: { Args: { _friendship_id: string }; Returns: undefined }
      resolve_group_bet: {
        Args: {
          _group_bet_id: string
          _resolution: Database["public"]["Enums"]["group_bet_resolution"]
        }
        Returns: undefined
      }
      resolve_market: {
        Args: {
          _market_id: string
          _resolution: Database["public"]["Enums"]["market_resolution"]
        }
        Returns: Json
      }
      respond_to_friend_request: {
        Args: { _accept: boolean; _friendship_id: string }
        Returns: undefined
      }
      send_friend_request: { Args: { _addressee_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "user"
      friendship_status: "pending" | "accepted" | "declined"
      group_bet_resolution: "yes" | "no" | "invalid"
      group_bet_status: "open" | "closed" | "resolved"
      invite_status: "pending" | "accepted" | "declined"
      market_origin:
        | "user"
        | "polymarket_import"
        | "ai_suggested"
        | "ai_generated"
      market_resolution: "yes" | "no" | "invalid"
      market_status: "open" | "closed" | "resolved"
      suggestion_status: "pending" | "approved" | "rejected"
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
      friendship_status: ["pending", "accepted", "declined"],
      group_bet_resolution: ["yes", "no", "invalid"],
      group_bet_status: ["open", "closed", "resolved"],
      invite_status: ["pending", "accepted", "declined"],
      market_origin: [
        "user",
        "polymarket_import",
        "ai_suggested",
        "ai_generated",
      ],
      market_resolution: ["yes", "no", "invalid"],
      market_status: ["open", "closed", "resolved"],
      suggestion_status: ["pending", "approved", "rejected"],
      trade_action: ["buy", "sell"],
      trade_side: ["yes", "no"],
    },
  },
} as const
