const fs = require('fs');
const p = require('path');
const src = p.join(process.cwd(), 'src');

let sidebar = fs.readFileSync(p.join(src, 'Sidebar.jsx'), 'utf8');
const match = sidebar.match(/export const MENU_DATA = \[[\s\S]*?\n    \];/);
if (match) {
    sidebar = sidebar.replace(match[0], '');
    let finalMenuData = match[0].replace(/^    /gm, ''); 
    sidebar = sidebar.replace('const Sidebar = ', finalMenuData + '\n\nconst Sidebar = ');
    fs.writeFileSync(p.join(src, 'Sidebar.jsx'), sidebar);
}

let header = fs.readFileSync(p.join(src, 'Header.jsx'), 'utf8');
if (!header.includes('import { MENU_DATA }')) {
    header = header.replace("import { supabase, adminSupabase } from './supabaseClient.js';", "import { supabase, adminSupabase } from './supabaseClient.js';\nimport { MENU_DATA } from './Sidebar.jsx';");
    fs.writeFileSync(p.join(src, 'Header.jsx'), header);
}
console.log('Fixed export and import');
