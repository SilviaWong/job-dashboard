const fs = require('fs');
const path = require('path');

const filesToPatch = [
  'node_modules/@prisma/adapter-d1/dist/index.js',
  'node_modules/@prisma/adapter-d1/dist/index.mjs'
];

filesToPatch.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Prisma adapter-d1 bug: The regex for ISO date doesn't have proper ^ and $ boundaries for the OR groups.
    // It causes any long JSON string containing an ISO date to be incorrectly inferred as a DateTime column.
    // Fix: We simply append a length check. Real ISO dates are less than 35 characters.
    if (content.includes('return isoDateRegex.test(str) || sqliteDateRegex.test(str);')) {
      content = content.replace(
        /return isoDateRegex\.test\(str\) \|\| sqliteDateRegex\.test\(str\);/g,
        'return (isoDateRegex.test(str) || sqliteDateRegex.test(str)) && str.length < 50;'
      );
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`[Patch] Successfully patched Prisma D1 Adapter date bug in ${file}`);
    }
  }
});
