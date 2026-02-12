const fs = require('fs');
const path = require('path');

const fontPath = path.join(__dirname, 'public', 'fonts', 'NotoSansJP-Regular.ttf');
const outputPath = path.join(__dirname, 'utils', 'fontData.ts');

try {
    if (!fs.existsSync(fontPath)) {
        console.error('Font file not found at:', fontPath);
        process.exit(1);
    }

    const fontBuffer = fs.readFileSync(fontPath);
    const base64Font = fontBuffer.toString('base64');

    const content = `// Embedded NotoSansJP-Regular font data (Base64)
// This ensures zero runtime dependencies for font loading.
export const NOTO_SANS_JP_BASE64 = '${base64Font}';
`;

    fs.writeFileSync(outputPath, content);
    console.log('Successfully generated utils/fontData.ts');
} catch (error) {
    console.error('Error generating font data:', error);
    process.exit(1);
}
