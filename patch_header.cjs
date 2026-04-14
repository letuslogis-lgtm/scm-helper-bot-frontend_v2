const fs = require('fs');
const p = require('path');
const src = p.join(process.cwd(), 'src');

let sidebar = fs.readFileSync(p.join(src, 'Sidebar.jsx'), 'utf8');
sidebar = sidebar.replace(/const menuData = \[/, 'export const MENU_DATA = [');
sidebar = sidebar.replace(/menuData/g, 'MENU_DATA'); // catch menuData.map and menuData.flatMap
fs.writeFileSync(p.join(src, 'Sidebar.jsx'), sidebar);

let header = fs.readFileSync(p.join(src, 'Header.jsx'), 'utf8').replace(/\r\n/g, '\n');
const oldTitle = `    // 메뉴 이름 매칭 로직 업데이트
    const pageTitle =
        page === 'home' ? 'MY DASHBOARD' :
            page === 'dashboard' ? '특이사항 대시보드' :
                page === 'accident_dashboard' ? '사고분석 대시보드' :
                    page === 'accident_list' ? '사고분석 LIST' :
                        page === 'user_management' ? '사용자 관리' :
                            page === 'product_manager' ? 'ITEM DB 수동 업데이트' :
                                page === 'support' ? '지원센터' :
                                    page === 'attendance' ? '근무자 근태 관리' :
                                        '특이사항 LIST';`;

const newTitle = `    // 메뉴 데이터에서 동적 조회
    let pageTitle = '특이사항 LIST';
    MENU_DATA.forEach(menu => {
        if (menu.children) {
            const matchedChild = menu.children.find(child => child.id === page);
            if (matchedChild) {
                pageTitle = matchedChild.label;
            }
        }
    });`;

header = header.replace(oldTitle.replace(/\r\n/g, '\n'), newTitle);
fs.writeFileSync(p.join(src, 'Header.jsx'), header);
console.log('Applied dynamic header patches!');
