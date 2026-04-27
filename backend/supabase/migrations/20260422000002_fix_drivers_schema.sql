-- Este script ajusta a tabela drivers para garantir que o upsert funcione.
-- O erro 400 Bad Request em um UPSERT (criação/atualização) no Supabase geralmente
-- ocorre quando a tabela não tem uma Chave Primária (Primary Key), ou quando a coluna 'id'
-- não tem um valor padrão (DEFAULT gen_random_uuid()) e tentamos salvar sem enviar um 'id',
-- ou até mesmo por conta de um cache desatualizado da API (PostgREST).

-- 1. Tentar garantir que a coluna id gere UUIDs automaticamente
ALTER TABLE drivers ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- 2. Garantir que a tabela tenha uma Chave Primária (Primary Key) que é exigida pelo Upsert
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE table_name = 'drivers'
        AND constraint_type = 'PRIMARY KEY'
    ) THEN
        ALTER TABLE drivers ADD PRIMARY KEY (id);
    END IF;
END $$;

-- 3. Recarregar o cache do schema do Supabase (para que a API reconheça as mudanças imediatamente)
NOTIFY pgrst, 'reload schema';
