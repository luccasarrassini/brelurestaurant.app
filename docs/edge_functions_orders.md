# Edge Function: create-order

Goal: the frontend never inserts/updates orders or order_items directly.

## Contract (HTTP)
- Method: `POST`
- Path: `/functions/v1/create-order`
- Auth: `Authorization: Bearer <access_token>`
- Body (JSON):
  - `restaurant_id` (uuid)
  - `items`: array of `{ product_id, quantity, notes? }`
  - `source` (optional): `public` | `pdv`
  - `customer` (optional): `{ id?, name?, phone?, phone_digits?, notes? }`
  - `delivery` (optional):
    - `type`: `delivery` | `pickup` | `dine_in`
    - `fee_cents` (optional)
    - `address_id` (optional)
    - `address` (optional): `{ postal_code, street, number, neighborhood, city, complement? }`
  - `payments` (optional): array of `{ method, amount_cents, change_cents? }`
  - `nf_requested` (optional boolean)
  - `order_notes` (optional string)

## Validations (server-side)
1. User must be authenticated (token -> `user_id`).
2. Restaurant must exist and be public/active.
3. Each product must belong to the restaurant and be active.
4. Quantities must be > 0.
5. Total is computed server-side from product prices and delivery fee.

## Response
- `201`: `{ order_id, total_cents, items[] }`
- `400/401/404`: error message

## Notes
- Use `service_role` key inside the Edge Function.
- Keep RLS on; service_role bypasses RLS.
- Frontend only calls the function; no direct `insert/update/delete` on orders/order_items.
