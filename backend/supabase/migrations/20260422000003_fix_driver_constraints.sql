-- Este script corrige a restrição (CHECK constraint) das colunas status e vehicle_type da tabela drivers
-- O erro 23514 estava ocorrendo porque o banco de dados estava configurado para aceitar
-- textos diferentes do que a aplicação estava mandando.

-- 1. Remove qualquer restrição antiga que possa estar bloqueando (caso a tabela tenha sido criada na mão antes)
ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_status_check;
ALTER TABLE drivers DROP CONSTRAINT IF EXISTS drivers_vehicle_type_check;

-- 2. Atualiza qualquer registro que possa ter sido salvo com a nomenclatura antiga,
-- para que não dê conflito ao recriarmos a regra. (Isto garante segurança em tabelas já em uso).
UPDATE drivers SET status = 'available' WHERE status NOT IN ('available', 'delivering', 'offline');
UPDATE drivers SET vehicle_type = 'moto' WHERE vehicle_type NOT IN ('moto', 'carro', 'bike');

-- 3. Adiciona a regra exata que o frontend necessita para gravar os dados
ALTER TABLE drivers ADD CONSTRAINT drivers_status_check CHECK (status IN ('available', 'delivering', 'offline'));
ALTER TABLE drivers ADD CONSTRAINT drivers_vehicle_type_check CHECK (vehicle_type IN ('moto', 'carro', 'bike'));

-- 4. Recarrega o cache do PostgREST apenas por precaução
NOTIFY pgrst, 'reload schema';
