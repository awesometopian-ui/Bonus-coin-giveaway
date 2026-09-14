const supabase = require('../config/supabase');

async function getActiveGiveaway() {
  const { data, error } = await supabase
    .from('giveaways')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

function publicStatus(giveaway) {
  if (!giveaway) return 'inactive';
  const now = Date.now();
  const start = giveaway.start_date ? new Date(giveaway.start_date).getTime() : null;
  const end = giveaway.end_date ? new Date(giveaway.end_date).getTime() : null;
  if (!giveaway.is_active) return end && now > end ? 'ended' : 'inactive';
  if (start && now < start) return 'upcoming';
  if (end && now > end) return 'ended';
  return 'active';
}

module.exports = { getActiveGiveaway, publicStatus };
      
