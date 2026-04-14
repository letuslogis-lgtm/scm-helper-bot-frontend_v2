const fs = require('fs');
const p = require('path');
const src = p.join(process.cwd(), 'src');

const filesToPatch = [
    'WorkerManagement.jsx',
    'UserManagement.jsx',
    'MyHome.jsx',
    'IssueList.jsx',
    'AttendanceManagement.jsx',
    'AccidentManagement.jsx',
    'SupportCenter.jsx',
    'DatabaseDictionary.jsx'
];

for (const file of filesToPatch) {
    const filePath = p.join(src, file);
    if (!fs.existsSync(filePath)) continue;

    let content = fs.readFileSync(filePath, 'utf8');

    // Replace max-w-[1600px] mx-auto
    content = content.replace(/max-w-\[1600px\] mx-auto/g, '');
    
    // Replace max-w-[1400px] mx-auto (for DatabaseDictionary)
    content = content.replace(/max-w-\[1400px\] mx-auto/g, 'w-full');

    // Replace max-w-5xl mx-auto (for SupportCenter)
    content = content.replace(/max-w-5xl mx-auto/g, 'w-full');

    // Clean up multiple spaces that might result
    content = content.replace(/  +/g, ' ');

    fs.writeFileSync(filePath, content);
    console.log(`Patched layout for ${file}`);
}
