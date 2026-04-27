CREATE TABLE IF NOT EXISTS public.order_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    change_cents INTEGER DEFAULT 0,
    method TEXT NOT NULL,
    status TEXT DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS e criar políticas básicas se necessário
ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura de pagamentos para usuários autenticados" 
ON public.order_payments 
FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Permitir inserção de pagamentos para a role service_role" 
ON public.order_payments 
FOR ALL 
USING (auth.role() = 'service_role');
