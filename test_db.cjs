require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.log('No supabase credentials found in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: records, error } = await supabase.from('workers').select('*').limit(20);
  if (error) {
    console.error(error);
  } else {
    console.log("Workers DB Sample:");
    console.table(records.map(r => ({ name: r.name, type: r.employment_type, loc: r.work_location })));
  }
}
test();
