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
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          details: Json
          id: string
          target_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          blocked_by: string | null
          created_at: string
          decline_count: number
          id: string
          requester_id: string
          status: Database["public"]["Enums"]["friendship_status"]
          updated_at: string
        }
        Insert: {
          addressee_id: string
          blocked_by?: string | null
          created_at?: string
          decline_count?: number
          id?: string
          requester_id: string
          status?: Database["public"]["Enums"]["friendship_status"]
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          blocked_by?: string | null
          created_at?: string
          decline_count?: number
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
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bet_invites_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bet_invites_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bet_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bet_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_bet_resolution_votes: {
        Row: {
          created_at: string
          group_bet_id: string
          id: string
          proposed_resolution: Database["public"]["Enums"]["group_bet_resolution"]
          reason: string
          updated_at: string
          voter_id: string
        }
        Insert: {
          created_at?: string
          group_bet_id: string
          id?: string
          proposed_resolution: Database["public"]["Enums"]["group_bet_resolution"]
          reason: string
          updated_at?: string
          voter_id: string
        }
        Update: {
          created_at?: string
          group_bet_id?: string
          id?: string
          proposed_resolution?: Database["public"]["Enums"]["group_bet_resolution"]
          reason?: string
          updated_at?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_bet_resolution_votes_group_bet_id_fkey"
            columns: ["group_bet_id"]
            isOneToOne: false
            referencedRelation: "group_bets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bet_resolution_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bet_resolution_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bet_resolution_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_bets: {
        Row: {
          auto_checked_at: string | null
          auto_resolution_deadline: string | null
          auto_resolved: boolean
          closes_at: string
          created_at: string
          creator_id: string
          description: string | null
          id: string
          proposed_resolution:
            | Database["public"]["Enums"]["group_bet_resolution"]
            | null
          resolution: Database["public"]["Enums"]["group_bet_resolution"] | null
          resolution_method: string | null
          resolution_reason: string | null
          resolution_source: string | null
          resolved_at: string | null
          status: Database["public"]["Enums"]["group_bet_status"]
          title: string
          voting_started_at: string | null
        }
        Insert: {
          auto_checked_at?: string | null
          auto_resolution_deadline?: string | null
          auto_resolved?: boolean
          closes_at: string
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          proposed_resolution?:
            | Database["public"]["Enums"]["group_bet_resolution"]
            | null
          resolution?:
            | Database["public"]["Enums"]["group_bet_resolution"]
            | null
          resolution_method?: string | null
          resolution_reason?: string | null
          resolution_source?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["group_bet_status"]
          title: string
          voting_started_at?: string | null
        }
        Update: {
          auto_checked_at?: string | null
          auto_resolution_deadline?: string | null
          auto_resolved?: boolean
          closes_at?: string
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          proposed_resolution?:
            | Database["public"]["Enums"]["group_bet_resolution"]
            | null
          resolution?:
            | Database["public"]["Enums"]["group_bet_resolution"]
            | null
          resolution_method?: string | null
          resolution_reason?: string | null
          resolution_source?: string | null
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["group_bet_status"]
          title?: string
          voting_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_bets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_bets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learn_achievement_awards: {
        Row: {
          achievement_key: string
          credits_awarded: number
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          achievement_key: string
          credits_awarded?: number
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          achievement_key?: string
          credits_awarded?: number
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learn_achievement_awards_achievement_key_fkey"
            columns: ["achievement_key"]
            isOneToOne: false
            referencedRelation: "learn_achievements"
            referencedColumns: ["key"]
          },
        ]
      }
      learn_achievements: {
        Row: {
          category: string
          credits: number
          key: string
          name: string
          requirement: string
          sort_order: number
        }
        Insert: {
          category: string
          credits?: number
          key: string
          name: string
          requirement: string
          sort_order?: number
        }
        Update: {
          category?: string
          credits?: number
          key?: string
          name?: string
          requirement?: string
          sort_order?: number
        }
        Relationships: []
      }
      learn_articles: {
        Row: {
          body: string
          created_at: string
          id: string
          level: string
          part: number
          part_name: string
          read_minutes: number
          reward: number
          slug: string
          sort_order: number
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          level: string
          part: number
          part_name: string
          read_minutes?: number
          reward?: number
          slug: string
          sort_order?: number
          status?: string
          summary?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          level?: string
          part?: number
          part_name?: string
          read_minutes?: number
          reward?: number
          slug?: string
          sort_order?: number
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      learn_attempts: {
        Row: {
          article_id: string
          attempt_number: number
          created_at: string
          credits_awarded: number
          id: string
          passed: boolean
          question_set: string
          score: number
          total: number
          user_id: string
        }
        Insert: {
          article_id: string
          attempt_number: number
          created_at?: string
          credits_awarded?: number
          id?: string
          passed?: boolean
          question_set: string
          score?: number
          total?: number
          user_id: string
        }
        Update: {
          article_id?: string
          attempt_number?: number
          created_at?: string
          credits_awarded?: number
          id?: string
          passed?: boolean
          question_set?: string
          score?: number
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learn_attempts_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "learn_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      learn_questions: {
        Row: {
          article_id: string
          correct_option_id: string
          created_at: string
          explanation: string
          id: string
          options: Json
          prompt: string
          question_set: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          article_id: string
          correct_option_id: string
          created_at?: string
          explanation?: string
          id?: string
          options?: Json
          prompt: string
          question_set: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          article_id?: string
          correct_option_id?: string
          created_at?: string
          explanation?: string
          id?: string
          options?: Json
          prompt?: string
          question_set?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learn_questions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "learn_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_suggestions: {
        Row: {
          attribute_publicly: boolean | null
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_summary: string | null
          status: Database["public"]["Enums"]["suggestion_status"]
          suggested_by: string | null
          suggested_closes_at: string
          title: string
          updated_at: string
          user_text: string | null
        }
        Insert: {
          attribute_publicly?: boolean | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_summary?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          suggested_by?: string | null
          suggested_closes_at: string
          title: string
          updated_at?: string
          user_text?: string | null
        }
        Update: {
          attribute_publicly?: boolean | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_summary?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          suggested_by?: string | null
          suggested_closes_at?: string
          title?: string
          updated_at?: string
          user_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "market_suggestions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_suggestions_suggested_by_fkey"
            columns: ["suggested_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_suggestions_suggested_by_fkey"
            columns: ["suggested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_suggestions_suggested_by_fkey"
            columns: ["suggested_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_theme_tags: {
        Row: {
          created_at: string
          id: string
          market_id: string
          theme_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          market_id: string
          theme_id: string
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string
          theme_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_theme_tags_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "markets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_theme_tags_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "market_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      market_themes: {
        Row: {
          category_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_themes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      markets: {
        Row: {
          attributed_publicly: boolean
          auto_checked_at: string | null
          auto_resolution_deadline: string | null
          auto_resolved: boolean
          category_id: string | null
          closes_at: string
          created_at: string
          created_via: Database["public"]["Enums"]["market_origin"]
          creator_id: string | null
          description: string | null
          event_mutually_exclusive: boolean | null
          group_item_title: string | null
          id: string
          needs_manual_resolution: boolean
          no_pool: number
          polymarket_clob_token_id: string | null
          polymarket_event_id: string | null
          polymarket_event_slug: string | null
          polymarket_event_title: string | null
          polymarket_id: string | null
          polymarket_neg_risk_id: string | null
          proposed_resolution:
            | Database["public"]["Enums"]["market_resolution"]
            | null
          resolution: Database["public"]["Enums"]["market_resolution"] | null
          resolution_method: string | null
          resolution_reason: string | null
          resolved_at: string | null
          source: string | null
          status: Database["public"]["Enums"]["market_status"]
          suggested_by: string | null
          title: string
          upstream_outcome_count: number | null
          volume: number
          yes_pool: number
        }
        Insert: {
          attributed_publicly?: boolean
          auto_checked_at?: string | null
          auto_resolution_deadline?: string | null
          auto_resolved?: boolean
          category_id?: string | null
          closes_at: string
          created_at?: string
          created_via?: Database["public"]["Enums"]["market_origin"]
          creator_id?: string | null
          description?: string | null
          event_mutually_exclusive?: boolean | null
          group_item_title?: string | null
          id?: string
          needs_manual_resolution?: boolean
          no_pool?: number
          polymarket_clob_token_id?: string | null
          polymarket_event_id?: string | null
          polymarket_event_slug?: string | null
          polymarket_event_title?: string | null
          polymarket_id?: string | null
          polymarket_neg_risk_id?: string | null
          proposed_resolution?:
            | Database["public"]["Enums"]["market_resolution"]
            | null
          resolution?: Database["public"]["Enums"]["market_resolution"] | null
          resolution_method?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["market_status"]
          suggested_by?: string | null
          title: string
          upstream_outcome_count?: number | null
          volume?: number
          yes_pool?: number
        }
        Update: {
          attributed_publicly?: boolean
          auto_checked_at?: string | null
          auto_resolution_deadline?: string | null
          auto_resolved?: boolean
          category_id?: string | null
          closes_at?: string
          created_at?: string
          created_via?: Database["public"]["Enums"]["market_origin"]
          creator_id?: string | null
          description?: string | null
          event_mutually_exclusive?: boolean | null
          group_item_title?: string | null
          id?: string
          needs_manual_resolution?: boolean
          no_pool?: number
          polymarket_clob_token_id?: string | null
          polymarket_event_id?: string | null
          polymarket_event_slug?: string | null
          polymarket_event_title?: string | null
          polymarket_id?: string | null
          polymarket_neg_risk_id?: string | null
          proposed_resolution?:
            | Database["public"]["Enums"]["market_resolution"]
            | null
          resolution?: Database["public"]["Enums"]["market_resolution"] | null
          resolution_method?: string | null
          resolution_reason?: string | null
          resolved_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["market_status"]
          suggested_by?: string | null
          title?: string
          upstream_outcome_count?: number | null
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
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_suggested_by_fkey"
            columns: ["suggested_by"]
            isOneToOne: false
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_suggested_by_fkey"
            columns: ["suggested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "markets_suggested_by_fkey"
            columns: ["suggested_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
          realized_pnl: number
          user_id: string
          yes_shares: number
        }
        Insert: {
          credits_spent?: number
          id?: string
          market_id: string
          no_shares?: number
          realized_pnl?: number
          user_id: string
          yes_shares?: number
        }
        Update: {
          credits_spent?: number
          id?: string
          market_id?: string
          no_shares?: number
          realized_pnl?: number
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
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
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
          articles_passed: number
          attribute_suggestions_publicly: boolean
          avatar_url: string | null
          bio: string | null
          claim_streak: number
          created_at: string
          credits: number
          first_attempt_passes: number
          id: string
          last_daily_claim: string | null
          peak_net_worth: number
          perfect_quizzes: number
          trading_history_public: boolean
          username: string
        }
        Insert: {
          articles_passed?: number
          attribute_suggestions_publicly?: boolean
          avatar_url?: string | null
          bio?: string | null
          claim_streak?: number
          created_at?: string
          credits?: number
          first_attempt_passes?: number
          id: string
          last_daily_claim?: string | null
          peak_net_worth?: number
          perfect_quizzes?: number
          trading_history_public?: boolean
          username: string
        }
        Update: {
          articles_passed?: number
          attribute_suggestions_publicly?: boolean
          avatar_url?: string | null
          bio?: string | null
          claim_streak?: number
          created_at?: string
          credits?: number
          first_attempt_passes?: number
          id?: string
          last_daily_claim?: string | null
          peak_net_worth?: number
          perfect_quizzes?: number
          trading_history_public?: boolean
          username?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referred_id: string
          referrer_id: string
          reward_credited: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          referred_id: string
          referrer_id: string
          reward_credited?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          referred_id?: string
          referrer_id?: string
          reward_credited?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: true
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trades: {
        Row: {
          action: Database["public"]["Enums"]["trade_action"]
          created_at: string
          credits: number
          id: string
          market_id: string
          price: number
          realized_gain: number | null
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
          realized_gain?: number | null
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
          realized_gain?: number | null
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
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trades_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_milestones: {
        Row: {
          id: string
          reached_at: string
          tier: number
          user_id: string
        }
        Insert: {
          id?: string
          reached_at?: string
          tier: number
          user_id: string
        }
        Update: {
          id?: string
          reached_at?: string
          tier?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_milestones_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "leaderboard_net_worth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_milestones_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_milestones_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          granted_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      leaderboard_net_worth: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          credits: number | null
          id: string | null
          net_worth: number | null
          peak_net_worth: number | null
          position_value: number | null
          username: string | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          id: string | null
          peak_net_worth: number | null
          trading_history_public: boolean | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          id?: string | null
          peak_net_worth?: number | null
          trading_history_public?: boolean | null
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          id?: string | null
          peak_net_worth?: number | null
          trading_history_public?: boolean | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_activity_series: {
        Args: { _days?: number }
        Returns: {
          day: string
          group_bets: number
          referral_credits: number
          signups: number
          trade_volume: number
          trades: number
        }[]
      }
      admin_audit_list: {
        Args: { _limit?: number }
        Returns: {
          action: string
          admin_id: string
          admin_username: string
          created_at: string
          details: Json
          id: string
          target_id: string
          target_username: string
        }[]
      }
      admin_grant_admin: { Args: { _target_id: string }; Returns: undefined }
      admin_learn_articles: {
        Args: never
        Returns: {
          id: string
          level: string
          part: number
          part_name: string
          passes: number
          questions_a: number
          questions_b: number
          read_minutes: number
          reward: number
          slug: string
          sort_order: number
          status: string
          summary: string
          title: string
          updated_at: string
        }[]
      }
      admin_list_admins: {
        Args: never
        Returns: {
          avatar_url: string
          granted_at: string
          user_id: string
          username: string
        }[]
      }
      admin_list_users: {
        Args: { _limit?: number; _offset?: number; _search?: string }
        Returns: {
          created_at: string
          credits: number
          email_confirmed: boolean
          id: string
          is_admin: boolean
          net_worth: number
          total_count: number
          username: string
        }[]
      }
      admin_log_learn_action: {
        Args: { _action: string; _article_id: string; _details: Json }
        Returns: undefined
      }
      admin_markets_needing_resolution: {
        Args: never
        Returns: {
          auto_resolution_deadline: string
          closes_at: string
          created_via: string
          holders: number
          id: string
          needs_manual_resolution: boolean
          proposed_resolution: string
          resolution_reason: string
          title: string
          volume: number
          waiting_hours: number
        }[]
      }
      admin_prunable_markets: {
        Args: never
        Returns: {
          closes_at: string
          created_at: string
          id: string
          title: string
        }[]
      }
      admin_prune_markets: { Args: { _ids: string[] }; Returns: Json }
      admin_revoke_admin: { Args: { _target_id: string }; Returns: undefined }
      admin_user_overview: { Args: { _user_id: string }; Returns: Json }
      admin_user_positions: {
        Args: { _user_id: string }
        Returns: {
          credits_spent: number
          market_id: string
          market_status: string
          market_title: string
          no_shares: number
          realized_pnl: number
          resolution: string
          yes_shares: number
        }[]
      }
      admin_user_trades: {
        Args: { _limit?: number; _user_id: string }
        Returns: {
          action: string
          created_at: string
          credits: number
          id: string
          market_id: string
          market_title: string
          price: number
          shares: number
          side: string
        }[]
      }
      approve_market_suggestion: {
        Args: {
          _category_id?: string
          _closes_at?: string
          _description?: string
          _probability?: number
          _suggestion_id: string
          _title?: string
        }
        Returns: string
      }
      auto_close_markets: { Args: never; Returns: undefined }
      block_user: { Args: { _user_id: string }; Returns: undefined }
      buy_shares: {
        Args: {
          p_market_id: string
          p_shares: number
          p_side: Database["public"]["Enums"]["trade_side"]
        }
        Returns: Json
      }
      check_learn_achievements: { Args: { _user_id: string }; Returns: Json }
      claim_daily_credits: { Args: never; Returns: Json }
      claim_referral_reward: { Args: never; Returns: Json }
      create_group_bet: {
        Args: {
          _closes_at: string
          _description: string
          _friend_ids: string[]
          _resolution_source?: string
          _title: string
        }
        Returns: string
      }
      current_net_worth: { Args: { _user_id: string }; Returns: number }
      finalize_group_bet: {
        Args: {
          _auto: boolean
          _group_bet_id: string
          _method?: string
          _reason: string
          _resolution: Database["public"]["Enums"]["group_bet_resolution"]
        }
        Returns: undefined
      }
      finalize_group_bet_voting_deadlines: { Args: never; Returns: number }
      finalize_market_resolution: {
        Args: {
          _auto: boolean
          _market_id: string
          _method: string
          _reason: string
          _resolution: Database["public"]["Enums"]["market_resolution"]
        }
        Returns: undefined
      }
      finalize_pending_auto_resolutions: { Args: never; Returns: number }
      finalize_pending_market_resolutions: { Args: never; Returns: number }
      flag_auto_resolution: {
        Args: { _group_bet_id: string }
        Returns: undefined
      }
      flag_market_resolution: {
        Args: { _market_id: string }
        Returns: undefined
      }
      get_market_activity: {
        Args: { _limit?: number; _market_id: string }
        Returns: {
          action: Database["public"]["Enums"]["trade_action"]
          avatar_url: string
          created_at: string
          credits: number
          current_yes_price: number
          id: string
          market_id: string
          market_resolution: Database["public"]["Enums"]["market_resolution"]
          market_status: Database["public"]["Enums"]["market_status"]
          market_title: string
          price: number
          realized_gain: number
          shares: number
          side: Database["public"]["Enums"]["trade_side"]
          user_id: string
          username: string
        }[]
      }
      get_public_group_bet_preview: {
        Args: { _group_bet_id: string }
        Returns: {
          closes_at: string
          creator_username: string
          description: string
          id: string
          title: string
        }[]
      }
      get_public_trading_history: { Args: { _user_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_blocked_with: { Args: { _other: string }; Returns: boolean }
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
      join_group_bet_via_link: {
        Args: { _group_bet_id: string; _sharer_username: string }
        Returns: undefined
      }
      mark_all_notifications_read: { Args: never; Returns: undefined }
      mark_notification_read: { Args: { _id: string }; Returns: undefined }
      milestone_tiers: { Args: never; Returns: number[] }
      my_pending_group_bet_votes: {
        Args: never
        Returns: {
          closes_at: string
          description: string
          eligible: number
          id: string
          title: string
          votes_cast: number
          voting_started_at: string
        }[]
      }
      notify_admins: {
        Args: { _actor: string; _kind: string; _payload: Json }
        Returns: undefined
      }
      open_group_bet_voting: { Args: never; Returns: number }
      propose_group_bet_resolution: {
        Args: {
          _group_bet_id: string
          _reason: string
          _resolution: Database["public"]["Enums"]["group_bet_resolution"]
        }
        Returns: Json
      }
      reject_market_suggestion: {
        Args: { _reason?: string; _suggestion_id: string }
        Returns: undefined
      }
      remove_friend: { Args: { _friendship_id: string }; Returns: undefined }
      require_admin: { Args: never; Returns: string }
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
      search_users: {
        Args: { _q: string }
        Returns: {
          avatar_url: string
          friendship_id: string
          id: string
          rel: string
          username: string
        }[]
      }
      sell_shares: {
        Args: {
          p_market_id: string
          p_shares: number
          p_side: Database["public"]["Enums"]["trade_side"]
        }
        Returns: Json
      }
      send_friend_request: { Args: { _addressee_id: string }; Returns: string }
      set_market_attribution: {
        Args: { _market_id: string; _public: boolean }
        Returns: undefined
      }
      shared_open_group_bets: { Args: { _user_id: string }; Returns: number }
      start_learn_attempt: { Args: { _article_id: string }; Returns: Json }
      submit_learn_attempt: {
        Args: { _answers: Json; _article_id: string }
        Returns: Json
      }
      sync_all_peak_net_worth: { Args: never; Returns: number }
      sync_peak_net_worth: { Args: { _user_id: string }; Returns: Json }
      unblock_user: { Args: { _user_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
      friendship_status: "pending" | "accepted" | "declined" | "blocked"
      group_bet_resolution: "yes" | "no" | "invalid"
      group_bet_status:
        | "open"
        | "closed"
        | "resolved"
        | "voting"
        | "pending_auto_resolution"
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
      app_role: ["admin", "user"],
      friendship_status: ["pending", "accepted", "declined", "blocked"],
      group_bet_resolution: ["yes", "no", "invalid"],
      group_bet_status: [
        "open",
        "closed",
        "resolved",
        "voting",
        "pending_auto_resolution",
      ],
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
