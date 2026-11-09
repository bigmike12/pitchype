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
      users: {
        Row: {
          auth_user_id: string
          created_at: string
          email: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          email: string
          id?: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
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
      follower_range_for: {
        Args: { follower_count: number }
        Returns: Database["public"]["Enums"]["follower_range"]
      }
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
      indexable_creators: {
        Args: never
        Returns: {
          slug: string
          updated_at: string
        }[]
      }
      new_verification_code: { Args: never; Returns: string }
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
      resolve_profile_report: {
        Args: { report_id: string }
        Returns: undefined
      }
      review_handle_verification: {
        Args: { approve: boolean; follower_count?: number; request_id: string }
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
      submit_handle_verification: {
        Args: { request_id: string }
        Returns: undefined
      }
      viewer_sees_creator_details: { Args: never; Returns: boolean }
    }
    Enums: {
      follower_range: "1k_5k" | "5k_10k" | "10k_50k" | "50k_100k" | "100k_plus"
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
      follower_range: ["1k_5k", "5k_10k", "10k_50k", "50k_100k", "100k_plus"],
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

