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
      companies: {
        Row: {
          id: string
          created_at: string
          name: string
          address: string | null
          contact_info: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          name: string
          address?: string | null
          contact_info?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          name?: string
          address?: string | null
          contact_info?: string | null
        }
      }
      products: {
        Row: {
          id: string
          created_at: string
          company_id: string
          name: string
          unit_price: number
          unit: string // 'pk' | 'cs' | 'kg' etc
          yomigana: string
        }
        Insert: {
          id?: string
          created_at?: string
          company_id: string
          name: string
          unit_price?: number
          unit?: string
          yomigana?: string
        }
        Update: {
          id?: string
          created_at?: string
          company_id?: string
          name?: string
          unit_price?: number
          unit?: string
          yomigana?: string
        }
      }
      product_prices: {
        Row: {
          id: string
          product_id: string
          unit_price: number
          start_date: string
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          unit_price: number
          start_date: string
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          unit_price?: number
          start_date?: string
          created_at?: string
        }
      }
      staff: {
        Row: {
          id: string
          created_at: string
          name: string
          role: string | null // 'admin' | 'client'
          company_id: string | null // Linked Company for clients
          hourly_wage: number | null
          tax_category: string | null
          dependents: number
          base_salary: number | null
          pin: string | null
          note: string | null

          // Custom Allowances (3 slots)
          allowance1_name: string | null
          allowance1_value: number | null
          allowance2_name: string | null
          allowance2_value: number | null
          allowance3_name: string | null
          allowance3_value: number | null

          // Custom Deductions (2 slots)
          deduction1_name: string | null
          deduction1_value: number | null
          deduction2_name: string | null
          deduction2_value: number | null
        }
        Insert: {
          id?: string
          created_at?: string
          name: string
          role?: string | null
          company_id?: string | null
          dependents?: number
          base_salary?: number | null
          hourly_wage?: number | null
          pin?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          name?: string
          role?: string | null
          company_id?: string | null
          dependents?: number
          base_salary?: number | null
          hourly_wage?: number | null
          pin?: string | null
        }
      }
      timecards: {
        Row: {
          id: string
          created_at: string
          staff_id: string
          date: string // YYYY-MM-DD
          worked_hours: number
          clock_in: string | null
          clock_out: string | null
          break_minutes: number | null
          notes: string | null
        }
        Insert: {
          id?: string
          created_at?: string
          staff_id: string
          date: string
          worked_hours: number
          clock_in?: string | null
          clock_out?: string | null
          break_minutes?: number | null
          notes?: string | null
        }
        Update: {
          id?: string
          created_at?: string
          staff_id?: string
          date?: string
          worked_hours?: number
          clock_in?: string | null
          clock_out?: string | null
          break_minutes?: number | null
          notes?: string | null
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
          company_id: string
          created_by: string | null
          product_id: string
          quantity: number
          actual_quantity: number | null
          order_date: string
          status: string
        }
        Insert: {
          id?: string
          created_at?: string
          company_id: string
          created_by?: string | null
          product_id: string
          quantity?: number
          actual_quantity?: number | null
          order_date?: string
          status?: string
        }
        Update: {
          id?: string
          created_at?: string
          company_id?: string
          created_by?: string | null
          product_id?: string
          quantity?: number
          actual_quantity?: number | null
          order_date?: string
          status?: string
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
