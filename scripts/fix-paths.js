const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '../out');

function getAllHtmlFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            arrayOfFiles = getAllHtmlFiles(dirPath + "/" + file, arrayOfFiles);
        } else {
            if (file.endsWith('.html')) {
                arrayOfFiles.push(path.join(dirPath, "/", file));
            }
        }
    });

    return arrayOfFiles;
}

try {
    const htmlFiles = getAllHtmlFiles(outDir);

    htmlFiles.forEach(file => {
        let content = fs.readFileSync(file, 'utf8');

        // Replace absolute paths with relative paths
        // 1. href="/_next -> href="./_next
        // 2. src="/_next -> src="./_next
        // 3. Simple replace for robust matching in App Router output
        content = content.replace(/href="\/_next/g, 'href="./_next');
        content = content.replace(/src="\/_next/g, 'src="./_next');
        content = content.replace(/href="\/file.svg"/g, 'href="./file.svg"'); // Handle static assets if specific

        // Generic replace for assets
        content = content.replace(/(href|src)="\//g, '$1="./');

        fs.writeFileSync(file, content);
        console.log(`Fixed paths in: ${path.basename(file)}`);
    });

    console.log("✅ Electron static export paths fixed.");
} catch (e) {
    console.log("⚠️ No HTML files found or error fixing paths:", e.message);
}
