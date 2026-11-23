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
          proposed_cpc_kobo: number | null
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
          proposed_cpc_kobo?: number | null
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
          proposed_cpc_kobo?: number | null
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
      bank_accounts: {
        Row: {
          account_name: string
          bank_code: string
          bank_name: string
          created_at: string
          id: string
          last4: string
          recipient_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          bank_code: string
          bank_name: string
          created_at?: string
          id?: string
          last4: string
          recipient_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          bank_code?: string
          bank_name?: string
          created_at?: string
          id?: string
          last4?: string
          recipient_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
          blocked_channels: string[]
          brief: string
          business_id: string
          closed_at: string | null
          cpc_kobo: number | null
          created_at: string
          deliver_by: string
          destination_url: string | null
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
          utm_tags: boolean
          verified_only: boolean
        }
        Insert: {
          applications_close_on: string
          approved_at?: string | null
          approved_by?: string | null
          blocked_channels?: string[]
          brief: string
          business_id: string
          closed_at?: string | null
          cpc_kobo?: number | null
          created_at?: string
          deliver_by: string
          destination_url?: string | null
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
          utm_tags?: boolean
          verified_only?: boolean
        }
        Update: {
          applications_close_on?: string
          approved_at?: string | null
          approved_by?: string | null
          blocked_channels?: string[]
          brief?: string
          business_id?: string
          closed_at?: string | null
          cpc_kobo?: number | null
          created_at?: string
          deliver_by?: string
          destination_url?: string | null
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
          utm_tags?: boolean
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
      click_proofs: {
        Row: {
          author_id: string
          created_at: string
          engagement_id: string
          id: string
          links: string[]
          note: string | null
        }
        Insert: {
          author_id: string
          created_at?: string
          engagement_id: string
          id?: string
          links?: string[]
          note?: string | null
        }
        Update: {
          author_id?: string
          created_at?: string
          engagement_id?: string
          id?: string
          links?: string[]
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "click_proofs_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "click_proofs_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_reads: {
        Row: {
          conversation_id: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          application_id: string | null
          business_id: string
          created_at: string
          creator_id: string
          id: string
          last_message_at: string | null
        }
        Insert: {
          application_id?: string | null
          business_id: string
          created_at?: string
          creator_id: string
          id?: string
          last_message_at?: string | null
        }
        Update: {
          application_id?: string | null
          business_id?: string
          created_at?: string
          creator_id?: string
          id?: string
          last_message_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute_statements: {
        Row: {
          author_id: string
          body: string
          created_at: string
          dispute_id: string
          id: string
          links: string[]
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          dispute_id: string
          id?: string
          links?: string[]
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          dispute_id?: string
          id?: string
          links?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "dispute_statements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_statements_dispute_id_fkey"
            columns: ["dispute_id"]
            isOneToOne: false
            referencedRelation: "disputes"
            referencedColumns: ["id"]
          },
        ]
      }
      disputes: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          decision_reason: string | null
          engagement_id: string
          id: string
          opened_at: string
          opened_by: string
          opened_from: Database["public"]["Enums"]["engagement_status"]
          outcome: string | null
          reason: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          decision_reason?: string | null
          engagement_id: string
          id?: string
          opened_at?: string
          opened_by: string
          opened_from: Database["public"]["Enums"]["engagement_status"]
          outcome?: string | null
          reason: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          decision_reason?: string | null
          engagement_id?: string
          id?: string
          opened_at?: string
          opened_by?: string
          opened_from?: Database["public"]["Enums"]["engagement_status"]
          outcome?: string | null
          reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "disputes_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disputes_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      engagements: {
        Row: {
          agreed_price_kobo: number
          application_id: string
          approved_at: string
          business_fee_kobo: number | null
          business_id: string
          campaign_id: string
          cancel_fee_notice_seen_at: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          click_hold_notified_at: string | null
          clicks_stopped_at: string | null
          cpc_kobo: number | null
          creator_fee_bps: number | null
          creator_id: string
          creator_min_fee_kobo: number | null
          fee_config_id: string | null
          funded_at: string | null
          id: string
          pay_by: string
          refunded_kobo: number | null
          released_kobo: number | null
          settle_outcome: string | null
          settled_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["engagement_status"]
          updated_at: string
        }
        Insert: {
          agreed_price_kobo: number
          application_id: string
          approved_at?: string
          business_fee_kobo?: number | null
          business_id: string
          campaign_id: string
          cancel_fee_notice_seen_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          click_hold_notified_at?: string | null
          clicks_stopped_at?: string | null
          cpc_kobo?: number | null
          creator_fee_bps?: number | null
          creator_id: string
          creator_min_fee_kobo?: number | null
          fee_config_id?: string | null
          funded_at?: string | null
          id?: string
          pay_by: string
          refunded_kobo?: number | null
          released_kobo?: number | null
          settle_outcome?: string | null
          settled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["engagement_status"]
          updated_at?: string
        }
        Update: {
          agreed_price_kobo?: number
          application_id?: string
          approved_at?: string
          business_fee_kobo?: number | null
          business_id?: string
          campaign_id?: string
          cancel_fee_notice_seen_at?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          click_hold_notified_at?: string | null
          clicks_stopped_at?: string | null
          cpc_kobo?: number | null
          creator_fee_bps?: number | null
          creator_id?: string
          creator_min_fee_kobo?: number | null
          fee_config_id?: string | null
          funded_at?: string | null
          id?: string
          pay_by?: string
          refunded_kobo?: number | null
          released_kobo?: number | null
          settle_outcome?: string | null
          settled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["engagement_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "engagements_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
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
          {
            foreignKeyName: "engagements_fee_config_id_fkey"
            columns: ["fee_config_id"]
            isOneToOne: false
            referencedRelation: "fee_config"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_config: {
        Row: {
          business_fee_bps: number
          created_at: string
          creator_fee_bps: number
          id: string
          min_fee_kobo: number
          min_payout_kobo: number
          paystack_rate: Json
          transfer_fee_tiers: Json
          transfer_stamp_duty_from_kobo: number
          transfer_stamp_duty_kobo: number
        }
        Insert: {
          business_fee_bps: number
          created_at?: string
          creator_fee_bps: number
          id?: string
          min_fee_kobo: number
          min_payout_kobo: number
          paystack_rate: Json
          transfer_fee_tiers: Json
          transfer_stamp_duty_from_kobo: number
          transfer_stamp_duty_kobo: number
        }
        Update: {
          business_fee_bps?: number
          created_at?: string
          creator_fee_bps?: number
          id?: string
          min_fee_kobo?: number
          min_payout_kobo?: number
          paystack_rate?: Json
          transfer_fee_tiers?: Json
          transfer_stamp_duty_from_kobo?: number
          transfer_stamp_duty_kobo?: number
        }
        Relationships: []
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
          cover_version: number | null
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
          cover_version?: number | null
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
          cover_version?: number | null
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
      ledger_entries: {
        Row: {
          account: string
          actor_user_id: string | null
          amount_kobo: number
          created_at: string
          engagement_id: string | null
          event_type: string
          fee_config_id: string
          group_id: string
          id: string
          owner_user_id: string | null
          payment_id: string | null
          payout_id: string | null
          paystack_reference: string | null
          reason: string | null
        }
        Insert: {
          account: string
          actor_user_id?: string | null
          amount_kobo: number
          created_at?: string
          engagement_id?: string | null
          event_type: string
          fee_config_id: string
          group_id: string
          id?: string
          owner_user_id?: string | null
          payment_id?: string | null
          payout_id?: string | null
          paystack_reference?: string | null
          reason?: string | null
        }
        Update: {
          account?: string
          actor_user_id?: string | null
          amount_kobo?: number
          created_at?: string
          engagement_id?: string | null
          event_type?: string
          fee_config_id?: string
          group_id?: string
          id?: string
          owner_user_id?: string | null
          payment_id?: string | null
          payout_id?: string | null
          paystack_reference?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_fee_config_id_fkey"
            columns: ["fee_config_id"]
            isOneToOne: false
            referencedRelation: "fee_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payment_fk"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payout_fk"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      link_clicks: {
        Row: {
          created_at: string
          filter_reason: string | null
          id: number
          is_billable: boolean
          link_id: string
          referrer_host: string | null
          source: string
          ua_hash: string | null
          visitor_hash: string
        }
        Insert: {
          created_at?: string
          filter_reason?: string | null
          id?: never
          is_billable: boolean
          link_id: string
          referrer_host?: string | null
          source: string
          ua_hash?: string | null
          visitor_hash: string
        }
        Update: {
          created_at?: string
          filter_reason?: string | null
          id?: never
          is_billable?: boolean
          link_id?: string
          referrer_host?: string | null
          source?: string
          ua_hash?: string | null
          visitor_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "link_clicks_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "tracked_links"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          dedupe_key: string
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          dedupe_key: string
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          dedupe_key?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
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
      notification_preferences: {
        Row: {
          email_applications: boolean
          email_campaigns: boolean
          email_messages: boolean
          user_id: string
        }
        Insert: {
          email_applications?: boolean
          email_campaigns?: boolean
          email_messages?: boolean
          user_id: string
        }
        Update: {
          email_applications?: boolean
          email_campaigns?: boolean
          email_messages?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          data: Json
          email_attempts: number
          email_due_at: string | null
          emailed_at: string | null
          group_key: string | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          occurred_at: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          data?: Json
          email_attempts?: number
          email_due_at?: string | null
          emailed_at?: string | null
          group_key?: string | null
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          occurred_at?: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          data?: Json
          email_attempts?: number
          email_due_at?: string | null
          emailed_at?: string | null
          group_key?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          occurred_at?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          event_key: string
          payload: Json
          received_at: string
        }
        Insert: {
          event_key: string
          payload: Json
          received_at?: string
        }
        Update: {
          event_key?: string
          payload?: Json
          received_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          business_fee_kobo: number
          card_amount_kobo: number
          created_at: string
          engagement_id: string
          fee_config_id: string
          fee_notice_seen_at: string
          id: string
          paystack_fee_kobo: number | null
          reference: string
          status: string
          total_kobo: number
          updated_at: string
          wallet_part_kobo: number
        }
        Insert: {
          business_fee_kobo: number
          card_amount_kobo: number
          created_at?: string
          engagement_id: string
          fee_config_id: string
          fee_notice_seen_at: string
          id?: string
          paystack_fee_kobo?: number | null
          reference: string
          status?: string
          total_kobo: number
          updated_at?: string
          wallet_part_kobo: number
        }
        Update: {
          business_fee_kobo?: number
          card_amount_kobo?: number
          created_at?: string
          engagement_id?: string
          fee_config_id?: string
          fee_notice_seen_at?: string
          id?: string
          paystack_fee_kobo?: number | null
          reference?: string
          status?: string
          total_kobo?: number
          updated_at?: string
          wallet_part_kobo?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_fee_config_id_fkey"
            columns: ["fee_config_id"]
            isOneToOne: false
            referencedRelation: "fee_config"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          account_name: string
          amount_kobo: number
          approved_at: string | null
          approved_by: string | null
          bank_name: string
          created_at: string
          decision_reason: string | null
          fee_config_id: string
          id: string
          last4: string
          paid_at: string | null
          recipient_code: string
          reference: string | null
          status: string
          transfer_fee_kobo: number
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          amount_kobo: number
          approved_at?: string | null
          approved_by?: string | null
          bank_name: string
          created_at?: string
          decision_reason?: string | null
          fee_config_id: string
          id?: string
          last4: string
          paid_at?: string | null
          recipient_code: string
          reference?: string | null
          status?: string
          transfer_fee_kobo: number
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          amount_kobo?: number
          approved_at?: string | null
          approved_by?: string | null
          bank_name?: string
          created_at?: string
          decision_reason?: string | null
          fee_config_id?: string
          id?: string
          last4?: string
          paid_at?: string | null
          recipient_code?: string
          reference?: string | null
          status?: string
          transfer_fee_kobo?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_fee_config_id_fkey"
            columns: ["fee_config_id"]
            isOneToOne: false
            referencedRelation: "fee_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_samples: {
        Row: {
          caption: string | null
          created_at: string
          hidden_at: string | null
          hidden_by: string | null
          hidden_reason: string | null
          id: string
          image_version: number | null
          platform: Database["public"]["Enums"]["social_platform"] | null
          position: number
          post_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          image_version?: number | null
          platform?: Database["public"]["Enums"]["social_platform"] | null
          position: number
          post_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          hidden_at?: string | null
          hidden_by?: string | null
          hidden_reason?: string | null
          id?: string
          image_version?: number | null
          platform?: Database["public"]["Enums"]["social_platform"] | null
          position?: number
          post_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_samples_hidden_by_fkey"
            columns: ["hidden_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_samples_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      proof_files: {
        Row: {
          bytes: number
          click_proof_id: string | null
          content_type: string
          created_at: string
          dispute_statement_id: string | null
          id: string
          owner_id: string
          path: string
          submission_id: string | null
        }
        Insert: {
          bytes: number
          click_proof_id?: string | null
          content_type: string
          created_at?: string
          dispute_statement_id?: string | null
          id?: string
          owner_id: string
          path: string
          submission_id?: string | null
        }
        Update: {
          bytes?: number
          click_proof_id?: string | null
          content_type?: string
          created_at?: string
          dispute_statement_id?: string | null
          id?: string
          owner_id?: string
          path?: string
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proof_files_click_proof_id_fkey"
            columns: ["click_proof_id"]
            isOneToOne: false
            referencedRelation: "click_proofs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_files_dispute_statement_id_fkey"
            columns: ["dispute_statement_id"]
            isOneToOne: false
            referencedRelation: "dispute_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_files_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proof_files_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_hits: {
        Row: {
          hit_at: string
          key: string
        }
        Insert: {
          hit_at?: string
          key: string
        }
        Update: {
          hit_at?: string
          key?: string
        }
        Relationships: []
      }
      reconciliation_runs: {
        Row: {
          difference_kobo: number
          expected_cash_kobo: number
          id: string
          note: string | null
          paystack_balance_kobo: number
          ran_at: string
        }
        Insert: {
          difference_kobo: number
          expected_cash_kobo: number
          id?: string
          note?: string | null
          paystack_balance_kobo: number
          ran_at?: string
        }
        Update: {
          difference_kobo?: number
          expected_cash_kobo?: number
          id?: string
          note?: string | null
          paystack_balance_kobo?: number
          ran_at?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          denial_reasons: string[] | null
          engagement_id: string
          id: string
          links: string[]
          note: string | null
          reminded_1d_at: string | null
          reminded_3d_at: string | null
          review_deadline_at: string
          round: number
          status: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          denial_reasons?: string[] | null
          engagement_id: string
          id?: string
          links?: string[]
          note?: string | null
          reminded_1d_at?: string | null
          reminded_3d_at?: string | null
          review_deadline_at: string
          round: number
          status?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          denial_reasons?: string[] | null
          engagement_id?: string
          id?: string
          links?: string[]
          note?: string | null
          reminded_1d_at?: string | null
          reminded_3d_at?: string | null
          review_deadline_at?: string
          round?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: false
            referencedRelation: "engagements"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_links: {
        Row: {
          billable_clicks: number
          business_id: string
          campaign_id: string
          code: string
          created_at: string
          creator_id: string
          engagement_id: string
          id: string
          total_hits: number
        }
        Insert: {
          billable_clicks?: number
          business_id: string
          campaign_id: string
          code: string
          created_at?: string
          creator_id: string
          engagement_id: string
          id?: string
          total_hits?: number
        }
        Update: {
          billable_clicks?: number
          business_id?: string
          campaign_id?: string
          code?: string
          created_at?: string
          creator_id?: string
          engagement_id?: string
          id?: string
          total_hits?: number
        }
        Relationships: [
          {
            foreignKeyName: "tracked_links_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_links_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_links_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracked_links_engagement_id_fkey"
            columns: ["engagement_id"]
            isOneToOne: true
            referencedRelation: "engagements"
            referencedColumns: ["id"]
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
          cover_version: number | null
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
      accept_submission: { Args: { engagement: string }; Returns: string }
      active_strike_count: { Args: { person: string }; Returns: number }
      add_dispute_statement: {
        Args: {
          body: string
          dispute: string
          file_ids: string[]
          links: string[]
        }
        Returns: string
      }
      admin_engagement_trail: { Args: { engagement: string }; Returns: Json }
      admin_ledger: {
        Args: {
          engagement: string
          event_type: string
          from_date: string
          person: string
          row_limit: number
          row_offset: number
          to_date: string
        }
        Returns: Json
      }
      all_distinct: { Args: { items: string[] }; Returns: boolean }
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
      approve_application_at_rate: {
        Args: {
          application: string
          expected_cpc_kobo: number
          expected_price_kobo: number
        }
        Returns: string
      }
      approve_payout: { Args: { payout: string }; Returns: Json }
      audit_name: { Args: { person: string }; Returns: string }
      block_user: { Args: { other: string }; Returns: undefined }
      call_send_emails_route: { Args: never; Returns: undefined }
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
      campaign_click_results: { Args: { campaign: string }; Returns: Json }
      campaign_click_summary: { Args: { campaign: string }; Returns: Json }
      campaign_problems: {
        Args: { campaign: string; creator: string }
        Returns: Json
      }
      cancel_engagement: { Args: { engagement: string }; Returns: undefined }
      cancel_funded_engagement: {
        Args: { engagement: string; fee_notice_seen: boolean }
        Returns: undefined
      }
      check_standing: { Args: { person: string }; Returns: undefined }
      claim_due_emails: {
        Args: { max: number }
        Returns: {
          attempts: number
          data: Json
          email: string
          email_applications: boolean
          email_campaigns: boolean
          email_messages: boolean
          id: string
          kind: string
          occurred_at: string
          read_at: string
          role: string
        }[]
      }
      clean_note: { Args: { note: string }; Returns: string }
      clean_reason: { Args: { reason: string }; Returns: string }
      clear_cover: {
        Args: { creator: string; reason: string }
        Returns: number
      }
      click_settles_at: { Args: { deliver_by: string }; Returns: string }
      click_window_end: { Args: { deliver_by: string }; Returns: string }
      click_window_open: {
        Args: { at: string; deliver_by: string }
        Returns: boolean
      }
      consume_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      contact_detail_kind: { Args: { body: string }; Returns: string }
      count_qualifying_creators: { Args: { campaign: string }; Returns: number }
      create_app_user: {
        Args: { requested_role: Database["public"]["Enums"]["user_role"] }
        Returns: string
      }
      creator_completed_jobs: { Args: { creator: string }; Returns: number }
      creator_platforms_json: {
        Args: { creator: string; with_handles: boolean }
        Returns: Json
      }
      creator_portfolio: {
        Args: { creator_slug: string }
        Returns: {
          caption: string
          id: string
          image_version: number
          platform: Database["public"]["Enums"]["social_platform"]
          position: number
          post_url: string
        }[]
      }
      creator_wallet_summary: {
        Args: { person: string }
        Returns: {
          earned_kobo: number
          fee_kobo: number
          other_kobo: number
          payouts_kobo: number
        }[]
      }
      current_fee_config: {
        Args: never
        Returns: {
          business_fee_bps: number
          created_at: string
          creator_fee_bps: number
          id: string
          min_fee_kobo: number
          min_payout_kobo: number
          paystack_rate: Json
          transfer_fee_tiers: Json
          transfer_stamp_duty_from_kobo: number
          transfer_stamp_duty_kobo: number
        }
        SetofOptions: {
          from: "*"
          to: "fee_config"
          isOneToOne: true
          isSetofReturn: false
        }
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
      decide_dispute: {
        Args: {
          dispute: string
          outcome: string
          reason: string
          release_kobo: number
        }
        Returns: undefined
      }
      delete_orphan_proof_files: { Args: never; Returns: string[] }
      deliverable_kind_allowed: {
        Args: {
          kind: Database["public"]["Enums"]["deliverable_kind"]
          on_platform: Database["public"]["Enums"]["social_platform"]
        }
        Returns: boolean
      }
      deny_submission: {
        Args: { engagement: string; reasons: string[] }
        Returns: string
      }
      destination_host: { Args: { url: string }; Returns: string }
      display_name_of: { Args: { person: string }; Returns: string }
      edit_application: {
        Args: { application: string; note: string; proposed_price_kobo: number }
        Returns: undefined
      }
      engagement_click_summary: { Args: { engagement: string }; Returns: Json }
      engagement_details: { Args: { engagement: string }; Returns: Json }
      engagement_json: {
        Args: { e: Database["public"]["Tables"]["engagements"]["Row"] }
        Returns: Json
      }
      engagement_lapsed: {
        Args: { e: Database["public"]["Tables"]["engagements"]["Row"] }
        Returns: boolean
      }
      expire_unpaid_engagements: {
        Args: { campaign?: string }
        Returns: number
      }
      fee_kobo: {
        Args: { amount: number; bps: number; min_fee: number }
        Returns: number
      }
      finish_email: {
        Args: { notification: string; was_sent: boolean }
        Returns: undefined
      }
      finish_payout: {
        Args: {
          event_key: string
          outcome: string
          payload: Json
          reference: string
        }
        Returns: string
      }
      follower_range_for: {
        Args: { follower_count: number }
        Returns: Database["public"]["Enums"]["follower_range"]
      }
      fund_engagement: { Args: { payment: string }; Returns: boolean }
      get_campaign: { Args: { campaign: string }; Returns: Json }
      get_listed_creator: {
        Args: { creator_slug: string }
        Returns: {
          allow_indexing: boolean
          bio: string
          city: string
          completed_jobs: number
          cover_version: number
          details_visible: boolean
          display_name: string
          member_since: string
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
      hide_portfolio_sample: {
        Args: { reason: string; sample: string }
        Returns: undefined
      }
      hire_ended_unpaid: { Args: { application: string }; Returns: boolean }
      indexable_creators: {
        Args: never
        Returns: {
          slug: string
          updated_at: string
        }[]
      }
      is_blocked_between: { Args: { a: string; b: string }; Returns: boolean }
      is_participant: {
        Args: { conversation: string; person: string }
        Returns: boolean
      }
      is_suspended: { Args: { person: string }; Returns: boolean }
      lagos_today: { Args: never; Returns: string }
      ledger_event_rank: { Args: { event_type: string }; Returns: number }
      ledger_totals: { Args: never; Returns: Json }
      lift_suspension: {
        Args: { person: string; reason: string }
        Returns: undefined
      }
      link_summary: {
        Args: {
          k: Database["public"]["Tables"]["campaigns"]["Row"]
          link: Database["public"]["Tables"]["tracked_links"]["Row"]
        }
        Returns: Json
      }
      list_open_campaigns: {
        Args: {
          niche_slug?: string
          on_platform?: Database["public"]["Enums"]["social_platform"]
          page_offset?: number
          page_size?: number
          qualified_only?: boolean
          search?: string
        }
        Returns: {
          campaign: Json
          total_count: number
        }[]
      }
      mark_conversation_read: {
        Args: { conversation: string }
        Returns: undefined
      }
      mark_notifications_read: { Args: { ids?: string[] }; Returns: number }
      my_applications: { Args: never; Returns: Json }
      my_blocks: { Args: never; Returns: Json }
      my_conversations: { Args: never; Returns: Json }
      new_link_code: { Args: never; Returns: string }
      new_verification_code: { Args: never; Returns: string }
      non_delivery_dispute_at: {
        Args: { e: Database["public"]["Tables"]["engagements"]["Row"] }
        Returns: string
      }
      notify: {
        Args: {
          facts: Json
          key?: string
          person: string
          what: Database["public"]["Enums"]["notification_kind"]
        }
        Returns: undefined
      }
      open_campaign_count: { Args: never; Returns: number }
      open_dispute: {
        Args: {
          engagement: string
          file_ids: string[]
          links: string[]
          reason: string
        }
        Returns: string
      }
      pay_from_wallet: {
        Args: { engagement: string; fee_notice_seen: boolean }
        Returns: undefined
      }
      payment_in_flight: { Args: { engagement: string }; Returns: boolean }
      post_ledger_group: {
        Args: {
          actor: string
          config: string
          engagement: string
          event_type: string
          lines: Json
          payment: string
          payout: string
          reason: string
          reference: string
        }
        Returns: string
      }
      post_url_fits_platform: {
        Args: {
          on_platform: Database["public"]["Enums"]["social_platform"]
          url: string
        }
        Returns: boolean
      }
      reconciliation_figures: {
        Args: { paystack_balance_kobo: number; totals: Json }
        Returns: Json
      }
      record_card_payment: {
        Args: {
          event_key: string
          paid_kobo: number
          payload: Json
          paystack_fee_kobo: number
          reference: string
        }
        Returns: string
      }
      record_click: {
        Args: {
          client_class: string
          code: string
          referrer_host: string
          source: string
          ua_hash: string
          visitor_hash: string
        }
        Returns: Json
      }
      record_click_proof: {
        Args: {
          engagement: string
          file_ids: string[]
          links: string[]
          note: string
        }
        Returns: string
      }
      record_reconciliation: {
        Args: { paystack_balance_kobo: number }
        Returns: Json
      }
      record_strike: {
        Args: { dedupe: string; detail: string; flag: string; person: string }
        Returns: Json
      }
      register_proof_file: {
        Args: {
          bytes: number
          content_type: string
          owner: string
          path: string
        }
        Returns: string
      }
      reject_payout: {
        Args: { payout: string; reason: string }
        Returns: undefined
      }
      relax_standing: { Args: { person: string }; Returns: undefined }
      release_if_overdue: {
        Args: { e: Database["public"]["Tables"]["engagements"]["Row"] }
        Returns: boolean
      }
      release_overdue_submissions: {
        Args: never
        Returns: {
          failed: number
          released: number
        }[]
      }
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
      request_payout: { Args: { amount_kobo: number }; Returns: string }
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
      save_bank_account: {
        Args: {
          account_name: string
          bank_code: string
          bank_name: string
          last4: string
          recipient_code: string
        }
        Returns: undefined
      }
      save_bank_account_for: {
        Args: {
          account_name: string
          bank_code: string
          bank_name: string
          last4: string
          person: string
          recipient_code: string
        }
        Returns: undefined
      }
      save_campaign_draft: {
        Args: {
          applications_close_on: string
          blocked_channels?: string[]
          brief: string
          campaign_id: string
          cpc_kobo?: number
          deliver_by: string
          deliverables: Json
          destination_url?: string
          guidelines: string
          niches: string[]
          payment_model?: Database["public"]["Enums"]["payment_model"]
          places: number
          platforms: Json
          post_from: string
          price_kobo: number
          states: string[]
          title: string
          utm_tags?: boolean
          verified_only: boolean
        }
        Returns: string
      }
      save_email_preferences: {
        Args: { applications: boolean; campaigns: boolean; messages: boolean }
        Returns: undefined
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
          search?: string
          sort?: string
        }
        Returns: {
          bio: string
          city: string
          cover_version: number
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
      search_pattern: { Args: { words: string }; Returns: string }
      send_message: {
        Args: { body: string; conversation: string; dedupe: string }
        Returns: Json
      }
      send_review_reminders: { Args: never; Returns: number }
      set_application_rate: {
        Args: { application: string; rate_kobo: number }
        Returns: undefined
      }
      set_creator_hidden: {
        Args: { creator: string; reason: string }
        Returns: undefined
      }
      settle_click_hire: {
        Args: { actor: string; engagement: string; reason: string }
        Returns: boolean
      }
      settle_due_click_hires: { Args: never; Returns: Json }
      settle_engagement: {
        Args: {
          engagement: string
          outcome: string
          reason: string
          release_kobo: number
        }
        Returns: undefined
      }
      settle_engagement_internal: {
        Args: {
          actor: string
          engagement: string
          outcome: string
          reason: string
          release_kobo: number
          release_status?: Database["public"]["Enums"]["engagement_status"]
        }
        Returns: undefined
      }
      settle_money: {
        Args: {
          actor: string
          cancel_reason: string
          engagement: string
          fault: boolean
          new_status: Database["public"]["Enums"]["engagement_status"]
          outcome: string
          reason: string
          released: number
        }
        Returns: undefined
      }
      standing_problem: { Args: { person: string }; Returns: string }
      standing_review: { Args: never; Returns: Json }
      start_conversation: {
        Args: { application?: string; creator: string }
        Returns: string
      }
      start_engagement: { Args: { engagement: string }; Returns: undefined }
      start_payment: {
        Args: { engagement: string; fee_notice_seen: boolean }
        Returns: Json
      }
      submit_appeal: { Args: { message: string }; Returns: string }
      submit_handle_verification: {
        Args: { request_id: string }
        Returns: undefined
      }
      submit_work: {
        Args: {
          engagement: string
          file_ids: string[]
          links: string[]
          note: string
        }
        Returns: string
      }
      swap_portfolio_samples: {
        Args: { first_sample: string; second_sample: string }
        Returns: undefined
      }
      transfer_fee_for: { Args: { amount_kobo: number }; Returns: number }
      transition_campaign: {
        Args: { action: string; campaign_id: string; note?: string }
        Returns: Database["public"]["Enums"]["campaign_status"]
      }
      unblock_user: { Args: { other: string }; Returns: undefined }
      unread_in: {
        Args: { conversation: string; person: string }
        Returns: number
      }
      unread_message_count: { Args: never; Returns: number }
      valid_proposed_price: { Args: { price: number }; Returns: boolean }
      viewer_sees_creator_details: { Args: never; Returns: boolean }
      void_strike: {
        Args: { reason: string; strike: string }
        Returns: undefined
      }
      wallet_balance: {
        Args: { kind: string; person: string }
        Returns: number
      }
      withdraw_application: {
        Args: { application: string }
        Returns: undefined
      }
      withdraw_dispute: { Args: { dispute: string }; Returns: undefined }
      withdraw_from_engagement: {
        Args: { engagement: string }
        Returns: undefined
      }
      write_dispute_statement: {
        Args: {
          author: string
          body: string
          dispute: string
          file_ids: string[]
          links: string[]
        }
        Returns: string
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
        | "portfolio_sample_hidden"
        | "cover_removed"
      notification_kind:
        | "application_received"
        | "application_updated"
        | "application_withdrawn"
        | "campaign_approved"
        | "campaign_sent_back"
        | "campaign_taken_down"
        | "application_shortlisted"
        | "application_hired"
        | "application_passed"
        | "hire_cancelled"
        | "verification_approved"
        | "verification_rejected"
        | "profile_hidden"
        | "profile_restored"
        | "hire_lapsed"
        | "new_message"
        | "appeal_answered"
        | "hire_funded"
        | "work_started"
        | "funded_hire_cancelled"
        | "engagement_settled"
        | "payout_paid"
        | "payout_failed"
        | "payout_rejected"
        | "payment_stranded"
        | "work_submitted"
        | "submission_denied"
        | "review_reminder"
        | "dispute_opened"
        | "dispute_statement"
        | "dispute_withdrawn"
        | "click_cap_reached"
        | "click_hold_started"
        | "clicks_stopped"
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
        "portfolio_sample_hidden",
        "cover_removed",
      ],
      notification_kind: [
        "application_received",
        "application_updated",
        "application_withdrawn",
        "campaign_approved",
        "campaign_sent_back",
        "campaign_taken_down",
        "application_shortlisted",
        "application_hired",
        "application_passed",
        "hire_cancelled",
        "verification_approved",
        "verification_rejected",
        "profile_hidden",
        "profile_restored",
        "hire_lapsed",
        "new_message",
        "appeal_answered",
        "hire_funded",
        "work_started",
        "funded_hire_cancelled",
        "engagement_settled",
        "payout_paid",
        "payout_failed",
        "payout_rejected",
        "payment_stranded",
        "work_submitted",
        "submission_denied",
        "review_reminder",
        "dispute_opened",
        "dispute_statement",
        "dispute_withdrawn",
        "click_cap_reached",
        "click_hold_started",
        "clicks_stopped",
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

