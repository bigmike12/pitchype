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
      applications: {
        Row: {
          campaign_id: string
          created_at: string
          creator_id: string
          decision_note: string | null
          id: string
          note: string | null
          proposed_price_kobo: number | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          creator_id: string
          decision_note?: string | null
          id?: string
          note?: string | null
          proposed_price_kobo?: number | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          creator_id?: string
          decision_note?: string | null
          id?: string
          note?: string | null
          proposed_price_kobo?: number | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profiles: {
        Row: {
          business_name: string
          city: string
          contact_name: string
          created_at: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_name: string
          city: string
          contact_name: string
          created_at?: string
          state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_name?: string
          city?: string
          contact_name?: string
          created_at?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_deliverables: {
        Row: {
          campaign_id: string
          kind: Database["public"]["Enums"]["deliverable_kind"]
          platform: Database["public"]["Enums"]["social_platform"]
          position: number
          quantity: number
        }
        Insert: {
          campaign_id: string
          kind: Database["public"]["Enums"]["deliverable_kind"]
          platform: Database["public"]["Enums"]["social_platform"]
          position: number
          quantity: number
        }
        Update: {
          campaign_id?: string
          kind?: Database["public"]["Enums"]["deliverable_kind"]
          platform?: Database["public"]["Enums"]["social_platform"]
          position?: number
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_deliverables_campaign_id_platform_fkey"
            columns: ["campaign_id", "platform"]
            isOneToOne: false
            referencedRelation: "campaign_platforms"
            referencedColumns: ["campaign_id", "platform"]
          },
        ]
      }
      campaign_platforms: {
        Row: {
          campaign_id: string
          min_followers: Database["public"]["Enums"]["follower_range"] | null
          platform: Database["public"]["Enums"]["social_platform"]
        }
        Insert: {
          campaign_id: string
          min_followers?: Database["public"]["Enums"]["follower_range"] | null
          platform: Database["public"]["Enums"]["social_platform"]
        }
        Update: {
          campaign_id?: string
          min_followers?: Database["public"]["Enums"]["follower_range"] | null
          platform?: Database["public"]["Enums"]["social_platform"]
        }
        Relationships: [
          {
            foreignKeyName: "campaign_platforms_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_reports: {
        Row: {
          campaign_id: string
          created_at: string
          details: string | null
          id: string
          reason: Database["public"]["Enums"]["campaign_report_reason"]
          reporter_user_id: string | null
          resolved_at: string | null
          resolved_by: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          details?: string | null
          id?: string
          reason: Database["public"]["Enums"]["campaign_report_reason"]
          reporter_user_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          details?: string | null
          id?: string
          reason?: Database["public"]["Enums"]["campaign_report_reason"]
          reporter_user_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_reports_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_revisions: {
        Row: {
          brief: string
          campaign_id: string
          created_at: string
          guidelines: string | null
          id: string
          title: string
          while_live: boolean
        }
        Insert: {
          brief: string
          campaign_id: string
          created_at?: string
          guidelines?: string | null
          id?: string
          title: string
          while_live?: boolean
        }
        Update: {
          brief?: string
          campaign_id?: string
          created_at?: string
          guidelines?: string | null
          id?: string
          title?: string
          while_live?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "campaign_revisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          applications_close_on: string
          approved_at: string | null
          approved_by: string | null
          brief: string
          business_id: string
          closed_at: string | null
          created_at: string
          deliver_by: string
          guidelines: string | null
          id: string
          niches: string[]
          payment_model: Database["public"]["Enums"]["payment_model"]
          places: number
          post_from: string | null
          price_kobo: number | null
          published_at: string | null
          removed_reason: string | null
          review_note: string | null
          states: unknown[]
          status: Database["public"]["Enums"]["campaign_status"]
          submitted_at: string | null
          title: string
          updated_at: string
          verified_only: boolean
        }
        Insert: {
          applications_close_on: string
          approved_at?: string | null
          approved_by?: string | null
          brief: string
          business_id: string
          closed_at?: string | null
          created_at?: string
          deliver_by: string
          guidelines?: string | null
          id?: string
          niches?: string[]
          payment_model?: Database["public"]["Enums"]["payment_model"]
          places: number
          post_from?: string | null
          price_kobo?: number | null
          published_at?: string | null
          removed_reason?: string | null
          review_note?: string | null
          states?: unknown[]
          status?: Database["public"]["Enums"]["campaign_status"]
          submitted_at?: string | null
          title: string
          updated_at?: string
          verified_only?: boolean
        }
        Update: {
          applications_close_on?: string
          approved_at?: string | null
          approved_by?: string | null
          brief?: string
          business_id?: string
          closed_at?: string | null
          created_at?: string
          deliver_by?: string
          guidelines?: string | null
          id?: string
          niches?: string[]
          payment_model?: Database["public"]["Enums"]["payment_model"]
          places?: number
          post_from?: string | null
          price_kobo?: number | null
          published_at?: string | null
          removed_reason?: string | null
          review_note?: string | null
          states?: unknown[]
          status?: Database["public"]["Enums"]["campaign_status"]
          submitted_at?: string | null
          title?: string
          updated_at?: string
          verified_only?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      engagements: {
        Row: {
          agreed_price_kobo: number
          application_id: string
          approved_at: string
          business_id: string
          campaign_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          creator_id: string
          id: string
          pay_by: string
          status: Database["public"]["Enums"]["engagement_status"]
          updated_at: string
        }
        Insert: {
          agreed_price_kobo: number
          application_id: string
          approved_at?: string
          business_id: string
          campaign_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          creator_id: string
          id?: string
          pay_by: string
          status?: Database["public"]["Enums"]["engagement_status"]
          updated_at?: string
        }
        Update: {
          agreed_price_kobo?: number
          application_id?: string
          approved_at?: string
          business_id?: string
          campaign_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          creator_id?: string
          id?: string
          pay_by?: string
          status?: Database["public"]["Enums"]["engagement_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagements_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "engagements_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      influencer_platforms: {
        Row: {
          created_at: string
          follower_range: Database["public"]["Enums"]["follower_range"]
          followers_updated_at: string
          handle: string
          platform: Database["public"]["Enums"]["social_platform"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          follower_range: Database["public"]["Enums"]["follower_range"]
          followers_updated_at?: string
          handle: string
          platform: Database["public"]["Enums"]["social_platform"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          follower_range?: Database["public"]["Enums"]["follower_range"]
          followers_updated_at?: string
          handle?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "influencer_platforms_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "influencer_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "influencer_platforms_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "listed_creators"
            referencedColumns: ["user_id"]
          },
        ]
      }
      influencer_profiles: {
        Row: {
          allow_indexing: boolean
          bio: string | null
          city: string
          created_at: string
          display_name: string
          hidden_at: string | null
          hidden_reason: string | null
          niches: string[]
          photo_version: number | null
          published: boolean
          slug: string | null
          starting_rate_kobo: number | null
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_indexing?: boolean
          bio?: string | null
          city: string
          created_at?: string
          display_name: string
          hidden_at?: string | null
          hidden_reason?: string | null
          niches?: string[]
          photo_version?: number | null
          published?: boolean
          slug?: string | null
          starting_rate_kobo?: number | null
          state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_indexing?: boolean
          bio?: string | null
          city?: string
          created_at?: string
          display_name?: string
          hidden_at?: string | null
          hidden_reason?: string | null
          niches?: string[]
          photo_version?: number | null
          published?: boolean
          slug?: string | null
          starting_rate_kobo?: number | null
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "influencer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_appeals: {
        Row: {
          answer: string | null
          created_at: string
          id: string
          message: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          answer?: string | null
          created_at?: string
          id?: string
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          answer?: string | null
          created_at?: string
          id?: string
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_appeals_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_appeals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_events: {
        Row: {
          actor_id: string | null
          created_at: string
          dedupe_key: string | null
          detail: string | null
          flag: string | null
          id: string
          kind: Database["public"]["Enums"]["moderation_event_kind"]
          reason: string | null
          strike_id: string | null
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          detail?: string | null
          flag?: string | null
          id?: string
          kind: Database["public"]["Enums"]["moderation_event_kind"]
          reason?: string | null
          strike_id?: string | null
          user_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          dedupe_key?: string | null
          detail?: string | null
          flag?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["moderation_event_kind"]
          reason?: string | null
          strike_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_events_strike_id_fkey"
            columns: ["strike_id"]
            isOneToOne: false
            referencedRelation: "moderation_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      niches: {
        Row: {
          created_at: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          name: string
          slug: string
          sort_order: number
        }
        Update: {
          created_at?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      profile_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_user_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: Database["public"]["Enums"]["report_reason"]
          reporter_user_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: Database["public"]["Enums"]["report_reason"]
          reporter_user_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "influencer_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profile_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "listed_creators"
            referencedColumns: ["user_id"]
          },
        ]
      }
      user_blocks: {
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
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string
          created_at: string
          email: string
          id: string
          messaging_restricted_until: string | null
          role: Database["public"]["Enums"]["user_role"]
          suspended_at: string | null
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          email: string
          id?: string
          messaging_restricted_until?: string | null
          role: Database["public"]["Enums"]["user_role"]
          suspended_at?: string | null
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          email?: string
          id?: string
          messaging_restricted_until?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          suspended_at?: string | null
        }
        Relationships: []
      }
      verification_requests: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          follower_count_seen: number | null
          handle: string
          id: string
          platform: Database["public"]["Enums"]["social_platform"]
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["verification_status"]
          submitted_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          expires_at: string
          follower_count_seen?: number | null
          handle: string
          id?: string
          platform: Database["public"]["Enums"]["social_platform"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          submitted_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          follower_count_seen?: number | null
          handle?: string
          id?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          submitted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "influencer_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "verification_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "listed_creators"
            referencedColumns: ["user_id"]
          },
        ]
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          role: string
          source: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          role: string
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          role?: string
          source?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      creator_platform_status: {
        Row: {
          effective_range: Database["public"]["Enums"]["follower_range"] | null
          followers_updated_at: string | null
          handle: string | null
          platform: Database["public"]["Enums"]["social_platform"] | null
          self_reported_range:
            | Database["public"]["Enums"]["follower_range"]
            | null
          user_id: string | null
          verified: boolean | null
          verified_at: string | null
          verified_follower_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "influencer_platforms_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "influencer_profiles"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "influencer_platforms_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "listed_creators"
            referencedColumns: ["user_id"]
          },
        ]
      }
      listed_creators: {
        Row: {
          allow_indexing: boolean | null
          bio: string | null
          city: string | null
          created_at: string | null
          display_name: string | null
          hidden_at: string | null
          hidden_reason: string | null
          niches: string[] | null
          photo_version: number | null
          published: boolean | null
          slug: string | null
          starting_rate_kobo: number | null
          state: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          allow_indexing?: boolean | null
          bio?: string | null
          city?: string | null
          created_at?: string | null
          display_name?: string | null
          hidden_at?: string | null
          hidden_reason?: string | null
          niches?: string[] | null
          photo_version?: number | null
          published?: boolean | null
          slug?: string | null
          starting_rate_kobo?: number | null
          state?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          allow_indexing?: boolean | null
          bio?: string | null
          city?: string | null
          created_at?: string | null
          display_name?: string | null
          hidden_at?: string | null
          hidden_reason?: string | null
          niches?: string[] | null
          photo_version?: number | null
          published?: boolean | null
          slug?: string | null
          starting_rate_kobo?: number | null
          state?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "influencer_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      active_strike_count: { Args: { person: string }; Returns: number }
      answer_appeal: {
        Args: { answer: string; appeal: string; decline: boolean }
        Returns: undefined
      }
      apply_to_campaign: {
        Args: { campaign: string; note: string; proposed_price_kobo: number }
        Returns: string
      }
      approve_application: {
        Args: { application: string; expected_price_kobo: number }
        Returns: string
      }
      block_user: { Args: { other: string }; Returns: undefined }
      campaign_application_counts: {
        Args: never
        Returns: {
          campaign_id: string
          total: number
          waiting: number
        }[]
      }
      campaign_applications: { Args: { campaign: string }; Returns: Json }
      campaign_card: {
        Args: {
          k: Database["public"]["Tables"]["campaigns"]["Row"]
          viewer: string
        }
        Returns: Json
      }
      campaign_problems: {
        Args: { campaign: string; creator: string }
        Returns: Json
      }
      cancel_engagement: { Args: { engagement: string }; Returns: undefined }
      check_standing: { Args: { person: string }; Returns: undefined }
      clean_note: { Args: { note: string }; Returns: string }
      clean_reason: { Args: { reason: string }; Returns: string }
      contact_detail_kind: { Args: { body: string }; Returns: string }
      count_qualifying_creators: { Args: { campaign: string }; Returns: number }
      create_app_user: {
        Args: { requested_role: Database["public"]["Enums"]["user_role"] }
        Returns: string
      }
      creator_platforms_json: {
        Args: { creator: string; with_handles: boolean }
        Returns: Json
      }
      current_user_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      decide_application: {
        Args: { application: string; decision: string; note: string }
        Returns: undefined
      }
      deliverable_kind_allowed: {
        Args: {
          kind: Database["public"]["Enums"]["deliverable_kind"]
          on_platform: Database["public"]["Enums"]["social_platform"]
        }
        Returns: boolean
      }
      edit_application: {
        Args: { application: string; note: string; proposed_price_kobo: number }
        Returns: undefined
      }
      engagement_json: {
        Args: { e: Database["public"]["Tables"]["engagements"]["Row"] }
        Returns: Json
      }
      expire_unpaid_engagements: {
        Args: { campaign?: string }
        Returns: number
      }
      follower_range_for: {
        Args: { follower_count: number }
        Returns: Database["public"]["Enums"]["follower_range"]
      }
      get_campaign: { Args: { campaign: string }; Returns: Json }
      get_listed_creator: {
        Args: { creator_slug: string }
        Returns: {
          allow_indexing: boolean
          bio: string
          city: string
          details_visible: boolean
          display_name: string
          niches: string[]
          photo_version: number
          platforms: Json
          slug: string
          starting_rate_kobo: number
          state: string
          updated_at: string
          user_id: string
        }[]
      }
      held_places: { Args: { campaign: string }; Returns: number }
      indexable_creators: {
        Args: never
        Returns: {
          slug: string
          updated_at: string
        }[]
      }
      is_blocked_between: { Args: { a: string; b: string }; Returns: boolean }
      is_suspended: { Args: { person: string }; Returns: boolean }
      lagos_today: { Args: never; Returns: string }
      lift_suspension: {
        Args: { person: string; reason: string }
        Returns: undefined
      }
      list_open_campaigns: {
        Args: {
          niche_slug?: string
          on_platform?: Database["public"]["Enums"]["social_platform"]
          page_offset?: number
          page_size?: number
          qualified_only?: boolean
        }
        Returns: {
          campaign: Json
          total_count: number
        }[]
      }
      my_applications: { Args: never; Returns: Json }
      new_verification_code: { Args: never; Returns: string }
      open_campaign_count: { Args: never; Returns: number }
      record_strike: {
        Args: { dedupe: string; detail: string; flag: string; person: string }
        Returns: Json
      }
      relax_standing: { Args: { person: string }; Returns: undefined }
      report_campaign: {
        Args: {
          campaign: string
          note?: string
          reason_code: Database["public"]["Enums"]["campaign_report_reason"]
        }
        Returns: undefined
      }
      report_creator: {
        Args: {
          creator_slug: string
          note?: string
          reason_code: Database["public"]["Enums"]["report_reason"]
        }
        Returns: undefined
      }
      request_handle_verification: {
        Args: {
          target_platform: Database["public"]["Enums"]["social_platform"]
        }
        Returns: {
          code: string
          expires_at: string
          id: string
        }[]
      }
      require_admin: { Args: never; Returns: string }
      resolve_campaign_report: {
        Args: { report_id: string }
        Returns: undefined
      }
      resolve_profile_report: {
        Args: { report_id: string }
        Returns: undefined
      }
      review_handle_verification: {
        Args: { approve: boolean; follower_count?: number; request_id: string }
        Returns: undefined
      }
      save_campaign_draft: {
        Args: {
          applications_close_on: string
          brief: string
          campaign_id: string
          deliver_by: string
          deliverables: Json
          guidelines: string
          niches: string[]
          places: number
          platforms: Json
          post_from: string
          price_kobo: number
          states: string[]
          title: string
          verified_only: boolean
        }
        Returns: string
      }
      search_creators: {
        Args: {
          in_state?: string
          max_rate_kobo?: number
          min_followers?: Database["public"]["Enums"]["follower_range"]
          niche_slug?: string
          on_platform?: Database["public"]["Enums"]["social_platform"]
          page_offset?: number
          page_size?: number
        }
        Returns: {
          city: string
          display_name: string
          niches: string[]
          photo_version: number
          platforms: Json
          slug: string
          starting_rate_kobo: number
          state: string
          total_count: number
          user_id: string
        }[]
      }
      set_creator_hidden: {
        Args: { creator: string; reason: string }
        Returns: undefined
      }
      standing_problem: { Args: { person: string }; Returns: string }
      standing_review: { Args: never; Returns: Json }
      submit_appeal: { Args: { message: string }; Returns: string }
      submit_handle_verification: {
        Args: { request_id: string }
        Returns: undefined
      }
      transition_campaign: {
        Args: { action: string; campaign_id: string; note?: string }
        Returns: Database["public"]["Enums"]["campaign_status"]
      }
      unblock_user: { Args: { other: string }; Returns: undefined }
      valid_proposed_price: { Args: { price: number }; Returns: boolean }
      viewer_sees_creator_details: { Args: never; Returns: boolean }
      void_strike: {
        Args: { reason: string; strike: string }
        Returns: undefined
      }
      withdraw_application: {
        Args: { application: string }
        Returns: undefined
      }
    }
    Enums: {
      application_status:
        | "submitted"
        | "shortlisted"
        | "approved"
        | "rejected"
        | "withdrawn"
      campaign_report_reason:
        | "scam_or_fraud"
        | "banned_content"
        | "off_platform_contact"
        | "misleading"
        | "other"
      campaign_status:
        | "draft"
        | "pending_review"
        | "open"
        | "paused"
        | "closed"
        | "in_progress"
        | "completed"
        | "cancelled"
      deliverable_kind: "post" | "reel" | "story" | "video" | "short"
      engagement_status:
        | "awaiting_payment"
        | "funded"
        | "in_progress"
        | "submitted"
        | "accepted"
        | "denied"
        | "paid_out"
        | "disputed"
        | "auto_released"
        | "cancelled"
        | "refunded"
      follower_range: "1k_5k" | "5k_10k" | "10k_50k" | "50k_100k" | "100k_plus"
      moderation_event_kind:
        | "strike"
        | "strike_voided"
        | "suspension_lifted"
        | "appeal_declined"
      payment_model: "fixed" | "per_click"
      report_reason:
        | "inappropriate_photo"
        | "impersonation"
        | "spam_or_scam"
        | "other"
      social_platform: "instagram" | "tiktok" | "youtube" | "x"
      user_role: "business" | "influencer" | "admin"
      verification_status:
        | "pending"
        | "verified"
        | "rejected"
        | "expired"
        | "revoked"
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
    Enums: {
      application_status: [
        "submitted",
        "shortlisted",
        "approved",
        "rejected",
        "withdrawn",
      ],
      campaign_report_reason: [
        "scam_or_fraud",
        "banned_content",
        "off_platform_contact",
        "misleading",
        "other",
      ],
      campaign_status: [
        "draft",
        "pending_review",
        "open",
        "paused",
        "closed",
        "in_progress",
        "completed",
        "cancelled",
      ],
      deliverable_kind: ["post", "reel", "story", "video", "short"],
      engagement_status: [
        "awaiting_payment",
        "funded",
        "in_progress",
        "submitted",
        "accepted",
        "denied",
        "paid_out",
        "disputed",
        "auto_released",
        "cancelled",
        "refunded",
      ],
      follower_range: ["1k_5k", "5k_10k", "10k_50k", "50k_100k", "100k_plus"],
      moderation_event_kind: [
        "strike",
        "strike_voided",
        "suspension_lifted",
        "appeal_declined",
      ],
      payment_model: ["fixed", "per_click"],
      report_reason: [
        "inappropriate_photo",
        "impersonation",
        "spam_or_scam",
        "other",
      ],
      social_platform: ["instagram", "tiktok", "youtube", "x"],
      user_role: ["business", "influencer", "admin"],
      verification_status: [
        "pending",
        "verified",
        "rejected",
        "expired",
        "revoked",
      ],
    },
  },
} as const

