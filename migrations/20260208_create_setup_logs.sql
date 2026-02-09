-- Create setup_logs table for tracking preparation and cleanup time

CREATE TABLE IF NOT EXISTS public.setup_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    setup_type text NOT NULL CHECK (setup_type IN ('preparation', 'cleanup')),
    start_time timestamptz NOT NULL,
    end_time timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_setup_logs_order ON public.setup_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_setup_logs_type_time ON public.setup_logs(setup_type, start_time);

COMMENT ON TABLE public.setup_logs IS '準備時間・片付け時間の記録';
COMMENT ON COLUMN public.setup_logs.setup_type IS '種別: preparation (準備) or cleanup (片付け)';
COMMENT ON COLUMN public.setup_logs.start_time IS '開始時刻';
COMMENT ON COLUMN public.setup_logs.end_time IS '終了時刻（NULL = 進行中）';
