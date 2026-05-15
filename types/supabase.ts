export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          github_id: string;
          github_login: string;
          email: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          github_id: string;
          github_login: string;
          email?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          github_id?: string;
          github_login?: string;
          email?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      repositories: {
        Row: {
          id: string;
          user_id: string;
          owner: string;
          name: string;
          default_branch: string;
          commit_hash: string | null;
          description: string | null;
          stars: number;
          language: string | null;
          indexed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          owner: string;
          name: string;
          default_branch: string;
          commit_hash?: string | null;
          description?: string | null;
          stars?: number;
          language?: string | null;
          indexed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          owner?: string;
          name?: string;
          default_branch?: string;
          commit_hash?: string | null;
          description?: string | null;
          stars?: number;
          language?: string | null;
          indexed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      files: {
        Row: {
          id: string;
          repo_id: string;
          path: string;
          size_bytes: number;
          language: string | null;
          chunk_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          repo_id: string;
          path: string;
          size_bytes?: number;
          language?: string | null;
          chunk_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          repo_id?: string;
          path?: string;
          size_bytes?: number;
          language?: string | null;
          chunk_count?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      chunks: {
        Row: {
          id: number;
          repo_id: string;
          file_id: string;
          file_path: string;
          chunk_index: number;
          chunk_text: string;
          embedding: number[] | null;
          token_count: number;
          created_at: string;
        };
        Insert: {
          id?: number;
          repo_id: string;
          file_id: string;
          file_path: string;
          chunk_index: number;
          chunk_text: string;
          embedding?: number[] | null;
          token_count?: number;
          created_at?: string;
        };
        Update: {
          id?: number;
          repo_id?: string;
          file_id?: string;
          file_path?: string;
          chunk_index?: number;
          chunk_text?: string;
          embedding?: number[] | null;
          token_count?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      chats: {
        Row: {
          id: string;
          user_id: string;
          repo_id: string | null;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          repo_id?: string | null;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          repo_id?: string | null;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          chat_id: string;
          role: string;
          content: string;
          cited_files: string[];
          token_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          chat_id: string;
          role: string;
          content: string;
          cited_files?: string[];
          token_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          chat_id?: string;
          role?: string;
          content?: string;
          cited_files?: string[];
          token_count?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      indexing_jobs: {
        Row: {
          id: string;
          repo_id: string;
          user_id: string;
          status: "pending" | "indexing" | "completed" | "failed";
          total_files: number;
          processed_files: number;
          total_chunks: number;
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          repo_id: string;
          user_id: string;
          status?: "pending" | "indexing" | "completed" | "failed";
          total_files?: number;
          processed_files?: number;
          total_chunks?: number;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          repo_id?: string;
          user_id?: string;
          status?: "pending" | "indexing" | "completed" | "failed";
          total_files?: number;
          processed_files?: number;
          total_chunks?: number;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      match_chunks: {
        Args: {
          query_embedding: number[];
          target_repo_id: string;
          match_count: number;
        };
        Returns: {
          id: number;
          file_path: string;
          chunk_text: string;
          chunk_index: number;
          similarity: number;
        }[];
      };
      keyword_search_chunks: {
        Args: {
          query_text: string;
          target_repo_id: string;
          match_count: number;
        };
        Returns: {
          id: number;
          file_path: string;
          chunk_text: string;
          chunk_index: number;
          rank: number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
