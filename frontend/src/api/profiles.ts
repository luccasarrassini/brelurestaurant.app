import { supabase } from '../lib/supabase'

export type Profile = {
  user_id: string
  name: string | null
}

export async function fetchProfilesByIds(userIds: string[]) {
  if (userIds.length === 0) {
    return { data: [] as Profile[], error: null }
  }
  return supabase.from('profiles').select('user_id,name').in('user_id', userIds)
}
