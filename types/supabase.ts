export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      staff: {
        Row: {
          id: string
          created_at: string
          name: string
          dependent_count: number
          base_salary: number | null
          // 他に必要なカラムがあれば追加
        }
        Insert: {
          id?: string
          created_at?: string
          name: string
          dependent_count?: number
          base_salary?: number | null
        }
        Update: {
          id?: string
          created_at?: string
          name?: string
          dependent_count?: number
          base_salary?: number | null
        }
      }
      timecards: {
        Row: {
          id: string
          created_at: string
          staff_id: string
          date: string // YYYY-MM-DD
          work_hours: number
          // 他に必要なカラム（休憩時間、残業など）
        }
        Insert: {
          id?: string
          created_at?: string
          staff_id: string
          date: string
          work_hours: number
        }
        Update: {
          id?: string
          created_at?: string
          staff_id?: string
          date?: string
          work_hours?: number
        }
      }
      m_items: {
        Row: {
          id: string
          created_at: string
          name: string
          pack_unit: string | null // "pk", "kg" etc
        }
        Insert: {
          id?: string
          created_at?: string
          name: string
          pack_unit?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          name?: string
          pack_unit?: string | null
        }
      }
      m_recipes: {
        Row: {
          id: string
          created_at: string
          item_id: string
          material_name: string
          coefficient: number // 原料係数
        }
        Insert: {
          id?: string
          created_at?: string
          item_id: string
          material_name: string
          coefficient: number
        }
        Update: {
          id?: string
          created_at?: string
          item_id?: string
          material_name?: string
          coefficient?: number
        }
      }
      orders: {
        Row: {
          id: string
          created_at: string
          date: string // YYYY-MM-DD
          client_name: string // 依頼先名
          item_id: string
          pack_count: number
        }
        Insert: {
          id?: string
          created_at?: string
          date: string
          client_name: string
          item_id: string
          pack_count: number
        }
        Update: {
          id?: string
          created_at?: string
          date?: string
          client_name?: string
          item_id?: string
          pack_count?: number
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
