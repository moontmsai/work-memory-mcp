const fs = require('fs');
const path = require('path');

function removeConsoleLogs(dir) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      removeConsoleLogs(filePath);
    } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
      let content = fs.readFileSync(filePath, 'utf8');
      let modified = false;
      
      // console.log, console.warn, console.error, console.info, console.debug 주석처리
      const patterns = [
        /^(\s*)console\.(log|warn|error|info|debug)\(/gm
      ];
      
      for (const pattern of patterns) {
        const newContent = content.replace(pattern, (match, indent, method) => {
          modified = true;
          return `${indent}// console.${method}( // JSON-RPC 간섭 방지`;
        });
        content = newContent;
      }
      
      if (modified) {
        fs.writeFileSync(filePath, content);
        console.log(`✅ Updated: ${filePath}`);
      }
    }
  }
}

// src 디렉토리의 모든 TypeScript 파일 처리
removeConsoleLogs(path.join(__dirname, 'src'));
console.log('🎉 All console logs have been commented out!');