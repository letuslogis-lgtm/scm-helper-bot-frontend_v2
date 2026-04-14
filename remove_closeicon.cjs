const fs = require('fs');
const path = require('path');
const src = path.join(process.cwd(), 'src');
fs.readdirSync(src).filter(f => f.endsWith('.jsx')).forEach(f => {
    let raw = fs.readFileSync(path.join(src, f), 'utf8');
    if (raw.includes('const CloseIcon =') && f !== 'SharedUI.jsx') {
        raw = raw.replace(/import\s+\{([^}]+)\}\s+from\s+['"]\.\/SharedUI\.jsx['"]/g, (match, words) => {
            let names = words.split(',').map(s => s.trim()).filter(n => n !== 'CloseIcon' && n !== '');
            if (names.length === 0) return '';
            return `import { ${names.join(', ')} } from './SharedUI.jsx';`;
        });
        fs.writeFileSync(path.join(src, f), raw);
    }
});
console.log('CloseIcon deduplication complete');
