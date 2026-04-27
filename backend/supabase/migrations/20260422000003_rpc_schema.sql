-- Execute this function to allow us to read the drivers columns temporarily
CREATE OR REPLACE FUNCTION get_drivers_schema()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_agg(json_build_object(
      'column_name', column_name,
      'data_type', data_type,
      'is_nullable', is_nullable,
      'column_default', column_default
  )) INTO result
  FROM information_schema.columns
  WHERE table_name = 'drivers';
  
  RETURN result;
END;
$$;
