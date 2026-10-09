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
      aplicacion: {
        Row: {
          created_at: string
          dosis: number | null
          eliminado: boolean
          fecha: string
          grupo_frac: string
          id: string
          ingrediente_activo: string
          metodo: string
          observaciones: string
          producto: string
          rancho_id: string
          responsable: string
          server_updated_at: string
          tabla_ids: string[]
          unidad: string
          updated_at: string
          usuario_id: string | null
          volumen_mezcla: number | null
        }
        Insert: {
          created_at: string
          dosis?: number | null
          eliminado?: boolean
          fecha: string
          grupo_frac?: string
          id: string
          ingrediente_activo?: string
          metodo?: string
          observaciones?: string
          producto?: string
          rancho_id: string
          responsable?: string
          server_updated_at?: string
          tabla_ids?: string[]
          unidad?: string
          updated_at: string
          usuario_id?: string | null
          volumen_mezcla?: number | null
        }
        Update: {
          created_at?: string
          dosis?: number | null
          eliminado?: boolean
          fecha?: string
          grupo_frac?: string
          id?: string
          ingrediente_activo?: string
          metodo?: string
          observaciones?: string
          producto?: string
          rancho_id?: string
          responsable?: string
          server_updated_at?: string
          tabla_ids?: string[]
          unidad?: string
          updated_at?: string
          usuario_id?: string | null
          volumen_mezcla?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aplicacion_rancho_id_fkey"
            columns: ["rancho_id"]
            isOneToOne: false
            referencedRelation: "rancho"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aplicacion_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      clima_diario: {
        Row: {
          created_at: string
          eliminado: boolean
          fecha: string
          fuente: string
          horas_hr_alta: number | null
          hr_media: number | null
          id: string
          precipitacion: number | null
          rancho_id: string
          server_updated_at: string
          temp_max: number | null
          temp_media: number | null
          temp_min: number | null
          updated_at: string
        }
        Insert: {
          created_at: string
          eliminado?: boolean
          fecha: string
          fuente?: string
          horas_hr_alta?: number | null
          hr_media?: number | null
          id: string
          precipitacion?: number | null
          rancho_id: string
          server_updated_at?: string
          temp_max?: number | null
          temp_media?: number | null
          temp_min?: number | null
          updated_at: string
        }
        Update: {
          created_at?: string
          eliminado?: boolean
          fecha?: string
          fuente?: string
          horas_hr_alta?: number | null
          hr_media?: number | null
          id?: string
          precipitacion?: number | null
          rancho_id?: string
          server_updated_at?: string
          temp_max?: number | null
          temp_media?: number | null
          temp_min?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clima_diario_rancho_id_fkey"
            columns: ["rancho_id"]
            isOneToOne: false
            referencedRelation: "rancho"
            referencedColumns: ["id"]
          },
        ]
      }
      codigo_alta: {
        Row: {
          codigo: string
          creado_en: string
          usado_en: string | null
          usado_por: string | null
        }
        Insert: {
          codigo: string
          creado_en?: string
          usado_en?: string | null
          usado_por?: string | null
        }
        Update: {
          codigo?: string
          creado_en?: string
          usado_en?: string | null
          usado_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "codigo_alta_usado_por_fkey"
            columns: ["usado_por"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      cuenta_operador: {
        Row: {
          alias: string
          bloqueado_hasta: string | null
          bloqueado_permanente: boolean
          creado_en: string
          intentos_fallidos: number
          rancho_id: string
          ultima_sincronizacion: string | null
          usuario_id: string
        }
        Insert: {
          alias: string
          bloqueado_hasta?: string | null
          bloqueado_permanente?: boolean
          creado_en?: string
          intentos_fallidos?: number
          rancho_id: string
          ultima_sincronizacion?: string | null
          usuario_id: string
        }
        Update: {
          alias?: string
          bloqueado_hasta?: string | null
          bloqueado_permanente?: boolean
          creado_en?: string
          intentos_fallidos?: number
          rancho_id?: string
          ultima_sincronizacion?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuenta_operador_rancho_id_fkey"
            columns: ["rancho_id"]
            isOneToOne: false
            referencedRelation: "rancho"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuenta_operador_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluacion_tabla: {
        Row: {
          created_at: string
          eliminado: boolean
          hora_fin: string | null
          hora_inicio: string | null
          id: string
          rancho_id: string
          recorrido_id: string
          server_updated_at: string
          tabla_id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at: string
          eliminado?: boolean
          hora_fin?: string | null
          hora_inicio?: string | null
          id: string
          rancho_id: string
          recorrido_id: string
          server_updated_at?: string
          tabla_id: string
          tipo?: string
          updated_at: string
        }
        Update: {
          created_at?: string
          eliminado?: boolean
          hora_fin?: string | null
          hora_inicio?: string | null
          id?: string
          rancho_id?: string
          recorrido_id?: string
          server_updated_at?: string
          tabla_id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluacion_tabla_rancho_id_fkey"
            columns: ["rancho_id"]
            isOneToOne: false
            referencedRelation: "rancho"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluacion_tabla_recorrido_fk"
            columns: ["recorrido_id", "rancho_id"]
            isOneToOne: false
            referencedRelation: "recorrido"
            referencedColumns: ["id", "rancho_id"]
          },
          {
            foreignKeyName: "evaluacion_tabla_tabla_fk"
            columns: ["tabla_id", "rancho_id"]
            isOneToOne: false
            referencedRelation: "tabla"
            referencedColumns: ["id", "rancho_id"]
          },
        ]
      }
      hoja: {
        Row: {
          created_at: string
          eliminado: boolean
          grado_gauhl: number | null
          id: string
          numero_hoja: number
          planta_id: string
          rancho_id: string
          server_updated_at: string
          updated_at: string
        }
        Insert: {
          created_at: string
          eliminado?: boolean
          grado_gauhl?: number | null
          id: string
          numero_hoja: number
          planta_id: string
          rancho_id: string
          server_updated_at?: string
          updated_at: string
        }
        Update: {
          created_at?: string
          eliminado?: boolean
          grado_gauhl?: number | null
          id?: string
          numero_hoja?: number
          planta_id?: string
          rancho_id?: string
          server_updated_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hoja_planta_fk"
            columns: ["planta_id", "rancho_id"]
            isOneToOne: false
            referencedRelation: "planta"
            referencedColumns: ["id", "rancho_id"]
          },
          {
            foreignKeyName: "hoja_rancho_id_fkey"
            columns: ["rancho_id"]
            isOneToOne: false
            referencedRelation: "rancho"
            referencedColumns: ["id"]
          },
        ]
      }
      membresia: {
        Row: {
          activo: boolean
          created_at: string
          eliminado: boolean
          id: string
          rancho_id: string
          rol: string
          server_updated_at: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          activo?: boolean
          created_at: string
          eliminado?: boolean
          id: string
          rancho_id: string
          rol: string
          server_updated_at?: string
          updated_at: string
          usuario_id: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          eliminado?: boolean
          id?: string
          rancho_id?: string
          rol?: string
          server_updated_at?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membresia_rancho_id_fkey"
            columns: ["rancho_id"]
            isOneToOne: false
            referencedRelation: "rancho"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membresia_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      planta: {
        Row: {
          created_at: string
          eliminado: boolean
          evaluacion_tabla_id: string
          gps_lat: number | null
          gps_lon: number | null
          gps_precision_m: number | null
          hmj_estria: number | null
          hmj_mancha: number | null
          hmj_pizca: number | null
          id: string
          numero_planta: number
          observaciones: string
          rancho_id: string
          server_updated_at: string
          total_hojas: number
          updated_at: string
        }
        Insert: {
          created_at: string
          eliminado?: boolean
          evaluacion_tabla_id: string
          gps_lat?: number | null
          gps_lon?: number | null
          gps_precision_m?: number | null
          hmj_estria?: number | null
          hmj_mancha?: number | null
          hmj_pizca?: number | null
          id: string
          numero_planta: number
          observaciones?: string
          rancho_id: string
          server_updated_at?: string
          total_hojas: number
          updated_at: string
        }
        Update: {
          created_at?: string
          eliminado?: boolean
          evaluacion_tabla_id?: string
          gps_lat?: number | null
          gps_lon?: number | null
          gps_precision_m?: number | null
          hmj_estria?: number | null
          hmj_mancha?: number | null
          hmj_pizca?: number | null
          id?: string
          numero_planta?: number
          observaciones?: string
          rancho_id?: string
          server_updated_at?: string
          total_hojas?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planta_evaluacion_fk"
            columns: ["evaluacion_tabla_id", "rancho_id"]
            isOneToOne: false
            referencedRelation: "evaluacion_tabla"
            referencedColumns: ["id", "rancho_id"]
          },
          {
            foreignKeyName: "planta_rancho_id_fkey"
            columns: ["rancho_id"]
            isOneToOne: false
            referencedRelation: "rancho"
            referencedColumns: ["id"]
          },
        ]
      }
      planta_marcada: {
        Row: {
          created_at: string
          eliminado: boolean
          fecha_marcado: string
          id: string
          rancho_id: string
          server_updated_at: string
          tabla_id: string
          updated_at: string
        }
        Insert: {
          created_at: string
          eliminado?: boolean
          fecha_marcado: string
          id: string
          rancho_id: string
          server_updated_at?: string
          tabla_id: string
          updated_at: string
        }
        Update: {
          created_at?: string
          eliminado?: boolean
          fecha_marcado?: string
          id?: string
          rancho_id?: string
          server_updated_at?: string
          tabla_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planta_marcada_rancho_id_fkey"
            columns: ["rancho_id"]
            isOneToOne: false
            referencedRelation: "rancho"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planta_marcada_tabla_fk"
            columns: ["tabla_id", "rancho_id"]
            isOneToOne: false
            referencedRelation: "tabla"
            referencedColumns: ["id", "rancho_id"]
          },
        ]
      }
      rancho: {
        Row: {
          codigo: string
          created_at: string
          dias_alerta_aplicacion: number
          eliminado: boolean
          id: string
          ii_umbral_alto: number
          ii_umbral_medio: number
          lat: number | null
          lon: number | null
          nombre: string
          server_updated_at: string
          updated_at: string
        }
        Insert: {
          codigo?: string
          created_at: string
          dias_alerta_aplicacion?: number
          eliminado?: boolean
          id?: string
          ii_umbral_alto?: number
          ii_umbral_medio?: number
          lat?: number | null
          lon?: number | null
          nombre: string
          server_updated_at?: string
          updated_at: string
        }
        Update: {
          codigo?: string
          created_at?: string
          dias_alerta_aplicacion?: number
          eliminado?: boolean
          id?: string
          ii_umbral_alto?: number
          ii_umbral_medio?: number
          lat?: number | null
          lon?: number | null
          nombre?: string
          server_updated_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      recorrido: {
        Row: {
          created_at: string
          eliminado: boolean
          estado: string
          fecha: string
          id: string
          rancho_id: string
          semana_iso: string
          server_updated_at: string
          updated_at: string
          usuario_id: string
        }
        Insert: {
          created_at: string
          eliminado?: boolean
          estado?: string
          fecha: string
          id: string
          rancho_id: string
          semana_iso: string
          server_updated_at?: string
          updated_at: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          eliminado?: boolean
          estado?: string
          fecha?: string
          id?: string
          rancho_id?: string
          semana_iso?: string
          server_updated_at?: string
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recorrido_rancho_id_fkey"
            columns: ["rancho_id"]
            isOneToOne: false
            referencedRelation: "rancho"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recorrido_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuario"
            referencedColumns: ["id"]
          },
        ]
      }
      tabla: {
        Row: {
          activa: boolean
          codigo: string
          created_at: string
          eliminado: boolean
          geometria: Json | null
          id: string
          nombre: string
          origen: string
          rancho_id: string
          server_updated_at: string
          superficie_ha: number | null
          updated_at: string
          variedad: string
        }
        Insert: {
          activa?: boolean
          codigo: string
          created_at: string
          eliminado?: boolean
          geometria?: Json | null
          id: string
          nombre?: string
          origen?: string
          rancho_id: string
          server_updated_at?: string
          superficie_ha?: number | null
          updated_at: string
          variedad?: string
        }
        Update: {
          activa?: boolean
          codigo?: string
          created_at?: string
          eliminado?: boolean
          geometria?: Json | null
          id?: string
          nombre?: string
          origen?: string
          rancho_id?: string
          server_updated_at?: string
          superficie_ha?: number | null
          updated_at?: string
          variedad?: string
        }
        Relationships: [
          {
            foreignKeyName: "tabla_rancho_id_fkey"
            columns: ["rancho_id"]
            isOneToOne: false
            referencedRelation: "rancho"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario: {
        Row: {
          created_at: string
          eliminado: boolean
          email: string
          id: string
          nombre: string
          server_updated_at: string
          updated_at: string
        }
        Insert: {
          created_at: string
          eliminado?: boolean
          email?: string
          id: string
          nombre?: string
          server_updated_at?: string
          updated_at: string
        }
        Update: {
          created_at?: string
          eliminado?: boolean
          email?: string
          id?: string
          nombre?: string
          server_updated_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aplicar_cambios: { Args: { lote: Json }; Returns: Json }
      comparte_rancho_con: { Args: { p_usuario_id: string }; Returns: boolean }
      crear_rancho: {
        Args: {
          p_codigo_alta?: string
          p_lat?: number
          p_lon?: number
          p_nombre: string
        }
        Returns: string
      }
      es_miembro: { Args: { p_rancho_id: string }; Returns: boolean }
      mi_estado: {
        Args: never
        Returns: {
          activo: boolean
          rancho_id: string
          rol: string
        }[]
      }
      registrar_intento_fallido_operador: {
        Args: { p_usuario_id: string }
        Returns: {
          bloqueado_hasta: string
          bloqueado_permanente: boolean
          intentos_fallidos: number
        }[]
      }
      reiniciar_intentos_operador: {
        Args: { p_usuario_id: string }
        Returns: undefined
      }
      rol_en: { Args: { p_rancho_id: string }; Returns: string }
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
    Enums: {},
  },
} as const

