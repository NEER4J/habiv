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
      admin_emails: {
        Row: {
          email: string
        }
        Insert: {
          email: string
        }
        Update: {
          email?: string
        }
        Relationships: []
      }
      api_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          prefix: string
          revoked_at: string | null
          scopes: string[]
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name: string
          prefix: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "api_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          icon: string | null
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          icon?: string | null
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          icon?: string | null
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "comment_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_mentions: {
        Row: {
          comment_id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          user_id: string
        }
        Update: {
          comment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_mentions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "comment_mentions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          game_id: string
          id: string
          likes_count: number
          parent_id: string | null
          pinned: boolean
          reply_count: number
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          game_id: string
          id?: string
          likes_count?: number
          parent_id?: string | null
          pinned?: boolean
          reply_count?: number
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          game_id?: string
          id?: string
          likes_count?: number
          parent_id?: string | null
          pinned?: boolean
          reply_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_challenges: {
        Row: {
          created_at: string
          day: string
          game_id: string
          leaderboard_id: string | null
        }
        Insert: {
          created_at?: string
          day: string
          game_id: string
          leaderboard_id?: string | null
        }
        Update: {
          created_at?: string
          day?: string
          game_id?: string
          leaderboard_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_challenges_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_challenges_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_challenges_leaderboard_id_fkey"
            columns: ["leaderboard_id"]
            isOneToOne: false
            referencedRelation: "leaderboards"
            referencedColumns: ["id"]
          },
        ]
      }
      dislikes: {
        Row: {
          created_at: string
          game_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dislikes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dislikes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dislikes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "dislikes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          creator_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "follows_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_daily: {
        Row: {
          by_country: Json
          by_device: Json
          by_referrer: Json
          completions: number
          day: string
          dropoff: Json
          game_id: string
          likes: number
          median_duration_ms: number | null
          p90_duration_ms: number | null
          plays: number
          remixes: number
          runs: number
          saves: number
          score_submits: number
          unique_players: number
          views: number
        }
        Insert: {
          by_country?: Json
          by_device?: Json
          by_referrer?: Json
          completions?: number
          day: string
          dropoff?: Json
          game_id: string
          likes?: number
          median_duration_ms?: number | null
          p90_duration_ms?: number | null
          plays?: number
          remixes?: number
          runs?: number
          saves?: number
          score_submits?: number
          unique_players?: number
          views?: number
        }
        Update: {
          by_country?: Json
          by_device?: Json
          by_referrer?: Json
          completions?: number
          day?: string
          dropoff?: Json
          game_id?: string
          likes?: number
          median_duration_ms?: number | null
          p90_duration_ms?: number | null
          plays?: number
          remixes?: number
          runs?: number
          saves?: number
          score_submits?: number
          unique_players?: number
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_daily_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_daily_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_stats: {
        Row: {
          best_score: number | null
          comments: number
          completions: number
          dislikes: number
          game_id: string
          hot_score: number
          likes: number
          plays: number
          remixes: number
          runs: number
          saves: number
          trending_score: number
          unique_players: number
          updated_at: string
        }
        Insert: {
          best_score?: number | null
          comments?: number
          completions?: number
          dislikes?: number
          game_id: string
          hot_score?: number
          likes?: number
          plays?: number
          remixes?: number
          runs?: number
          saves?: number
          trending_score?: number
          unique_players?: number
          updated_at?: string
        }
        Update: {
          best_score?: number | null
          comments?: number
          completions?: number
          dislikes?: number
          game_id?: string
          hot_score?: number
          likes?: number
          plays?: number
          remixes?: number
          runs?: number
          saves?: number
          trending_score?: number
          unique_players?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_stats_5m: {
        Row: {
          bucket: string
          completions: number
          game_id: string
          plays: number
          runs_ended: number
          uniques: number
        }
        Insert: {
          bucket: string
          completions?: number
          game_id: string
          plays?: number
          runs_ended?: number
          uniques?: number
        }
        Update: {
          bucket?: string
          completions?: number
          game_id?: string
          plays?: number
          runs_ended?: number
          uniques?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_stats_5m_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_stats_5m_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      game_tags: {
        Row: {
          game_id: string
          tag_id: string
        }
        Insert: {
          game_id: string
          tag_id: string
        }
        Update: {
          game_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_tags_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_tags_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      game_versions: {
        Row: {
          agent: string | null
          auto_publish: boolean
          bundle_prefix: string | null
          changelog: string | null
          created_at: string
          engine: string | null
          entry_path: string
          file_count: number | null
          game_id: string
          id: string
          ingest_run_id: string | null
          manifest: Json | null
          model: string | null
          needs_isolation: boolean
          prompt: string | null
          reject_reason: string | null
          sha256: string | null
          size_bytes: number | null
          smoke: Json | null
          source: string
          status: string
          updated_at: string
          upload_key: string | null
          uses_network: boolean
          version: number
        }
        Insert: {
          agent?: string | null
          auto_publish?: boolean
          bundle_prefix?: string | null
          changelog?: string | null
          created_at?: string
          engine?: string | null
          entry_path?: string
          file_count?: number | null
          game_id: string
          id?: string
          ingest_run_id?: string | null
          manifest?: Json | null
          model?: string | null
          needs_isolation?: boolean
          prompt?: string | null
          reject_reason?: string | null
          sha256?: string | null
          size_bytes?: number | null
          smoke?: Json | null
          source?: string
          status?: string
          updated_at?: string
          upload_key?: string | null
          uses_network?: boolean
          version: number
        }
        Update: {
          agent?: string | null
          auto_publish?: boolean
          bundle_prefix?: string | null
          changelog?: string | null
          created_at?: string
          engine?: string | null
          entry_path?: string
          file_count?: number | null
          game_id?: string
          id?: string
          ingest_run_id?: string | null
          manifest?: Json | null
          model?: string | null
          needs_isolation?: boolean
          prompt?: string | null
          reject_reason?: string | null
          sha256?: string | null
          size_bytes?: number | null
          smoke?: Json | null
          source?: string
          status?: string
          updated_at?: string
          upload_key?: string | null
          uses_network?: boolean
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "game_versions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_versions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          accent_hue: number
          card_path: string | null
          categories: string[]
          category: string
          controls: Json
          cover_path: string | null
          created_at: string
          creator_id: string
          current_version_id: string | null
          description: string | null
          duration_sec: number | null
          featured_at: string | null
          featured_rank: number | null
          hidden_reason: string | null
          id: string
          leaderboard_enabled: boolean
          orientation: string
          published_at: string | null
          remix_licence: string
          remixed_from_game_id: string | null
          short_id: string
          slug: string
          status: string
          tagline: string | null
          title: string
          updated_at: string
        }
        Insert: {
          accent_hue?: number
          card_path?: string | null
          categories?: string[]
          category?: string
          controls?: Json
          cover_path?: string | null
          created_at?: string
          creator_id: string
          current_version_id?: string | null
          description?: string | null
          duration_sec?: number | null
          featured_at?: string | null
          featured_rank?: number | null
          hidden_reason?: string | null
          id?: string
          leaderboard_enabled?: boolean
          orientation?: string
          published_at?: string | null
          remix_licence?: string
          remixed_from_game_id?: string | null
          short_id: string
          slug: string
          status?: string
          tagline?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          accent_hue?: number
          card_path?: string | null
          categories?: string[]
          category?: string
          controls?: Json
          cover_path?: string | null
          created_at?: string
          creator_id?: string
          current_version_id?: string | null
          description?: string | null
          duration_sec?: number | null
          featured_at?: string | null
          featured_rank?: number | null
          hidden_reason?: string | null
          id?: string
          leaderboard_enabled?: boolean
          orientation?: string
          published_at?: string | null
          remix_licence?: string
          remixed_from_game_id?: string | null
          short_id?: string
          slug?: string
          status?: string
          tagline?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_category_fk"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "games_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "games_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "game_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_remixed_from_game_id_fkey"
            columns: ["remixed_from_game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_remixed_from_game_id_fkey"
            columns: ["remixed_from_game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      handle_history: {
        Row: {
          handle: string
          released_at: string
          user_id: string
        }
        Insert: {
          handle: string
          released_at?: string
          user_id: string
        }
        Update: {
          handle?: string
          released_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "handle_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "handle_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboard_entries: {
        Row: {
          bot_label: string | null
          created_at: string
          flagged: string | null
          id: string
          is_bot: boolean
          leaderboard_id: string
          period_start: string
          player_id: string
          run_id: string | null
          score: number
          user_id: string | null
        }
        Insert: {
          bot_label?: string | null
          created_at?: string
          flagged?: string | null
          id?: string
          is_bot?: boolean
          leaderboard_id: string
          period_start: string
          player_id: string
          run_id?: string | null
          score: number
          user_id?: string | null
        }
        Update: {
          bot_label?: string | null
          created_at?: string
          flagged?: string | null
          id?: string
          is_bot?: boolean
          leaderboard_id?: string
          period_start?: string
          player_id?: string
          run_id?: string | null
          score?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_entries_leaderboard_id_fkey"
            columns: ["leaderboard_id"]
            isOneToOne: false
            referencedRelation: "leaderboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "leaderboard_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboards: {
        Row: {
          created_at: string
          game_id: string
          id: string
          key: string
          max_per_second: number | null
          min_duration_ms: number
          period: string
          sort: string
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          key?: string
          max_per_second?: number | null
          min_duration_ms?: number
          period: string
          sort?: string
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          key?: string
          max_per_second?: number | null
          min_duration_ms?: number
          period?: string
          sort?: string
        }
        Relationships: [
          {
            foreignKeyName: "leaderboards_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboards_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string
          game_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          comment_id: string | null
          created_at: string
          game_id: string | null
          id: string
          kind: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          game_id?: string | null
          id?: string
          kind: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          game_id?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_badges: {
        Row: {
          badge: string
          granted_at: string
          user_id: string
        }
        Insert: {
          badge: string
          granted_at?: string
          user_id: string
        }
        Update: {
          badge?: string
          granted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "profile_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          ban_reason: string | null
          banned_at: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          followers_count: number
          following_count: number
          handle: string
          handle_changed_at: string | null
          handle_set: boolean
          id: string
          is_admin: boolean
          is_creator: boolean
          is_verified: boolean
          links: Json
          pronouns: string | null
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          followers_count?: number
          following_count?: number
          handle: string
          handle_changed_at?: string | null
          handle_set?: boolean
          id: string
          is_admin?: boolean
          is_creator?: boolean
          is_verified?: boolean
          links?: Json
          pronouns?: string | null
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          ban_reason?: string | null
          banned_at?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          followers_count?: number
          following_count?: number
          handle?: string
          handle_changed_at?: string | null
          handle_set?: boolean
          id?: string
          is_admin?: boolean
          is_creator?: boolean
          is_verified?: boolean
          links?: Json
          pronouns?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          comment_id: string | null
          created_at: string
          details: string | null
          game_id: string | null
          id: string
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          details?: string | null
          game_id?: string | null
          id?: string
          reason: string
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          details?: string | null
          game_id?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reserved_handles: {
        Row: {
          handle: string
          reason: string
        }
        Insert: {
          handle: string
          reason?: string
        }
        Update: {
          handle?: string
          reason?: string
        }
        Relationships: []
      }
      retention_daily: {
        Row: {
          cohort_day: string
          cohort_size: number
          d1: number
          d7: number
          game_id: string
        }
        Insert: {
          cohort_day: string
          cohort_size: number
          d1?: number
          d7?: number
          game_id: string
        }
        Update: {
          cohort_day?: string
          cohort_size?: number
          d1?: number
          d7?: number
          game_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retention_daily_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retention_daily_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      saves: {
        Row: {
          created_at: string
          game_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          game_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          game_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saves_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saves_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "saves_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      tags: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      upload_sessions: {
        Row: {
          created_at: string
          expires_at: string
          filename: string
          game_id: string
          id: string
          key: string
          mode: string
          parts: Json
          r2_upload_id: string | null
          sha256: string | null
          size_bytes: number
          status: string
          updated_at: string
          user_id: string
          version_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          filename: string
          game_id: string
          id?: string
          key: string
          mode: string
          parts?: Json
          r2_upload_id?: string | null
          sha256?: string | null
          size_bytes: number
          status?: string
          updated_at?: string
          user_id: string
          version_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          filename?: string
          game_id?: string
          id?: string
          key?: string
          mode?: string
          parts?: Json
          r2_upload_id?: string | null
          sha256?: string | null
          size_bytes?: number
          status?: string
          updated_at?: string
          user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_sessions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_sessions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "upload_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_sessions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "game_versions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      game_feed_v: {
        Row: {
          accent_hue: number | null
          agent: string | null
          best_score: number | null
          card_path: string | null
          categories: string[] | null
          category: string | null
          comments: number | null
          completions: number | null
          controls: Json | null
          cover_path: string | null
          created_at: string | null
          creator_avatar: string | null
          creator_handle: string | null
          creator_id: string | null
          creator_name: string | null
          creator_verified: boolean | null
          current_version_id: string | null
          description: string | null
          duration_sec: number | null
          engine: string | null
          featured_at: string | null
          featured_rank: number | null
          followers_count: number | null
          hot_score: number | null
          id: string | null
          leaderboard_enabled: boolean | null
          likes: number | null
          model: string | null
          needs_isolation: boolean | null
          orientation: string | null
          plays: number | null
          published_at: string | null
          remix_licence: string | null
          remixed_from_game_id: string | null
          remixes: number | null
          runs: number | null
          saves: number | null
          short_id: string | null
          size_bytes: number | null
          slug: string | null
          tagline: string | null
          title: string | null
          trending_score: number | null
          unique_players: number | null
          updated_at: string | null
          uses_network: boolean | null
          version_no: number | null
        }
        Relationships: [
          {
            foreignKeyName: "games_category_fk"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "games_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "game_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_remixed_from_game_id_fkey"
            columns: ["remixed_from_game_id"]
            isOneToOne: false
            referencedRelation: "game_feed_v"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_remixed_from_game_id_fkey"
            columns: ["remixed_from_game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      active_game_players: { Args: { p_game_id: string }; Returns: number }
      admin_stats: { Args: never; Returns: Json }
      admin_user_emails: {
        Args: { p_ids: string[] }
        Returns: {
          created_at: string
          email: string
          id: string
          last_sign_in_at: string
          provider: string
        }[]
      }
      category_counts: {
        Args: never
        Returns: {
          games: number
          icon: string
          name: string
          slug: string
          sort_order: number
        }[]
      }
      creator_storage_bytes: { Args: { p_user_id: string }; Returns: number }
      end_run: {
        Args: {
          p_flag: string
          p_id: string
          p_level: string
          p_outcome: string
          p_progress_pct: number
          p_score: number
        }
        Returns: {
          beat_pct: number
          duration_ms: number
        }[]
      }
      game_origin_hook: { Args: { p_body: Json }; Returns: undefined }
      gen_short_id: { Args: { len?: number }; Returns: string }
      heartbeat_run: { Args: { p_id: string }; Returns: boolean }
      get_run: {
        Args: { p_id: string }
        Returns: {
          auto: boolean
          ended_at: string
          flagged: string
          game_id: string
          id: string
          outcome: string
          player_id: string
          preview: boolean
          score: number
          started_at: string
          token_hash: string
          user_id: string
          version_id: string
        }[]
      }
      ingest_events: { Args: { p_rows: Json }; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      is_banned: { Args: never; Returns: boolean }
      is_blocked_between: { Args: { a: string; b: string }; Returns: boolean }
      is_handle_available: { Args: { h: string }; Returns: boolean }
      leaderboard_rank: {
        Args: {
          p_game_id: string
          p_key: string
          p_period: string
          p_player_id: string
          p_user_id: string
        }
        Returns: {
          rank: number
          score: number
          total: number
        }[]
      }
      link_player: { Args: { p_pid: string }; Returns: undefined }
      mark_notifications_read: { Args: { p_ids?: string[] }; Returns: number }
      next_version_number: { Args: { p_game_id: string }; Returns: number }
      notify: {
        Args: {
          p_actor: string
          p_comment: string
          p_game: string
          p_kind: string
          p_user: string
        }
        Returns: undefined
      }
      period_start_for: { Args: { p_period: string }; Returns: string }
      pick_daily_challenge: { Args: never; Returns: undefined }
      my_runs: {
        Args: { p_game: string; p_limit?: number; p_pid: string; p_user: string }
        Returns: {
          duration_ms: number
          id: string
          outcome: string
          score: number
          started_at: string
        }[]
      }
      play_history: {
        Args: { p_limit?: number; p_pid: string; p_user: string }
        Returns: {
          best_score: number
          board_rank: number
          board_total: number
          first_played_at: string
          game_id: string
          last_played_at: string
          last_score: number
          played_ms: number
          rounds: number
        }[]
      }
      publish_game_version: {
        Args: { p_game_id: string; p_version_id: string }
        Returns: {
          accent_hue: number
          card_path: string | null
          categories: string[]
          category: string
          controls: Json
          cover_path: string | null
          created_at: string
          creator_id: string
          current_version_id: string | null
          description: string | null
          duration_sec: number | null
          featured_at: string | null
          featured_rank: number | null
          hidden_reason: string | null
          id: string
          leaderboard_enabled: boolean
          orientation: string
          published_at: string | null
          remix_licence: string
          remixed_from_game_id: string | null
          short_id: string
          slug: string
          status: string
          tagline: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "games"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rank_feed: { Args: never; Returns: undefined }
      rate_limit_hit: {
        Args: {
          p_cost?: number
          p_key: string
          p_limit: number
          p_window: string
        }
        Returns: boolean
      }
      refresh_top_creator_badges: { Args: never; Returns: undefined }
      resolve_report: {
        Args: { p_game_action?: string; p_report_id: string; p_status: string }
        Returns: undefined
      }
      rollup_5m: { Args: never; Returns: undefined }
      rollup_daily: { Args: never; Returns: undefined }
      run_percentile: {
        Args: { p_game_id: string; p_score: number }
        Returns: number
      }
      runs_today: { Args: never; Returns: number }
      total_plays: { Args: never; Returns: number }
      search_games: {
        Args: { max_rows?: number; q: string }
        Returns: {
          accent_hue: number | null
          agent: string | null
          best_score: number | null
          card_path: string | null
          categories: string[] | null
          category: string | null
          comments: number | null
          completions: number | null
          controls: Json | null
          cover_path: string | null
          created_at: string | null
          creator_avatar: string | null
          creator_handle: string | null
          creator_id: string | null
          creator_name: string | null
          creator_verified: boolean | null
          current_version_id: string | null
          description: string | null
          duration_sec: number | null
          engine: string | null
          featured_at: string | null
          featured_rank: number | null
          followers_count: number | null
          hot_score: number | null
          id: string | null
          leaderboard_enabled: boolean | null
          likes: number | null
          model: string | null
          needs_isolation: boolean | null
          orientation: string | null
          plays: number | null
          published_at: string | null
          remix_licence: string | null
          remixed_from_game_id: string | null
          remixes: number | null
          runs: number | null
          saves: number | null
          short_id: string | null
          size_bytes: number | null
          slug: string | null
          tagline: string | null
          title: string | null
          trending_score: number | null
          unique_players: number | null
          updated_at: string | null
          uses_network: boolean | null
          version_no: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "game_feed_v"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      search_handles: {
        Args: { max_rows?: number; prefix: string }
        Returns: {
          avatar_path: string
          display_name: string
          handle: string
          id: string
        }[]
      }
      set_handle: {
        Args: { new_handle: string }
        Returns: {
          avatar_path: string | null
          ban_reason: string | null
          banned_at: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          followers_count: number
          following_count: number
          handle: string
          handle_changed_at: string | null
          handle_set: boolean
          id: string
          is_admin: boolean
          is_creator: boolean
          is_verified: boolean
          links: Json
          pronouns: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_leaderboard_config: {
        Args: {
          p_enabled: boolean
          p_game_id: string
          p_max_per_second?: number
          p_min_duration_ms?: number
          p_sort?: string
        }
        Returns: undefined
      }
      set_run_score: {
        Args: { p_run: string; p_score: number }
        Returns: undefined
      }
      start_run: {
        Args: {
          p_auto: boolean
          p_game_id: string
          p_id: string
          p_level: string
          p_player_id: string
          p_preview: boolean
          p_session_id: string
          p_started_at: string
          p_token_hash: string
          p_user_id: string
          p_version_id: string
        }
        Returns: boolean
      }
      submit_score: {
        Args: { p_flag: string; p_key: string; p_run: string; p_score: number }
        Returns: {
          leaderboard_id: string
          period: string
          personal_best: boolean
          rank: number
        }[]
      }
      unpublish_game: {
        Args: { p_game_id: string }
        Returns: {
          accent_hue: number
          card_path: string | null
          category: string
          controls: Json
          cover_path: string | null
          created_at: string
          creator_id: string
          current_version_id: string | null
          description: string | null
          duration_sec: number | null
          featured_at: string | null
          featured_rank: number | null
          hidden_reason: string | null
          id: string
          leaderboard_enabled: boolean
          orientation: string
          published_at: string | null
          remix_licence: string
          remixed_from_game_id: string | null
          short_id: string
          slug: string
          status: string
          tagline: string | null
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "games"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unread_notifications: { Args: never; Returns: number }
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
    Enums: {},
  },
} as const
