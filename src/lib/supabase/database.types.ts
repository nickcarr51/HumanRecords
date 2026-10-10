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
      album_artists: {
        Row: {
          album_id: string
          artist_id: string
          position: number
        }
        Insert: {
          album_id: string
          artist_id: string
          position: number
        }
        Update: {
          album_id?: string
          artist_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "album_artists_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
        ]
      }
      albums: {
        Row: {
          album_art_url: string | null
          created_at: string
          id: string
          title: string
        }
        Insert: {
          album_art_url?: string | null
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          album_art_url?: string | null
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: []
      }
      artists: {
        Row: {
          bio: string | null
          created_at: string
          id: string
          name: string
          profile_photo_url: string | null
          user_id: string | null
        }
        Insert: {
          bio?: string | null
          created_at?: string
          id?: string
          name: string
          profile_photo_url?: string | null
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          created_at?: string
          id?: string
          name?: string
          profile_photo_url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artists_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      downloads: {
        Row: {
          downloaded_at: string
          track_id: string
          user_id: string
        }
        Insert: {
          downloaded_at?: string
          track_id: string
          user_id: string
        }
        Update: {
          downloaded_at?: string
          track_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "downloads_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "downloads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string
          created_by: string | null
          token: string | null
          updated_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          token?: string | null
          updated_at?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          token?: string | null
          updated_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      r2_cleanup_queue: {
        Row: {
          cleaned_at: string | null
          id: string
          object_key: string
          queued_at: string
          reason: string
          source_id: string
          source_table: string
        }
        Insert: {
          cleaned_at?: string | null
          id?: string
          object_key: string
          queued_at?: string
          reason: string
          source_id: string
          source_table: string
        }
        Update: {
          cleaned_at?: string | null
          id?: string
          object_key?: string
          queued_at?: string
          reason?: string
          source_id?: string
          source_table?: string
        }
        Relationships: []
      }
      releases: {
        Row: {
          album_id: string | null
          archived_at: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["release_kind"]
          pinned: boolean
          sort_at: string
          track_id: string | null
        }
        Insert: {
          album_id?: string | null
          archived_at?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["release_kind"]
          pinned?: boolean
          sort_at: string
          track_id?: string | null
        }
        Update: {
          album_id?: string | null
          archived_at?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["release_kind"]
          pinned?: boolean
          sort_at?: string
          track_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "releases_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: true
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "releases_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: true
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_albums: {
        Row: {
          album_id: string
          position: number
          track_id: string
        }
        Insert: {
          album_id: string
          position: number
          track_id: string
        }
        Update: {
          album_id?: string
          position?: number
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_albums_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "track_albums_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      track_artists: {
        Row: {
          artist_id: string
          position: number
          track_id: string
        }
        Insert: {
          artist_id: string
          position: number
          track_id: string
        }
        Update: {
          artist_id?: string
          position?: number
          track_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "track_artists_artist_id_fkey"
            columns: ["artist_id"]
            isOneToOne: false
            referencedRelation: "artists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "track_artists_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      tracks: {
        Row: {
          archived_at: string | null
          audio_url: string
          created_at: string
          id: string
          play_count: number
          title: string
          track_art_url: string | null
        }
        Insert: {
          archived_at?: string | null
          audio_url: string
          created_at?: string
          id?: string
          play_count?: number
          title: string
          track_art_url?: string | null
        }
        Update: {
          archived_at?: string | null
          audio_url?: string
          created_at?: string
          id?: string
          play_count?: number
          title?: string
          track_art_url?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          id: string
          name: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          id: string
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_artist: { Args: { target: string }; Returns: undefined }
      admin_list_users: {
        Args: never
        Returns: {
          banned_until: string
          created_at: string
          email: string
          id: string
          invite_token: string
          invite_used_at: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      admin_set_user_role: {
        Args: {
          new_role: Database["public"]["Enums"]["user_role"]
          target: string
        }
        Returns: undefined
      }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      increment_play_count: { Args: { p_track_id: string }; Returns: undefined }
      move_release: {
        Args: { direction: string; target: string }
        Returns: undefined
      }
      publish_release: { Args: { payload: Json }; Returns: string }
      resolve_artist_refs: { Args: { refs: Json }; Returns: string[] }
      search_feed: {
        Args: { q: string }
        Returns: {
          album_id: string | null
          archived_at: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["release_kind"]
          pinned: boolean
          sort_at: string
          track_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "releases"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      release_kind: "single" | "album"
      user_role: "listener" | "artist" | "label_member"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      release_kind: ["single", "album"],
      user_role: ["listener", "artist", "label_member"],
    },
  },
} as const

