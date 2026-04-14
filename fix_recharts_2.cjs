const fs = require('fs');
const p = require('path');
const src = p.join(process.cwd(), 'src');

['LogisticsDashboard.jsx', 'AccidentManagement.jsx', 'AccidentAnalyticsReport.jsx', 'AttendanceManagement.jsx'].forEach(f => {
    let raw = fs.readFileSync(p.join(src, f), 'utf8');
    if (!raw.includes("from 'recharts'")) {
        fs.writeFileSync(p.join(src, f), "import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, LineChart, Line, ComposedChart, Area, AreaChart } from 'recharts';\n" + raw);
    }
});
console.log('Fixed recharts directly');
