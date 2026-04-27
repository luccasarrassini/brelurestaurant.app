# Test Plan: Edge Function Orders

## Setup (isolated test project)
1. Create a separate Supabase project for tests.
2. Apply schema from `docs/supabase_schema.sql`.
3. Create three auth users:
   - Client user
   - Owner/admin user
   - Other client user
4. Replace user IDs in `docs/test_seed.sql`, then run it using service_role.

## A) Pedido valido
1. Login como cliente.
2. Chamar `create-order` com:
   - `restaurant_id`: publico
   - Itens ativos, estoque suficiente
3. Verificar:
   - Retorno: `order_id`, `total_cents`, resumo correto.
   - `orders` criado com `customer_id` correto.
   - `order_items` criado com snapshots corretos.
   - Estoque decrementado corretamente.
4. Login como outro cliente:
   - Nao deve ver pedidos do primeiro cliente.

## B) Pedido invalido
1. Produto inativo -> deve falhar.
2. Produto de outro restaurante -> deve falhar.
3. Quantidade maior que estoque -> deve falhar.
4. Restaurante privado -> deve falhar.
5. Cliente nao autenticado -> deve falhar.
6. Confirmar:
   - Nenhum `orders` criado.
   - Nenhum `order_items` criado.
   - Estoque inalterado.

## C) Leitura e atualizacao
1. Login como owner/admin:
   - Consegue ler pedidos do seu restaurante.
   - Atualiza status (via backend ou SQL com service_role).
2. Tentar atualizar pedidos de outro restaurante:
   - Deve falhar por RLS.
3. Cliente:
   - Enxerga apenas os seus pedidos.
